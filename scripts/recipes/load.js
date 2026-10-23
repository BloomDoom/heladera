// Loads scripts/recipes/out/ (made by build.js) into Supabase.
//
//   node --env-file=.env.local scripts/recipes/load.js
//
// .env.local (git-ignored) needs VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY
// (Project Settings → API Keys → secret). The secret key skips Row Level
// Security: it only lives on this computer, never in the app or the repo.
//
// Run after supabase/migrations/2026-10-27-cocina.sql (products may be stored in freezer); rebuild out/ with build.js first.
//
// Safe to run again: products and recipes are matched by code/source_key,
// each recipe's ingredients are replaced, and base recipes that are no
// longer in out/recipes.json are deleted.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const productRow = (p) => ({
  code: p.code, name: p.name, category: p.category, storage: p.storage,
  shelf_days: p.shelf_days, assumed: p.assumed, synonyms: p.synonyms,
})

export const recipeRow = (r) => ({
  source_key: r.sourceKey, title: r.title, minutes: r.minutes, servings: r.servings,
  difficulty: r.difficulty, country: r.country, steps: r.steps, source: r.source, source_url: r.url,
})

export const ingredientRows = (recipes, productIds, recipeIds) =>
  recipes.flatMap((r) => r.ingredients.map((i) => ({
    recipe_id: recipeIds.get(r.sourceKey), product_id: productIds.get(i.code), line: i.line, is_main: i.isMain,
  })))

// Recipes or products the database didn't give an id for. Checked before
// deleting anything, so a bad load stops while the old data is intact.
export const missingIds = (recipes, productIds, recipeIds) => [
  ...recipes.filter((r) => !recipeIds.has(r.sourceKey)).map((r) => `recipe ${r.sourceKey}`),
  ...[...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.code)))]
    .filter((code) => !productIds.has(code)).map((code) => `product ${code}`),
]

const chunks =(list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

async function check(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

// Supabase returns at most 1,000 rows per request, so read in pages.
async function readAll(db, table, columns, filter) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const page = await check(filter(db.from(table).select(columns)).order('id').range(from, from + 999))
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function main() {
  const out = join(import.meta.dirname, 'out')
  const products = JSON.parse(readFileSync(join(out, 'products.json'), 'utf8'))
  const recipes = JSON.parse(readFileSync(join(out, 'recipes.json'), 'utf8'))
  const { VITE_SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = process.env
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
  const db = createClient(url, key, { db: { schema: 'heladera' }, auth: { persistSession: false } })

  for (const batch of chunks(products.map(productRow), 500)) {
    await check(db.from('products').upsert(batch, { onConflict: 'code' }))
  }
  const productIds = new Map((await readAll(db, 'products', 'id, code', (q) => q.not('code', 'is', null)))
    .map((p) => [p.code, p.id]))

  for (const batch of chunks(recipes.map(recipeRow), 500)) {
    await check(db.from('recipes').upsert(batch, { onConflict: 'source_key' }))
  }
  const base = await readAll(db, 'recipes', 'id, source_key', (q) => q.not('source_key', 'is', null))
  const recipeIds = new Map(base.map((r) => [r.source_key, r.id]))
  const missing = missingIds(recipes, productIds, recipeIds)
  if (missing.length) throw new Error(`No id for: ${missing.slice(0, 10).join(', ')} (${missing.length} in all)`)

  // Base recipes that the build no longer keeps.
  const keep = new Set(recipes.map((r) => r.sourceKey))
  const stale = base.filter((r) => !keep.has(r.source_key)).map((r) => r.id)
  for (const batch of chunks(stale, 500)) await check(db.from('recipes').delete().in('id', batch))

  const loadedIds = recipes.map((r) => recipeIds.get(r.sourceKey))
  for (const batch of chunks(loadedIds, 500)) await check(db.from('recipe_ingredients').delete().in('recipe_id', batch))
  const rows = ingredientRows(recipes, productIds, recipeIds)
  for (const batch of chunks(rows, 1000)) await check(db.from('recipe_ingredients').insert(batch))

  console.log(`products: ${productIds.size}, recipes: ${recipes.length} (deleted ${stale.length} old), ingredients: ${rows.length}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    // Recipes may have lost some ingredients halfway: loading again fixes it.
    console.error('\nThe load did not finish. Run load.js again before using the app.')
    process.exit(1)
  })
}

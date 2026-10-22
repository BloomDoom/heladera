import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'
import { loadFridge } from './fridge.js'
import { addDays } from './format.js'
import { effectiveAssumed } from './products.js'

const PAGE = 1000 // PostgREST never returns more than this per request

// The RPC read page by page, so a big catalog is never cut at 1,000 rows.
async function readCandidates() {
  const all = []
  for (let from = 0; ; from += PAGE) {
    const page = await unwrap(supabase.rpc('recipe_candidates').range(from, from + PAGE - 1))
    all.push(...page)
    if (page.length < PAGE) return all
  }
}

// Every recipe's id, title and minutes, page by page (there are ~3,000).
async function readRecipeTitles() {
  const all = []
  for (let from = 0; ; from += PAGE) {
    const page = await unwrap(
      supabase.from('recipes').select('id, title, minutes').order('id').range(from, from + PAGE - 1),
    )
    all.push(...page)
    if (page.length < PAGE) return all
  }
}

// What "Buscar receta" needs: every recipe, and the ids of the ones the
// household can make with what it has (they go first in the results).
export async function loadRecipeSearch() {
  const [recipes, candidates] = await Promise.all([readRecipeTitles(), readCandidates()])
  return { recipes, makeableIds: new Set(candidates.map((c) => c.recipe_id)) }
}

// Everything the "Hoy" screen needs, loaded in parallel: the recipes that can
// be cooked (or almost), the fridge, the last 180 days of cooked dishes and
// the last 14 days of skipped ones.
export async function loadSuggestionsData(today) {
  const [candidates, items, cooked, rejections] = await Promise.all([
    readCandidates(),
    loadFridge(),
    unwrap(
      supabase.from('cooked').select('recipe_id, cooked_on').gte('cooked_on', addDays(today, -180)),
    ),
    unwrap(
      supabase
        .from('rejections')
        .select('recipe_id, rejected_on')
        .gte('rejected_on', addDays(today, -14)),
    ),
  ])
  return { candidates, items, cooked, rejections }
}

// "Otro plato": remembers that this household skipped the recipe today.
export async function rejectRecipe(householdId, recipeId, today) {
  return unwrap(
    supabase.from('rejections').insert({ household_id: householdId, recipe_id: recipeId, rejected_on: today }),
  )
}

// One recipe with its ingredients (and the product behind each one, if any).
export async function loadRecipe(id) {
  return unwrap(
    supabase
      .from('recipes')
      .select(
        'id, title, minutes, servings, steps, source, source_url, ingredients:recipe_ingredients(line, is_main, product_id, product:products(name))',
      )
      .eq('id', id)
      .single(),
  )
}

// "Lo cocinamos": records the dish as cooked today. Returns the new row ({ id }).
export async function markCooked(householdId, recipeId, today) {
  return unwrap(
    supabase
      .from('cooked')
      .insert({ household_id: householdId, recipe_id: recipeId, cooked_on: today })
      .select('id')
      .single(),
  )
}

// Undo of markCooked.
export async function undoCooked(id) {
  return unwrap(supabase.from('cooked').delete().eq('id', id))
}

// The products and the household's overrides of "always at home" (salt, oil…).
export async function loadBasics() {
  const [products, overrides] = await Promise.all([
    unwrap(
      supabase
        .from('products')
        .select('id, code, household_id, name, category, storage, shelf_days, synonyms, assumed'),
    ),
    unwrap(supabase.from('assumed_overrides').select('product_id, assumed')),
  ])
  return { products, overrides }
}

// Everything the recipe screen needs, loaded in parallel. `assumedIds` are the
// products taken for granted at home, so they are never "falta".
export async function loadRecipePage(id) {
  const [recipe, items, basics] = await Promise.all([loadRecipe(id), loadFridge(), loadBasics()])
  const assumedIds = new Set(effectiveAssumed(basics.products, basics.overrides).map((p) => p.id))
  return { recipe, items, assumedIds }
}

// Marks a product as always at home (or not) for this household.
export async function setAssumed(householdId, productId, assumed) {
  return unwrap(
    supabase.from('assumed_overrides').upsert({ household_id: householdId, product_id: productId, assumed }),
  )
}

// The last 30 dishes the household cooked, newest first.
export async function loadHistory() {
  return unwrap(
    supabase
      .from('cooked')
      .select('id, cooked_on, recipe:recipes(id, title)')
      .order('cooked_on', { ascending: false })
      .order('id', { ascending: false })
      .limit(30),
  )
}

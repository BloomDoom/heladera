// Builds the recipe book from the downloaded sources.
//
//   node scripts/recipes/build.js [sourcesDir]
//
// sourcesDir (default scripts/recipes/sources/, git-ignored) must have:
//   abuela/main.csv          https://huggingface.co/datasets/somosnlp/RecetasDeLaAbuela/resolve/main/main.csv
//   peregrinogris/recetas/   git clone --depth 1 https://github.com/peregrinogris/recetario peregrinogris
//   peluso/Recetas/          git clone --depth 1 https://github.com/peluso-cocina/recetario-culinario peluso
//
// Writes scripts/recipes/out/products.json and recipes.json (git-ignored:
// the recipes are for personal use only) and prints what was kept and the
// ingredient lines that matched no product, to grow the dictionary.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readAbuela } from './abuela.js'
import { parseMarkdownRecipe } from './markdown.js'
import { buildVocab } from './mojibake.js'
import { assemble } from './assemble.js'

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const sources = process.argv[2] || join(here, 'sources')
const json = (name) => JSON.parse(readFileSync(join(here, 'dictionary', name), 'utf8'))

const dict = json('products.json')
const words = json('es-ar.json')
const ignore = json('ignore.json')
const allow = json('markdown-allowlist.json')

const abuela = readAbuela(readFileSync(join(sources, 'abuela', 'main.csv'), 'utf8'))
const markdown = Object.entries({ peregrinogris: 'peregrinogris/recetas', peluso: 'peluso/Recetas' })
  .flatMap(([source, dir]) => allow[source].map((slug) =>
    parseMarkdownRecipe(readFileSync(join(sources, dir, `${slug}.md`), 'utf8'), source, slug)))

const raw = [...markdown, ...abuela]
// Words of every recipe, to repair the broken accents (see mojibake.js).
const vocab = buildVocab(raw.flatMap((r) => [r.title, r.steps, ...r.ingredients]))
const { recipes, report } = assemble(raw, { dict, words, ignore, vocab })

mkdirSync(join(here, 'out'), { recursive: true })
writeFileSync(join(here, 'out', 'products.json'), JSON.stringify(dict))
writeFileSync(join(here, 'out', 'recipes.json'), JSON.stringify(recipes))

const bySource = (list) => Object.entries(Object.groupBy(list, (r) => r.source)).map(([s, l]) => `${s} ${l.length}`).join(', ')
console.log(`read: ${bySource(raw)}`)
console.log(`kept: ${report.kept} (${bySource(recipes)}), dropped: ${report.dropped}`)
console.log(`titles with broken accents: ${report.unresolvedMojibake}`)
console.log(`products used: ${new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.code))).size} of ${dict.length}`)
const top = [...report.unmatched].sort((a, b) => b[1] - a[1])
console.log(`unmatched lines: ${top.length} distinct, top 60:`)
for (const [line, n] of top.slice(0, 60)) console.log(`${String(n).padStart(5)}  ${line}`)

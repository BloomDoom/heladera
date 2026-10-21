import { prepare, matchProducts, isIgnored, argentinize, stripNoise } from './normalize.js'
import { fixMojibake } from './mojibake.js'

// Titles that are a sauce, a drink or a dessert, not a dish for dinner.
const NOT_A_DISH = /^(salsa|aderezo|trago|postre|torta|bud[ií]n|helado)\b/i

// Turns raw recipes into the ones that get loaded: titles and ingredient
// lines adapted to Argentina, every ingredient matched to a product.
// A recipe is dropped if an ingredient is unknown (the app couldn't tell
// whether you have it), if it has fewer than 2 products, or if its title
// still has broken accents.
export function assemble(raw, { dict, words, ignore, vocab }) {
  const d = prepare(dict)
  const byCode = new Map(dict.map((p) => [p.code, p]))
  const report = { kept: 0, dropped: 0, unmatched: new Map(), unresolvedMojibake: 0 }
  const recipes = []

  for (const r of raw) {
    const before = fixMojibake.unresolved
    const title = argentinize(fixMojibake(r.title, vocab), words)
    let ok = fixMojibake.unresolved === before && !NOT_A_DISH.test(title)
    if (fixMojibake.unresolved !== before) report.unresolvedMojibake++

    const ingredients = new Map()
    for (const original of r.ingredients) {
      if (isIgnored(original, ignore)) continue
      const line = argentinize(fixMojibake(original, vocab), words)
      const codes = matchProducts(line, d)
      if (!codes.length) {
        const key = stripNoise(line)
        report.unmatched.set(key, (report.unmatched.get(key) || 0) + 1)
        ok = false
      }
      for (const code of codes) {
        const isMain = !byCode.get(code).minor
        const seen = ingredients.get(code)
        if (seen) seen.isMain ||= isMain
        else ingredients.set(code, { code, line, isMain })
      }
    }

    if (!ok || ingredients.size < 2) { report.dropped++; continue }
    report.kept++
    recipes.push({ ...r, title, steps: fixMojibake(r.steps, vocab), ingredients: [...ingredients.values()] })
  }
  return { recipes, report }
}

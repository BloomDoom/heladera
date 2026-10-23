import { normalizeText } from './products.js'

const MAX_RESULTS = 50 // more than this is too long to scroll through

// Recipes whose title has every word of the query as the start of one of
// its words, ignoring accents and capitals ("pollo arr" → "Arroz con pollo").
function matching(recipes, query) {
  const q = normalizeText(query)
  const words = q.split(' ').filter(Boolean)
  if (words.length === 0) return { found: [], startsWithQuery: () => false }
  const found = recipes.filter((recipe) => {
    const titleWords = normalizeText(recipe.title).split(' ')
    return words.every((word) => titleWords.some((t) => t.startsWith(word)))
  })
  return { found, startsWithQuery: (recipe) => normalizeText(recipe.title).startsWith(q) }
}

// "Buscar receta". Order: the ones the household can make with what it has
// (makeableIds), then titles that start with the query, then by title.
export function searchRecipes(recipes, query, makeableIds) {
  const { found, startsWithQuery } = matching(recipes, query)
  return found
    .sort(
      (a, b) =>
        Number(makeableIds.has(b.id)) - Number(makeableIds.has(a.id)) ||
        Number(startsWithQuery(b)) - Number(startsWithQuery(a)) ||
        a.title.localeCompare(b.title, 'es'),
    )
    .slice(0, MAX_RESULTS)
}

// The search in "Platos de la semana", over the whole recipe book.
// missingById has what each dish lacks: [] when nothing, up to 3 names.
// Dishes not in it lack more than 3 things (missing: null) and go last.
// Order: fewest missing first, then titles that start with the query, then by title.
export function searchByMissing(recipes, query, missingById) {
  const { found, startsWithQuery } = matching(recipes, query)
  const count = (recipe) => missingById.get(recipe.id)?.length ?? Infinity
  return found
    .sort(
      (a, b) =>
        count(a) - count(b) ||
        Number(startsWithQuery(b)) - Number(startsWithQuery(a)) ||
        a.title.localeCompare(b.title, 'es'),
    )
    .slice(0, MAX_RESULTS)
    .map((recipe) => ({ ...recipe, missing: missingById.get(recipe.id) ?? null }))
}

// The line under each result.
export function missingLine(missing) {
  if (missing === null) return 'Faltan más de 3 cosas'
  if (missing.length === 0) return 'Tenés todo'
  return `Falta: ${missing.map((name) => name.toLowerCase()).join(', ')}`
}

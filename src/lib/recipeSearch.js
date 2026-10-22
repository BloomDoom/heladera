import { normalizeText } from './products.js'

const MAX_RESULTS = 50 // more than this is too long to scroll through

// Recipes whose title has every word of the query as the start of one of
// its words, ignoring accents and capitals ("pollo arr" → "Arroz con pollo").
// Order: the ones the household can make with what it has (makeableIds),
// then titles that start with the query, then by title.
export function searchRecipes(recipes, query, makeableIds) {
  const q = normalizeText(query)
  const words = q.split(' ').filter(Boolean)
  if (words.length === 0) return []
  const startsWithQuery = (recipe) => normalizeText(recipe.title).startsWith(q)
  return recipes
    .filter((recipe) => {
      const titleWords = normalizeText(recipe.title).split(' ')
      return words.every((word) => titleWords.some((t) => t.startsWith(word)))
    })
    .sort(
      (a, b) =>
        Number(makeableIds.has(b.id)) - Number(makeableIds.has(a.id)) ||
        Number(startsWithQuery(b)) - Number(startsWithQuery(a)) ||
        a.title.localeCompare(b.title, 'es'),
    )
    .slice(0, MAX_RESULTS)
}

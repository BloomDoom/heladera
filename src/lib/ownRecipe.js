// Checks and text helpers for the household's own recipes.

// The first error to show on the form, or null when the recipe can be saved.
export function validateOwnRecipe({ title, ingredients, steps }) {
  if (!title.trim()) return 'Poné un nombre.'
  if (ingredients.length === 0) return 'Agregá al menos un ingrediente.'
  if (ingredients.some((i) => i.product_id == null)) return 'Elegí el producto de cada ingrediente.'
  const seen = new Set()
  for (const i of ingredients) {
    if (seen.has(i.product_id)) return `${i.product_name} está dos veces: dejalo en un solo renglón.`
    seen.add(i.product_id)
  }
  if (!steps.some((s) => s.trim())) return 'Escribí al menos un paso.'
  return null
}

// Paragraphs separated by a blank line; `recipeSteps` reads them back.
export function ownRecipeSteps(steps) {
  return steps.map((s) => s.trim()).filter(Boolean).join('\n\n')
}

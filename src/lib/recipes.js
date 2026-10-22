import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'
import { ownRecipeSteps } from './ownRecipe.js'

// Stars or un-stars a recipe for this household. Turning it off needs no
// household id: RLS only lets the household reach its own rows.
export async function setFavorite(householdId, recipeId, on) {
  if (on) {
    return unwrap(supabase.from('favorites').insert({ household_id: householdId, recipe_id: recipeId }))
  }
  return unwrap(supabase.from('favorites').delete().eq('recipe_id', recipeId))
}

// The household's favorite recipes, newest first.
export async function loadFavorites() {
  return unwrap(
    supabase
      .from('favorites')
      .select('recipe_id, created_at, recipe:recipes(id, title)')
      .order('created_at', { ascending: false }),
  )
}

// Creates (recipeId null) or updates the household's own recipe in one go,
// ingredients included. Returns the recipe id.
export async function saveOwnRecipe(recipeId, input) {
  return unwrap(
    supabase.rpc('save_own_recipe', {
      recipe_id: recipeId,
      title: input.title.trim(),
      minutes: input.minutes,
      servings: input.servings,
      steps: ownRecipeSteps(input.steps),
      ingredients: input.ingredients.map((i) => ({ product_id: i.product_id, line: i.line.trim(), is_main: i.is_main })),
    }),
  )
}

// Deletes an own recipe. Its history, skipped dishes and favorite go with it.
export async function deleteOwnRecipe(id) {
  return unwrap(supabase.from('recipes').delete().eq('id', id))
}

// The household's own recipes by title (RLS only shows it its own).
export async function loadOwnRecipes() {
  return unwrap(supabase.from('recipes').select('id, title').not('household_id', 'is', null).order('title'))
}

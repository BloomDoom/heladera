import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'

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

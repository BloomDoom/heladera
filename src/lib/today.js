import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'
import { loadFridge } from './fridge.js'
import { addDays } from './format.js'

// Everything the "Hoy" screen needs, loaded in parallel: the recipes that can
// be cooked (or almost), the fridge, the last 180 days of cooked dishes and
// the last 14 days of skipped ones.
export async function loadSuggestionsData(today) {
  const [candidates, items, cooked, rejections] = await Promise.all([
    unwrap(supabase.rpc('recipe_candidates')),
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

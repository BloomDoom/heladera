import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'
import { addDays } from './format.js'

let channelCount = 0 // every subscription needs its own channel topic
const ALREADY_THERE = '23505' // Postgres: unique violation (the product is already on the list)

// Everything the shopping list needs, loaded in parallel: the list itself,
// the household's products and the last 180 days of purchases (to know what
// is bought often), which products are in the fridge, and the snoozed ones.
export async function loadShopping(today) {
  const [rows, products, purchases, items, snoozes] = await Promise.all([
    unwrap(
      supabase
        .from('shopping_items')
        .select(
          'product_id, reason, recipe_id, added_on, checked, product:products(id, name, category), recipe:recipes(title)',
        ),
    ),
    unwrap(
      supabase
        .from('products')
        .select('id, code, household_id, name, category, storage, shelf_days, synonyms'),
    ),
    unwrap(
      supabase.from('purchases').select('product_id, bought_on').gte('bought_on', addDays(today, -180)),
    ),
    unwrap(supabase.from('fridge_items').select('product_id')),
    unwrap(supabase.from('shopping_snoozes').select('product_id, snoozed_on')),
  ])
  return { rows, products, purchases, presentIds: new Set(items.map((i) => i.product_id)), snoozes }
}

// Inserts a list row. A product that is already on the list is not an error.
async function insertRow(row) {
  try {
    await unwrap(supabase.from('shopping_items').insert(row))
  } catch (error) {
    if (error.code !== ALREADY_THERE) throw error
  }
}

// Puts a product on the list. `reason`: se_acabo, habitual, plato or a_mano.
export async function addToList(householdId, productId, reason, today, recipeId = null) {
  return insertRow({
    household_id: householdId,
    product_id: productId,
    reason,
    recipe_id: recipeId,
    added_on: today,
  })
}

export async function removeFromList(productId) {
  return unwrap(supabase.from('shopping_items').delete().eq('product_id', productId))
}

// Undo of removeFromList: puts the same row back.
export async function restoreListRow(householdId, row) {
  return insertRow({
    household_id: householdId,
    product_id: row.product_id,
    reason: row.reason,
    recipe_id: row.recipe_id,
    added_on: row.added_on,
    checked: row.checked,
  })
}

export async function setChecked(productId, checked) {
  return unwrap(supabase.from('shopping_items').update({ checked }).eq('product_id', productId))
}

// A habitual product the household wants today: straight onto the list, checked.
export async function checkHabit(householdId, productId, today) {
  return insertRow({
    household_id: householdId,
    product_id: productId,
    reason: 'habitual',
    added_on: today,
    checked: true,
  })
}

// "Hoy no": hides a habitual product for now.
export async function snooze(householdId, productId, today) {
  try {
    await unwrap(
      supabase
        .from('shopping_snoozes')
        .insert({ household_id: householdId, product_id: productId, snoozed_on: today }),
    )
  } catch (error) {
    if (error.code !== ALREADY_THERE) throw error
    // Already snoozed: only snoozed_on may be updated, so renew it.
    await unwrap(supabase.from('shopping_snoozes').update({ snoozed_on: today }).eq('product_id', productId))
  }
}

export async function unsnooze(productId) {
  return unwrap(supabase.from('shopping_snoozes').delete().eq('product_id', productId))
}

// Moves the checked products into the fridge. Returns how many there were.
export async function storeChecked(today) {
  return unwrap(supabase.rpc('store_checked', { today }))
}

// Lists what a dish is missing. Returns the product ids it added.
export async function addRecipeToList(recipeId, today) {
  return unwrap(supabase.rpc('add_recipe_to_list', { recipe_id: recipeId, today }))
}

// Dishes 1 to 3 products away, and the last 14 days of cooked ones.
export async function loadWeek(today) {
  const [candidates, cooked] = await Promise.all([
    unwrap(supabase.rpc('week_candidates')),
    unwrap(
      supabase.from('cooked').select('recipe_id, cooked_on').gte('cooked_on', addDays(today, -14)),
    ),
  ])
  return { candidates, cooked }
}

// Calls onChange whenever the household's list changes on any phone.
// Returns the function that stops listening.
export function subscribeShopping(householdId, onChange) {
  const channel = supabase
    .channel(`shopping-${householdId}-${++channelCount}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'heladera', table: 'shopping_items', filter: `household_id=eq.${householdId}` },
      (payload) => {
        // Realtime applies neither RLS nor filters to DELETE events.
        const id = payload.new?.household_id ?? payload.old?.household_id
        if (id != null && id !== householdId) return
        onChange()
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

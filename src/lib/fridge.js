import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'

// Everything in the fridge, with its product. Row Level Security only
// returns the user's own household, so there's no need to filter here.
export async function loadFridge() {
  return unwrap(
    supabase
      .from('fridge_items')
      .select(
        'product_id, added_on, expires_on, product:products(id, code, household_id, name, category, storage, shelf_days, synonyms)',
      ),
  )
}

// "Se acabó": takes the product out of the fridge.
export async function finishItem(productId) {
  return unwrap(supabase.from('fridge_items').delete().eq('product_id', productId))
}

// Undo of finishItem: puts the same row back (no purchase is recorded).
export async function restoreItem(householdId, item) {
  return unwrap(
    supabase.from('fridge_items').upsert({
      household_id: householdId,
      product_id: item.product_id,
      added_on: item.added_on,
      expires_on: item.expires_on,
    }),
  )
}

// Sets the expiry date by hand (ISO date), or null to go back to the estimate.
export async function setExpiry(productId, iso) {
  return unwrap(supabase.from('fridge_items').update({ expires_on: iso }).eq('product_id', productId))
}

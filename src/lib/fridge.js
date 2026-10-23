import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'
import { addDays } from './format.js'

// Everything in the fridge, with its product. Row Level Security only
// returns the user's own household, so there's no need to filter here.
export async function loadFridge() {
  return unwrap(
    supabase
      .from('fridge_items')
      .select(
        'product_id, place, added_on, expires_on, product:products(id, code, household_id, name, category, storage, shelf_days, synonyms)',
      ),
  )
}

// "Se acabó": takes the product out of the fridge and puts it on the
// shopping list. Returns true when it was added to the list now.
export async function finishItem(productId, today) {
  return unwrap(supabase.rpc('finish_fridge_item', { product_id: productId, today }))
}

// Undo of finishItem: puts the same row back (no purchase is recorded).
export async function restoreItem(householdId, item) {
  return unwrap(
    supabase.from('fridge_items').upsert({
      household_id: householdId,
      product_id: item.product_id,
      place: item.place,
      added_on: item.added_on,
      expires_on: item.expires_on,
    }),
  )
}

// Moves an item to another place. The clock starts again there and a
// hand-set expiry no longer applies.
export async function moveItem(productId, place, today) {
  return unwrap(
    supabase.from('fridge_items').update({ place, added_on: today, expires_on: null }).eq('product_id', productId),
  )
}

// Sets the expiry date by hand (ISO date), or null to go back to the estimate.
export async function setExpiry(productId, iso) {
  return unwrap(supabase.from('fridge_items').update({ expires_on: iso }).eq('product_id', productId))
}

// Everything the "Cargar lo comprado" screen needs, loaded in parallel:
// the household's products, the last 90 days of purchases (to know what is
// bought often) and which products are already in the fridge.
export async function loadAddData(today) {
  const [products, purchases, items] = await Promise.all([
    unwrap(
      supabase
        .from('products')
        .select('id, code, household_id, name, category, storage, shelf_days, synonyms'),
    ),
    unwrap(
      supabase.from('purchases').select('product_id, bought_on').gte('bought_on', addDays(today, -90)),
    ),
    unwrap(supabase.from('fridge_items').select('product_id')),
  ])
  return { products, purchases, presentIds: new Set(items.map((i) => i.product_id)) }
}

// Puts the products in the fridge (or renews them) and records the purchase.
export async function addToFridge(productIds, today) {
  return unwrap(supabase.rpc('add_to_fridge', { product_ids: productIds, today }))
}

// A new product of this household. Returns the saved row.
export async function createProduct(householdId, { name, category, storage, shelf_days }) {
  return unwrap(
    supabase
      .from('products')
      .insert({ household_id: householdId, name, category, storage, shelf_days })
      .select('id, code, household_id, name, category, storage, shelf_days, synonyms')
      .single(),
  )
}

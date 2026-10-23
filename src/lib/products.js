// Product helpers: categories, search, frequent products and shop groups.

// Places of the kitchen.
export const PLACES = [
  { key: 'fridge', label: 'Heladera' },
  { key: 'freezer', label: 'Freezer' },
  { key: 'pantry', label: 'Alacena' },
]

// The place after this one when tapping a place label: fridge, freezer, pantry, fridge...
export function nextPlace(place) {
  const i = PLACES.findIndex((p) => p.key === place)
  return PLACES[(i + 1) % PLACES.length].key
}

// Only the ids whose chosen place differs from their usual storage, as { id: place }.
export function placeChoices(selectedIds, chosen, productsById) {
  const out = {}
  for (const id of selectedIds) {
    const usual = productsById.get(id)?.storage ?? 'fridge'
    const place = chosen[id] ?? usual
    if (place !== usual) out[id] = place
  }
  return out
}

// Categories of the product dictionary, with defaults for new products.
export const CATEGORIES = [
  { key: 'verdura', label: 'Verdura', storage: 'fridge', shelf_days: 7 },
  { key: 'fruta', label: 'Fruta', storage: 'fridge', shelf_days: 7 },
  { key: 'carne', label: 'Carne', storage: 'freezer', shelf_days: 3 },
  { key: 'pollo', label: 'Pollo', storage: 'freezer', shelf_days: 2 },
  { key: 'pescado', label: 'Pescado', storage: 'freezer', shelf_days: 2 },
  { key: 'fiambre', label: 'Fiambre', storage: 'fridge', shelf_days: 7 },
  { key: 'lacteo', label: 'Lácteo', storage: 'fridge', shelf_days: 10 },
  { key: 'huevo', label: 'Huevos', storage: 'fridge', shelf_days: 21 },
  { key: 'panificado', label: 'Panadería', storage: 'pantry', shelf_days: 4 },
  { key: 'congelado', label: 'Congelado', storage: 'freezer', shelf_days: 90 },
  { key: 'almacen', label: 'Almacén', storage: 'pantry', shelf_days: 180 },
  { key: 'condimento', label: 'Condimento', storage: 'pantry', shelf_days: 365 },
  { key: 'bebida', label: 'Bebida', storage: 'pantry', shelf_days: 180 },
]

const GREENGROCER = ['verdura', 'fruta']
const BUTCHER = ['carne', 'pollo', 'pescado', 'fiambre']

// Where each category is bought. The supermarket gets everything else.
export const SHOPS = [
  { key: 'verduleria', label: 'Verdulería', categories: GREENGROCER },
  { key: 'carniceria', label: 'Carnicería', categories: BUTCHER },
  {
    key: 'super',
    label: 'Súper',
    categories: CATEGORIES.map((c) => c.key).filter((k) => !GREENGROCER.includes(k) && !BUTCHER.includes(k)),
  },
]

// Product codes shown first when there is little purchase history.
export const DEFAULT_FREQUENT = [
  'huevo', 'leche', 'tomate', 'cebolla', 'papa', 'lechuga', 'pollo', 'carne-de-vaca',
  'queso', 'pan', 'zanahoria', 'manzana', 'banana', 'yogur', 'fideos', 'arroz',
]

// Lower case, no accents, single spaces.
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const shown = (products) => products.filter((p) => p.code !== 'agua')
const byName = (a, b) => a.name.localeCompare(b.name, 'es')

// True when every query word starts some word of the text.
function matchesWords(text, words) {
  const textWords = text.split(' ')
  return words.every((w) => textWords.some((t) => t.startsWith(w)))
}

// Products matching the query: name starts first, other names, then synonyms.
// Agua is left out unless `includeHidden` is true.
export function searchProducts(products, query, { includeHidden = false } = {}) {
  const q = normalizeText(query)
  if (!q) return []
  const words = q.split(' ')
  const ranked = []
  for (const product of includeHidden ? products : shown(products)) {
    const name = normalizeText(product.name)
    let rank = null
    if (matchesWords(name, words)) rank = name.startsWith(q) ? 0 : 1
    else if ((product.synonyms ?? []).some((s) => matchesWords(normalizeText(s), words))) rank = 2
    if (rank !== null) ranked.push({ product, rank })
  }
  ranked.sort((a, b) => a.rank - b.rank || byName(a.product, b.product))
  return ranked.map((r) => r.product)
}

// The product whose name or synonym is exactly the given text.
export function findByName(products, name) {
  const n = normalizeText(name)
  if (!n) return null
  return (
    products.find(
      (p) => normalizeText(p.name) === n || (p.synonyms ?? []).some((s) => normalizeText(s) === n),
    ) ?? null
  )
}

// Most bought products first, then the default list, up to the limit.
export function frequentProducts(products, purchases, limit = 16) {
  const stats = new Map()
  for (const { product_id, bought_on } of purchases) {
    const s = stats.get(product_id) ?? { count: 0, last: '' }
    s.count += 1
    if (bought_on > s.last) s.last = bought_on
    stats.set(product_id, s)
  }
  const bought = shown(products)
    .filter((p) => stats.has(p.id))
    .sort((a, b) => {
      const sa = stats.get(a.id)
      const sb = stats.get(b.id)
      return sb.count - sa.count || (sb.last > sa.last ? 1 : sb.last < sa.last ? -1 : 0)
    })
  const result = bought.slice(0, limit)
  for (const code of DEFAULT_FREQUENT) {
    if (result.length >= limit) break
    const product = shown(products).find((p) => p.code === code)
    if (product && !result.includes(product)) result.push(product)
  }
  return result
}

// Products split by shop, sorted by name, empty shops left out.
export function groupByShop(products) {
  return SHOPS.map((shop) => ({
    shop,
    products: shown(products).filter((p) => shop.categories.includes(p.category)).sort(byName),
  })).filter((g) => g.products.length > 0)
}

// Products the household has at hand: the product default, unless it overrode it.
export function effectiveAssumed(products, overrides) {
  const override = new Map(overrides.map((o) => [o.product_id, o.assumed]))
  return products.filter((p) => override.get(p.id) ?? p.assumed).sort(byName)
}

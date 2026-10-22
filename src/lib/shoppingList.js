// The shopping list: what the household tends to buy, what is due, and how the list is laid out.
// Pure functions only, so every rule can be tested without a database.

import { daysBetween } from './format.js'
import { CATEGORIES } from './products.js'
import { dailyOrder } from './suggest.js'

const MIN_HABIT_DAYS = 3
const RECENT_COOK_DAYS = 14

// Products bought on at least three distinct days, with the usual gap between purchases.
export function habits(purchases) {
  const daysByProduct = new Map()
  for (const p of purchases) {
    if (!daysByProduct.has(p.product_id)) daysByProduct.set(p.product_id, new Set())
    daysByProduct.get(p.product_id).add(p.bought_on)
  }

  const result = new Map()
  for (const [product_id, set] of daysByProduct) {
    if (set.size < MIN_HABIT_DAYS) continue
    const days = [...set].sort()
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d)).sort((a, b) => a - b)
    // Lower middle value when the count is even.
    const interval = Math.max(1, gaps[Math.ceil(gaps.length / 2) - 1])
    result.set(product_id, { product_id, interval, last: days[days.length - 1] })
  }
  return result
}

export function habitText(interval) {
  if (interval <= 4) return 'Lo comprás cada pocos días'
  if (interval <= 10) return 'Lo comprás cada semana'
  if (interval <= 20) return 'Lo comprás cada dos semanas'
  if (interval <= 45) return 'Lo comprás cada mes'
  return `Lo comprás cada ${interval} días`
}

// Habits whose interval has passed, most overdue first.
export function dueHabits({ habits: habitsMap, presentIds, listedIds, snoozes, today }) {
  const snoozedOn = new Map(snoozes.map((s) => [s.product_id, s.snoozed_on]))
  const overdue = (h) => daysBetween(h.last, today) - h.interval

  return [...habitsMap.values()]
    .filter((h) => {
      if (overdue(h) < 0) return false
      if (presentIds.has(h.product_id) || listedIds.has(h.product_id)) return false
      const snoozed = snoozedOn.get(h.product_id)
      return snoozed === undefined || daysBetween(snoozed, today) >= h.interval
    })
    .sort((a, b) => overdue(b) - overdue(a))
}

export function reasonText(row, habitsMap) {
  switch (row.reason) {
    case 'se_acabo':
      return 'Se acabó'
    case 'habitual': {
      const habit = habitsMap.get(row.product_id)
      return habit ? habitText(habit.interval) : 'Lo comprás seguido'
    }
    case 'plato':
      return `Para ${row.recipe?.title ?? 'un plato'}`
    default:
      return null
  }
}

const byName = (a, b) => a.name.localeCompare(b.name, 'es')

// Entries: { product_id, name, category, reason, stored, checked }.
export function buildList({ rows, due, products, habitsMap }) {
  const productById = new Map(products.map((p) => [p.id, p]))

  const stored = rows.map((row) => ({
    product_id: row.product_id,
    name: row.product.name,
    category: row.product.category,
    reason: reasonText(row, habitsMap),
    stored: true,
    checked: row.checked,
  }))
  const suggested = due.flatMap((h) => {
    const product = productById.get(h.product_id)
    if (!product) return []
    return [{
      product_id: h.product_id,
      name: product.name,
      category: product.category,
      reason: habitText(h.interval),
      stored: false,
      checked: false,
    }]
  })

  const open = [...stored.filter((e) => !e.checked), ...suggested]
  const groups = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    entries: open.filter((e) => e.category === c.key).sort(byName),
  })).filter((g) => g.entries.length > 0)

  return { groups, cart: stored.filter((e) => e.checked).sort(byName) }
}

// Dishes worth planning for the week: not cooked lately, own and favorites first, then the fewest missing items.
export function rankWeek({ candidates, cooked, today }) {
  const recent = new Set(
    cooked.filter((c) => daysBetween(c.cooked_on, today) < RECENT_COOK_DAYS).map((c) => c.recipe_id),
  )
  const liked = (c) => (c.own || c.favorite ? 0 : 1)

  return candidates
    .filter((c) => !recent.has(c.recipe_id))
    .sort(
      (a, b) =>
        liked(a) - liked(b) ||
        a.missing_names.length - b.missing_names.length ||
        dailyOrder(a.recipe_id, today) - dailyOrder(b.recipe_id, today),
    )
}

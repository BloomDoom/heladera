// Orders the dishes the household can make and says why.
// The score is a plain sum, so every point can be explained on the card.

import { daysBetween, plural } from './format.js'
import { freshness } from './freshness.js'

const SOON_DAYS = 2

export function urgencyText(name, daysLeft) {
  if (daysLeft < 0) return `${name} ya pasó la fecha estimada`
  if (daysLeft === 0) return `${name} vence hoy`
  if (daysLeft === 1) return `${name} vence mañana`
  return `${name} vence en ${daysLeft} días`
}

// `days` is null when the dish was never cooked.
export function noveltyText(days) {
  if (days === null) return 'No lo cocinan hace meses'
  return `No lo comen hace ${plural(Math.floor(days / 7), 'semana', 'semanas')}`
}

// FNV-1a 32-bit hash with a final mix: a tie-breaker that is fixed for a recipe on a given day.
export function dailyOrder(recipeId, today) {
  let hash = 0x811c9dc5
  for (const ch of `${recipeId}:${today}`) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0
  }
  // Final mix, so dates that differ in the last character still reorder the ties.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0
  return (hash ^ (hash >>> 16)) >>> 0
}

// Days since the most recent date of each recipe.
function daysSinceByRecipe(rows, dateKey, today) {
  const latest = new Map()
  for (const row of rows) {
    const date = row[dateKey]
    if (!latest.has(row.recipe_id) || date > latest.get(row.recipe_id)) latest.set(row.recipe_id, date)
  }
  return new Map([...latest].map(([id, date]) => [id, daysBetween(date, today)]))
}

// The used item that expires first, ignoring items with no shelf life.
function soonestItem(candidate, items, today) {
  let soonest = null
  for (const item of items) {
    if (!candidate.used_product_ids.includes(item.product_id)) continue
    const { daysLeft } = freshness(item, today)
    if (daysLeft !== null && (soonest === null || daysLeft < soonest.daysLeft)) {
      soonest = { name: item.product.name, daysLeft }
    }
  }
  return soonest
}

export function rankSuggestions({ candidates, items, cooked, rejections, today }) {
  const cookedAgo = daysSinceByRecipe(cooked, 'cooked_on', today)
  const rejectedAgo = daysSinceByRecipe(rejections, 'rejected_on', today)

  const suggestions = candidates.map((c) => {
    let score = 0
    const reasons = []

    const soonest = soonestItem(c, items, today)
    if (soonest && soonest.daysLeft <= SOON_DAYS) {
      score += 3
      reasons.push(urgencyText(soonest.name, soonest.daysLeft))
    }

    if (c.own || c.favorite) {
      score += 2
      reasons.push(c.own ? 'Es una receta de ustedes' : 'Es una de sus favoritas')
    }

    const cookedDays = cookedAgo.get(c.recipe_id) ?? null
    if (cookedDays === null || cookedDays >= 14) {
      score += 2
      reasons.push(noveltyText(cookedDays))
    } else if (cookedDays >= 7) score += 1
    else score -= 3

    const rejectedDays = rejectedAgo.get(c.recipe_id)
    if (rejectedDays !== undefined) {
      if (rejectedDays <= 3) score -= 4
      else if (rejectedDays <= 14) score -= 2
    }

    if (c.missing_product_id !== null) score -= 1

    return {
      recipeId: c.recipe_id,
      title: c.title,
      minutes: c.minutes,
      score,
      reasons: reasons.length ? reasons : ['Se puede hacer con lo que hay'],
      missing: c.missing_product_id !== null ? `Falta ${(c.missing_product_name ?? '').toLowerCase() || 'algo'}` : null,
    }
  })

  return suggestions.sort(
    (a, b) => b.score - a.score || dailyOrder(a.recipeId, today) - dailyOrder(b.recipeId, today),
  )
}

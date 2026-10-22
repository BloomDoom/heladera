// How long a fridge item has been in, and when it goes off.

import { addDays, daysBetween, plural } from './format.js'

const SOON_DAYS = 2 // "soon" = this many days left or fewer

// Uses the date set by hand, or else estimates it from the product's shelf life.
export function freshness(item, today) {
  const shelfDays = item.product.shelf_days
  const expiresOn = item.expires_on ?? (shelfDays ? addDays(item.added_on, shelfDays) : null)
  const daysLeft = expiresOn ? daysBetween(today, expiresOn) : null
  let status = 'ok'
  if (daysLeft !== null && daysLeft < 0) status = 'over'
  else if (daysLeft !== null && daysLeft <= SOON_DAYS) status = 'soon'
  return {
    expiresOn,
    daysIn: daysBetween(item.added_on, today),
    daysLeft,
    status,
    manual: item.expires_on != null,
  }
}

// Texts for the list row. `warning` is null when there is nothing to warn about.
export function freshnessText(f) {
  let since = `Hace ${f.daysIn} días`
  if (f.daysIn === 0) since = 'Entró hoy'
  else if (f.daysIn === 1) since = 'Entró ayer'

  return { since, warning: f.status === 'ok' ? null : warningText(f.daysLeft) }
}

function warningText(daysLeft) {
  if (daysLeft === 0) return 'Vence hoy'
  if (daysLeft === 1) return 'Vence mañana'
  if (daysLeft > 1) return `Vence en ${plural(daysLeft, 'día', 'días')}`
  if (daysLeft === -1) return 'Venció ayer'
  return `Venció hace ${plural(-daysLeft, 'día', 'días')}`
}

// Most urgent first; items with no expiry go last, then by name.
export function compareItems(a, b, today) {
  const left = (item) => freshness(item, today).daysLeft
  const la = left(a)
  const lb = left(b)
  if (la !== lb) {
    if (la === null) return 1
    if (lb === null) return -1
    return la - lb
  }
  return a.product.name.localeCompare(b.product.name, 'es')
}

// How long a fridge item has been in, and when it goes off.

import { addDays, daysBetween, plural } from './format.js'

const SOON_DAYS = 2 // "soon" = this many days left or fewer
export const FREEZER_DAYS = 90 // everything keeps this long in the freezer

// Uses the date set by hand, or else estimates it from the product's shelf life.
export function freshness(item, today) {
  const shelfDays = item.place === 'freezer' ? FREEZER_DAYS : item.product.shelf_days
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
export function freshnessText(f, place = 'fridge') {
  const warning = f.status === 'ok' ? null : warningText(f.daysLeft)
  if (place === 'pantry') return { since: null, warning }
  if (place === 'freezer') {
    const [, month, day] = f.expiresOn ? f.expiresOn.split('-') : []
    return { since: f.expiresOn ? `Hasta el ${day}/${month}` : null, warning }
  }
  let since = `Hace ${f.daysIn} días`
  if (f.daysIn === 0) since = 'Entró hoy'
  else if (f.daysIn === 1) since = 'Entró ayer'

  return { since, warning }
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

// Pantry: what is about to go off first, the rest by name.
export function comparePantry(a, b, today) {
  const fa = freshness(a, today)
  const fb = freshness(b, today)
  const aSoon = fa.status !== 'ok'
  const bSoon = fb.status !== 'ok'
  if (aSoon !== bSoon) return aSoon ? -1 : 1
  if (aSoon && fa.daysLeft !== fb.daysLeft) return fa.daysLeft - fb.daysLeft
  return a.product.name.localeCompare(b.product.name, 'es')
}

// "Pollo y carne picada están en el freezer"; null when nothing is frozen.
export function freezerText(names) {
  if (names.length === 0) return null
  const words = names.map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)))
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} y ${words.at(-1)}`
  return `${list} ${names.length === 1 ? 'está' : 'están'} en el freezer`
}

// For the "Vence pronto" note on Hoy: what is about to go off (or already
// did), in any place, most urgent first. `when` is short, for a note:
// "mañana", "hoy", "en 2 días", "venció ayer".
export function soonItems(items, today, max = 3) {
  return items
    .map((item) => ({ item, f: freshness(item, today) }))
    .filter(({ f }) => f.status !== 'ok')
    .sort((a, b) => a.f.daysLeft - b.f.daysLeft)
    .slice(0, max)
    .map(({ item, f }) => {
      const warning = warningText(f.daysLeft).replace(/^Vence /, '')
      return { name: item.product.name, when: warning[0].toLowerCase() + warning.slice(1), status: f.status }
    })
}

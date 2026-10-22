// Dates formatted the Argentine way.
//
// Dates are passed around as ISO strings ("2026-09-28") because that's
// what Postgres uses. They're only turned into "28/09/2026" for display.

const TIME_ZONE = 'America/Argentina/Buenos_Aires'

// Today's date in Argentina, as "2026-09-28".
// ("en-CA" happens to format dates as YYYY-MM-DD.)
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

// "2026-09-28" → "28/09/2026"
export function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// A JavaScript Date (local, no time zone math) → "2026-09-28"
function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// addDays("2026-09-30", 1) → "2026-10-01"
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + n))
}

// Whole days from one date to another: daysBetween("2026-10-20", "2026-10-22") → 2.
// Uses UTC so a daylight-saving change can't make a day 23 or 25 hours long.
export function daysBetween(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

// plural(1, 'socio', 'socios') → "1 socio", plural(3, …) → "3 socios"
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

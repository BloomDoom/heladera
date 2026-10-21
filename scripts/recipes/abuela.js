import { parseCsv } from './csv.js'

// somosnlp/RecetasDeLaAbuela, main.csv (config "version_1").

// The ingredients come either as a Python list ("['1 huevo', '2 papas']")
// or as one line separated by commas.
export function splitIngredients(field) {
  const text = (field || '').trim()
  if (text.startsWith('[')) {
    return [...text.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => (m[1] ?? m[2]).trim())
      .filter(Boolean)
  }
  return text.split(/,\s+/).map((s) => s.trim()).filter(Boolean)
}

// "00:45" → 45. Anything else (empty, "24:00:00") → null.
export function minutesOf(duration) {
  const m = /^(\d+):(\d{2})$/.exec(duration || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

const DIFFICULTY = { 'Dificultad muy baja': 'baja', 'Dificultad baja': 'baja', 'Dificultad media': 'media' }

// Lunch or dinner dishes that are easy and take an hour at most (spec §6).
export function isDinnerDish(row) {
  const minutes = minutesOf(row.Duracion)
  return ['Plato principal', 'Cena'].includes(row.Tiempo) && row.Dificultad in DIFFICULTY &&
    minutes != null && minutes <= 60
}

export function readAbuela(csvText) {
  const [header, ...rows] = parseCsv(csvText)
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
    .filter(isDinnerDish)
    .map((r) => ({
      sourceKey: `abuela:${r.Id}`,
      source: 'abuela',
      url: r.URL || null,
      title: r.Nombre.trim(),
      minutes: minutesOf(r.Duracion),
      servings: Number(/^\d+/.exec(r.Comensales || '')?.[0]) || null,
      difficulty: DIFFICULTY[r.Dificultad],
      country: r.Pais || null,
      ingredients: splitIngredients(r.Ingredientes),
      steps: r.Pasos.trim(),
    }))
}

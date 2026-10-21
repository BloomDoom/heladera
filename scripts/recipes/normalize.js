// Turns an ingredient line ("½ taza de cilantro finamente picado") into
// products of the dictionary (["cilantro"]), and adapts Spanish-from-Spain
// words to Argentina ("patatas" → "papas").

export const CATEGORIES = [
  'verdura', 'fruta', 'carne', 'pollo', 'pescado', 'fiambre', 'lacteo', 'huevo',
  'almacen', 'condimento', 'bebida', 'congelado', 'panificado',
]

// Lowercase, without accents (ñ becomes n): "Maíz" → "maiz".
export const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Quantities and units that are never part of a product name.
const NOISE = new RegExp(
  '\\d+([.,/]\\d+)?|[½¼¾⅓⅔⅛]|\\b(g|gr|grs|gramos?|kg|kilos?|ml|cc|cm3|l|litros?|tazas?|' +
    'cucharadas?|cucharaditas?|pizcas?|c/n)\\b',
  'g',
)

// Words that describe a product but would match another one: "morrón
// asado" isn't beef, "salmón en lomos" isn't beef either, "manteca sin
// sal" has no salt, "ajo en pasta" isn't fideos.
const QUALIFIERS = /\b(sin [a-z]+|asad[oa]s?|en lomos?|en pasta|de colores)\b/g

// The line without accents, quantities and units: "2 tazas de Maíz" → "de maiz".
export const stripNoise = (line) => fold(line).replace(NOISE, ' ').replace(/\s+/g, ' ').trim()

// Builds the matcher: every name and synonym, longest first, so "harina de
// maíz" wins over "maíz". A plural "s"/"es" at the end also matches.
export function prepare(products) {
  const terms = []
  for (const p of products) {
    for (const term of new Set([p.name, ...p.synonyms].map(fold))) {
      terms.push({ code: p.code, length: term.length, re: new RegExp(`(?<![a-z])${escape(term)}(es|s)?(?![a-z])`, 'g') })
    }
  }
  terms.sort((a, b) => b.length - a.length)
  return { terms }
}

// Product codes found in the line, in the order they appear, each once.
export function matchProducts(line, d) {
  let text = fold(line).replace(NOISE, ' ').replace(QUALIFIERS, ' ')
  const found = []
  for (const { code, re } of d.terms) {
    re.lastIndex = 0
    text = text.replace(re, (m, _plural, index) => {
      found.push({ code, index })
      return ' '.repeat(m.length) // so shorter terms can't match inside it
    })
  }
  found.sort((a, b) => a.index - b.index)
  return [...new Set(found.map((f) => f.code))]
}

// Lines that aren't food: toothpicks, foil…
export function isIgnored(line, ignore) {
  const text = fold(line)
  return ignore.some((term) => new RegExp(`(?<![a-z])${escape(fold(term))}(?![a-z])`).test(text))
}

// Replaces whole words from Spain with the Argentine ones, keeping a
// capital first letter: "Patatas con nata" → "Papas con crema".
export function argentinize(text, words) {
  const keys = Object.keys(words).sort((a, b) => b.length - a.length)
  if (!keys.length) return text
  const lookup = new Map(keys.map((k) => [k.toLowerCase(), words[k]]))
  const re = new RegExp(`(?<!\\p{L})(${keys.map(escape).join('|')})(?!\\p{L})`, 'giu')
  return text.replace(re, (m) => {
    const out = lookup.get(m.toLowerCase())
    return m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out
  })
}

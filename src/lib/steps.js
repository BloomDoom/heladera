// Turns a recipe's steps text into a list of steps, whatever source it
// came from:
//   * RecetasDeLaAbuela: a Python list written out as text,
//     "['1 Pelar las papas.', '2 Hervirlas.']" (a step with an apostrophe
//     goes between double quotes instead);
//   * numbered lines: "1. Pelar…\n2. Hervir…";
//   * paragraphs separated by blank lines.
// A single line break inside a step is just wrapping.
export function recipeSteps(text) {
  const steps = (text ?? '').trim()
  if (steps === '') return []
  if (steps.startsWith('[')) return listItems(steps).map(withoutNumber).filter(Boolean)
  if (/^\d+[.)]\s/.test(steps)) return numberedLines(steps)
  return paragraphs(steps)
}

// Markdown recipes: paragraphs, until "Fuentes:" (the links to the sources).
function paragraphs(text) {
  const all = text.split(/\n\s*\n/).map(joinLines)
  const sources = all.findIndex((p) => /^fuentes?:/i.test(p))
  return (sources === -1 ? all : all.slice(0, sources)).filter(Boolean)
}

// The quoted items of "['…', "…", '…']" (the sources have no escaped quotes).
function listItems(text) {
  const items = []
  for (let i = 1; i < text.length; i++) {
    const quote = text[i]
    if (quote !== "'" && quote !== '"') continue
    const end = text.indexOf(quote, i + 1)
    if (end === -1) break
    items.push(text.slice(i + 1, end))
    i = end
  }
  return items
}

function numberedLines(text) {
  return text.split(/\n(?=\s*\d+[.)]\s)/).map(withoutNumber).filter(Boolean)
}

// "2 Hervirlas." or "2. Hervirlas." → "Hervirlas."
function withoutNumber(step) {
  return joinLines(step.replace(/^\s*\d+[.)]?\s+/, ''))
}

// Also turns markdown links "[puré](18.md)" into their text.
function joinLines(step) {
  return step
    .trim()
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

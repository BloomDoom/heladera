// In the dataset some accented letters were broken: "está" became "estÃ�"
// (the second byte of the letter was lost). The lost letter can't be read
// back, so each broken word is replaced by the spelling of it that appears
// most often elsewhere in the dataset.

const BROKEN = 'Ã�'
const CANDIDATES = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ']
const WORD = /[\p{L}�]+/gu

// How many times each word appears in the texts.
export function buildVocab(texts) {
  const vocab = new Map()
  for (const text of texts) {
    for (const word of text.match(WORD) || []) {
      if (!word.includes('�')) vocab.set(word, (vocab.get(word) || 0) + 1)
    }
  }
  return vocab
}

export function fixMojibake(text, vocab) {
  return text.replace(WORD, (word) => {
    if (!word.includes(BROKEN)) return word
    let best = null
    let bestCount = 0
    for (const c of CANDIDATES) {
      const candidate = word.split(BROKEN).join(c)
      const count = vocab.get(candidate) || 0
      if (count > bestCount) { best = candidate; bestCount = count }
    }
    if (!best) fixMojibake.unresolved++
    return best || word
  })
}
// Words that couldn't be fixed (no spelling of them in the dataset).
fixMojibake.unresolved = 0

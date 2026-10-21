// The two Argentine/Spanish markdown recipe books:
//   peregrinogris/recetario: recetas/<slug>.md, title in "## ", "### Ingredientes:"
//   peluso-cocina/recetario-culinario: Recetas/<title>.md with YAML front matter

const URLS = {
  peregrinogris: (slug) => `https://github.com/peregrinogris/recetario/blob/master/recetas/${slug}.md`,
  peluso: (slug) => `https://github.com/peluso-cocina/recetario-culinario/blob/main/Recetas/${encodeURIComponent(slug)}.md`,
}

// "1 h 15 min" → 75, "15 min" → 15
function minutesOfText(text) {
  if (!text) return null
  const h = /(\d+)\s*h/.exec(text)
  const m = /(\d+)\s*min/.exec(text)
  return h || m ? Number(h?.[1] || 0) * 60 + Number(m?.[1] || 0) : null
}

function frontMatter(lines) {
  if (lines[0] !== '---') return { meta: {}, body: lines }
  const end = lines.indexOf('---', 1)
  const meta = {}
  for (const line of lines.slice(1, end)) {
    const m = /^(\w+):\s*(.*)$/.exec(line)
    if (m) meta[m[1]] = m[2].trim()
  }
  return { meta, body: lines.slice(end + 1) }
}

export function parseMarkdownRecipe(text, source, slug) {
  const { meta, body } = frontMatter(text.replace(/\r/g, '').split('\n'))
  let title = null
  let mode = null // 'ingredients' | 'steps' | null
  const ingredients = []
  const steps = []
  let servings = Number(meta.raciones) || null

  for (const raw of body) {
    const heading = /^(#+)\s*(.*?):?\s*$/.exec(raw)
    if (heading) {
      const name = heading[2].toLowerCase()
      if (heading[1] === '##' && !title && source === 'peregrinogris') title = heading[2]
      else if (name.startsWith('ingredientes')) mode = 'ingredients'
      else if (/^(preparaci|elaboraci)/.test(name)) mode = 'steps'
      else if (/^(notas|fuentes)/.test(name)) mode = null
      // other headings ("Masa", "Relleno") keep the current section
      continue
    }
    if (mode === 'ingredients') {
      const item = /^\s*[-*]\s+(.*)$/.exec(raw)
      if (item) ingredients.push(item[1].trim())
      const yields = /Rinde\s+(\d+)/i.exec(raw)
      if (yields && !servings) servings = Number(yields[1])
    } else if (mode === 'steps') {
      const line = raw
        .replace(/^\s*>\s?/, '')        // blockquote
        .replace(/<[^>]+>/g, '')        // HTML
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
        .replace(/[_*]{1,3}/g, '')      // bold/italic markers
        .trim()
      steps.push(line)
    }
  }

  return {
    sourceKey: `${source}:${slug}`,
    source,
    url: URLS[source](slug),
    title: title || slug,
    minutes: minutesOfText(meta.tiempo_elaboracion),
    servings,
    difficulty: { baja: 'baja', media: 'media', alta: 'alta' }[(meta.dificultad || '').toLowerCase()] || null,
    country: source === 'peregrinogris' ? 'ARG' : null,
    ingredients,
    // Paragraphs separated by one blank line, no blank lines at the ends.
    steps: steps.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  }
}

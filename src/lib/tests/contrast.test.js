import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Reads the two theme blocks in index.css and checks that every text color
// stays readable (WCAG 4.5:1) on the background it is used on.
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

function tokens(theme) {
  const block = css.match(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))
  assert.ok(block, `no [data-theme='${theme}'] block in index.css`)
  const found = {}
  for (const [, name, hex] of block[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) found[name] = hex
  return found
}

function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAIRS = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['primary-text', 'primary'],
  ['primary-ink', 'bg'],
  ['primary-ink', 'surface'],
  ['danger', 'surface'],
  ['warn', 'surface'],
  ['freezer', 'surface'],
  ['ok', 'surface'],
  ['note-ink', 'note'],
  ['tab-active-text', 'tab-active-bg'],
  ['muted', 'tab-bg'],
  ['toast-text', 'toast-bg'],
]

for (const theme of ['light', 'dark']) {
  test(`every token pair passes 4.5:1 in ${theme}`, () => {
    const t = tokens(theme)
    for (const [fg, bg] of PAIRS) {
      assert.ok(t[fg] && t[bg], `${theme}: --${fg} or --${bg} is missing`)
      const r = ratio(t[fg], t[bg])
      assert.ok(r >= 4.5, `${theme}: --${fg} on --${bg} is ${r.toFixed(2)}:1`)
    }
  })
}

// Edges of fields only need 3:1 (WCAG non-text contrast).
for (const theme of ['light', 'dark']) {
  test(`field borders are visible (3:1) in ${theme}`, () => {
    const t = tokens(theme)
    for (const bg of ['surface', 'bg']) {
      assert.ok(t['field-border'], `${theme}: --field-border is missing`)
      const r = ratio(t['field-border'], t[bg])
      assert.ok(r >= 3, `${theme}: --field-border on --${bg} is ${r.toFixed(2)}:1`)
    }
  })
}

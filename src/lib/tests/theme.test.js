import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTheme, saveTheme, applyTheme } from '../theme.js'

function fakeStorage(values) {
  return {
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
      values[key] = value
    },
  }
}

const throwing = {
  getItem() {
    throw new Error('blocked')
  },
  setItem() {
    throw new Error('blocked')
  },
}

function fakeDoc() {
  const meta = { content: '#fbfbfa' }
  return {
    meta,
    documentElement: { dataset: {}, style: {} },
    querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? meta : null),
  }
}

test('readTheme returns light when nothing is saved', () => {
  assert.equal(readTheme(fakeStorage({})), 'light')
})

test('readTheme returns the saved theme', () => {
  assert.equal(readTheme(fakeStorage({ 'heladera-theme': 'dark' })), 'dark')
})

test('readTheme ignores unknown values', () => {
  assert.equal(readTheme(fakeStorage({ 'heladera-theme': 'blue' })), 'light')
})

test('readTheme survives storage that throws', () => {
  assert.equal(readTheme(throwing), 'light')
  assert.equal(readTheme(undefined), 'light')
})

test('saveTheme stores the theme', () => {
  const values = {}
  saveTheme(fakeStorage(values), 'dark')
  assert.equal(values['heladera-theme'], 'dark')
})

test('saveTheme survives storage that throws', () => {
  assert.doesNotThrow(() => saveTheme(throwing, 'dark'))
  assert.doesNotThrow(() => saveTheme(undefined, 'dark'))
})

test('applyTheme sets data-theme, color-scheme and the meta color', () => {
  const doc = fakeDoc()
  applyTheme('dark', doc)
  assert.equal(doc.documentElement.dataset.theme, 'dark')
  assert.equal(doc.documentElement.style.colorScheme, 'dark')
  assert.equal(doc.meta.content, '#2b2e33')
  applyTheme('light', doc)
  assert.equal(doc.documentElement.dataset.theme, 'light')
  assert.equal(doc.meta.content, '#fbfbfa')
})

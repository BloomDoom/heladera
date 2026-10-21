import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepare, matchProducts, isIgnored, argentinize, CATEGORIES } from '../normalize.js'

const load = (name) => JSON.parse(readFileSync(new URL(`../dictionary/${name}`, import.meta.url), 'utf8'))
const products = load('products.json')
const words = load('es-ar.json')
const ignore = load('ignore.json')
const d = prepare(products)
const match = (line) => matchProducts(line, d)

test('matchProducts strips quantities and units', () => {
  assert.deepEqual(match('½ taza de cilantro finamente picado'), ['cilantro'])
  assert.deepEqual(match('300gr de lentejas'), ['lentejas'])
  assert.deepEqual(match('2 o 3 hojas de laurel seco'), ['laurel'])
})

test('matchProducts returns every product in a line', () => {
  assert.deepEqual(match('Sal y pimienta al gusto'), ['sal', 'pimienta'])
})

test('matchProducts matches whole words, longest first', () => {
  assert.ok(!match('2 cucharadas de semillas de ajonjolí').includes('ajo'))
  assert.deepEqual(match('1 pimiento rojo'), ['morron'])
  assert.deepEqual(match('1 taza de harina de maíz'), ['harina-de-maiz'])
  assert.deepEqual(match('2 dientes de ajo'), ['ajo'])
})

test('generic products', () => {
  assert.deepEqual(match('500 g de carne picada'), ['carne-de-vaca'])
  assert.deepEqual(match('1 kg de nalga'), ['carne-de-vaca'])
  assert.deepEqual(match('1 taza de leche descremada'), ['leche'])
  assert.deepEqual(match('3 patatas'), ['papa'])
})

test('isIgnored', () => {
  assert.equal(isIgnored('24 palillos de madera para sostener', ignore), true)
  assert.equal(isIgnored('1 cebolla', ignore), false)
})

test('argentinize keeps case and whole words', () => {
  assert.equal(argentinize('Patatas con nata', words), 'Papas con crema')
  assert.equal(argentinize('patatero', words), 'patatero')
  assert.equal(argentinize('Judías verdes salteadas', words), 'Chauchas salteadas')
})

test('dictionary is valid', () => {
  const codes = new Set()
  const owner = new Map()
  for (const p of products) {
    assert.ok(!codes.has(p.code), `repeated code ${p.code}`)
    codes.add(p.code)
    assert.ok(CATEGORIES.includes(p.category), `${p.code}: category ${p.category}`)
    assert.ok(['fridge', 'pantry'].includes(p.storage), `${p.code}: storage`)
    assert.ok(Number.isInteger(p.shelf_days) && p.shelf_days > 0, `${p.code}: shelf_days`)
    assert.equal(typeof p.minor, 'boolean', `${p.code}: minor`)
    for (const s of [p.name, ...p.synonyms]) {
      const key = s.toLowerCase()
      assert.ok(!owner.has(key) || owner.get(key) === p.code, `"${s}" in ${owner.get(key)} and ${p.code}`)
      owner.set(key, p.code)
    }
  }
  for (const code of ['sal', 'pimienta', 'aceite', 'agua']) {
    assert.equal(products.find((p) => p.code === code)?.assumed, true, code)
  }
})

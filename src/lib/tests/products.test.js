import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CATEGORIES,
  DEFAULT_FREQUENT,
  SHOPS,
  normalizeText,
  searchProducts,
  findByName,
  frequentProducts,
  groupByShop,
} from '../products.js'

let nextId = 1
const p = (code, name, category, synonyms = []) => ({
  id: nextId++,
  code,
  household_id: null,
  name,
  category,
  storage: 'fridge',
  shelf_days: 7,
  synonyms,
})

const limon = p('limon', 'Limón', 'fruta')
const carne = p('carne-de-vaca', 'Carne de vaca', 'carne', ['nalga', 'carne picada'])
const queso = p('queso', 'Queso', 'lacteo')
const quesoCrema = p('queso-crema', 'Queso crema', 'lacteo')
const crema = p('crema', 'Crema', 'lacteo')
const ajo = p('ajo', 'Ajo', 'verdura')
const agua = p('agua', 'Agua', 'bebida')
const leche = p('leche', 'Leche', 'lacteo')
const tomate = p('tomate', 'Tomate', 'verdura')
const huevo = p('huevo', 'Huevos', 'huevo')
const arroz = p('arroz', 'Arroz', 'almacen')
const lechuga = p('lechuga', 'Lechuga', 'verdura')
const pollo = p('pollo', 'Pollo', 'pollo')

test('normalizeText lowers case, strips accents and collapses spaces', () => {
  assert.equal(normalizeText('  LIMÓN   Verde '), 'limon verde')
})

test('searchProducts ignores accents and case and matches synonyms', () => {
  const all = [limon, carne, ajo]
  assert.deepEqual(searchProducts(all, 'limon'), [limon])
  assert.deepEqual(searchProducts(all, 'LIMÓN'), [limon])
  assert.deepEqual(searchProducts(all, 'nalga'), [carne])
  assert.deepEqual(searchProducts(all, '  '), [])
})

test('searchProducts matches word starts, name matches first', () => {
  const all = [queso, quesoCrema, crema, ajo]
  assert.deepEqual(searchProducts(all, 'que'), [queso, quesoCrema])
  assert.deepEqual(searchProducts(all, 'crema'), [crema, quesoCrema])
  assert.deepEqual(searchProducts(all, 'jo'), [])
})

test('searchProducts puts synonym-only matches last', () => {
  const all = [carne, p('x', 'Nalgas', 'carne')]
  assert.deepEqual(searchProducts(all, 'nalga').map((x) => x.name), ['Nalgas', 'Carne de vaca'])
})

test('searchProducts never shows agua', () => {
  assert.deepEqual(searchProducts([agua], 'agua'), [])
})

test('findByName matches ignoring accents, case and spaces', () => {
  const all = [leche, limon, carne]
  assert.equal(findByName(all, ' leche '), leche)
  assert.equal(findByName(all, 'Limon'), limon)
  assert.equal(findByName(all, 'carne picada'), carne)
  assert.equal(findByName(all, 'mburucuya'), null)
})

test('frequentProducts ranks by purchases and fills with defaults', () => {
  const all = [tomate, queso, huevo, leche, arroz]
  const purchases = [
    { product_id: tomate.id, bought_on: '2026-10-01' },
    { product_id: tomate.id, bought_on: '2026-10-05' },
    { product_id: tomate.id, bought_on: '2026-10-09' },
    { product_id: queso.id, bought_on: '2026-10-02' },
  ]
  assert.deepEqual(frequentProducts(all, purchases, 4), [tomate, queso, huevo, leche])
})

test('frequentProducts breaks ties by most recent purchase', () => {
  const all = [tomate, queso]
  const purchases = [
    { product_id: tomate.id, bought_on: '2026-10-01' },
    { product_id: queso.id, bought_on: '2026-10-09' },
  ]
  assert.deepEqual(frequentProducts(all, purchases, 2), [queso, tomate])
})

test('groupByShop splits by shop and skips empty shops', () => {
  const groups = groupByShop([lechuga, pollo, arroz, agua])
  assert.deepEqual(
    groups.map((g) => [g.shop.key, g.products]),
    [['verduleria', [lechuga]], ['carniceria', [pollo]], ['super', [arroz]]],
  )
})

test('every dictionary category has a CATEGORIES entry', () => {
  const dictionary = JSON.parse(readFileSync('scripts/recipes/dictionary/products.json', 'utf8'))
  const keys = CATEGORIES.map((c) => c.key)
  for (const product of dictionary) assert.ok(keys.includes(product.category), product.category)
  const codes = dictionary.map((x) => x.code)
  for (const code of DEFAULT_FREQUENT) assert.ok(codes.includes(code), code)
  const shopped = SHOPS.flatMap((s) => s.categories).sort()
  assert.deepEqual(shopped, [...keys].sort())
})

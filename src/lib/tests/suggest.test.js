import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankSuggestions, urgencyText, noveltyText } from '../suggest.js'

const TODAY = '2026-10-22'

const cand = (recipe_id, used = [], extra = {}) => ({
  recipe_id,
  title: `Receta ${recipe_id}`,
  minutes: 30,
  used_product_ids: used,
  missing_product_id: null,
  missing_product_name: null,
  ...extra,
})
const item = (product_id, name, shelf_days, added_on) => ({
  product_id,
  added_on,
  expires_on: null,
  product: { name, shelf_days },
})
const rank = (args) => rankSuggestions({ items: [], cooked: [], rejections: [], today: TODAY, ...args })
const ids = (list) => list.map((s) => s.recipeId)

test('expiring products come first', () => {
  // huevo: added 10-20, 3 days -> expires 10-23 -> 1 day left; papa: 10 days left
  const items = [item(1, 'Huevo', 3, '2026-10-20'), item(2, 'Papa', 12, '2026-10-20')]
  const result = rank({ candidates: [cand(2, [2]), cand(1, [1])], items })
  assert.deepEqual(ids(result), [1, 2])
  assert.deepEqual(result[0].reasons, ['Huevo vence mañana', 'No lo cocinan hace meses'])
})

test('cooked this week sinks', () => {
  const cooked = [
    { id: 1, recipe_id: 1, cooked_on: '2026-10-19' },
    { id: 2, recipe_id: 2, cooked_on: '2026-09-01' },
  ]
  const result = rank({ candidates: [cand(1), cand(2)], cooked })
  assert.deepEqual(ids(result), [2, 1])
  assert.ok(result[0].reasons.includes('No lo comen hace 7 semanas'))
})

test('uses the most recent cooked date', () => {
  const cooked = [
    { id: 1, recipe_id: 1, cooked_on: '2026-08-01' },
    { id: 2, recipe_id: 1, cooked_on: '2026-10-20' },
  ]
  const [s] = rank({ candidates: [cand(1)], cooked })
  assert.equal(s.score, -3)
})

test('rejected dishes sink but stay', () => {
  const rejections = [{ recipe_id: 1, rejected_on: '2026-10-22' }]
  assert.deepEqual(ids(rank({ candidates: [cand(1), cand(2)], rejections })), [2, 1])
  assert.deepEqual(ids(rank({ candidates: [cand(1)], rejections })), [1])
})

test('older rejections weigh less', () => {
  const rejections = [
    { recipe_id: 1, rejected_on: '2026-10-15' },
    { recipe_id: 2, rejected_on: '2026-10-21' },
  ]
  assert.deepEqual(ids(rank({ candidates: [cand(2), cand(1)], rejections })), [1, 2])
})

test('a missing minor is warned and lowers the dish', () => {
  const a = cand(1, [], { missing_product_id: 9, missing_product_name: 'Cebolla' })
  const result = rank({ candidates: [a, cand(2)] })
  assert.deepEqual(ids(result), [2, 1])
  assert.equal(result[1].missing, 'Falta cebolla')
  assert.equal(result[0].missing, null)
})

test('no reason falls back', () => {
  const cooked = [{ id: 1, recipe_id: 1, cooked_on: '2026-10-12' }]
  const [s] = rank({ candidates: [cand(1)], cooked })
  assert.deepEqual(s.reasons, ['Se puede hacer con lo que hay'])
})

test('scores add up', () => {
  const items = [item(1, 'Huevo', 3, '2026-10-20')]
  const [s] = rank({ candidates: [cand(1, [1])], items })
  assert.equal(s.score, 5)
})

test('order is stable within a day and changes across days', () => {
  const candidates = Array.from({ length: 20 }, (_, i) => cand(i + 1))
  const a = ids(rank({ candidates }))
  assert.deepEqual(ids(rank({ candidates })), a)
  assert.notDeepEqual(ids(rank({ candidates, today: '2026-10-23' })), a)
})

test('urgencyText', () => {
  assert.equal(urgencyText('Huevo', 0), 'Huevo vence hoy')
  assert.equal(urgencyText('Huevo', 1), 'Huevo vence mañana')
  assert.equal(urgencyText('Huevo', 2), 'Huevo vence en 2 días')
  assert.equal(urgencyText('Huevo', -3), 'Huevo ya pasó la fecha estimada')
})

test('noveltyText', () => {
  assert.equal(noveltyText(null), 'No lo cocinan hace meses')
  assert.equal(noveltyText(14), 'No lo comen hace 2 semanas')
})

test('a missing product without a name still says something', () => {
  const a = cand(1, [], { missing_product_id: 9, missing_product_name: null })
  assert.equal(rank({ candidates: [a] })[0].missing, 'Falta algo')
})

test('favorites and own recipes go up', () => {
  const fav = rank({ candidates: [cand(2), cand(1, [], { favorite: true })] })
  assert.deepEqual(ids(fav), [1, 2])
  assert.deepEqual(fav[0].reasons, ['Es una de sus favoritas', 'No lo cocinan hace meses'])
  assert.equal(fav[0].score, 4)

  const own = rank({ candidates: [cand(2), cand(1, [], { own: true })] })
  assert.deepEqual(ids(own), [1, 2])
  assert.deepEqual(own[0].reasons, ['Es una receta de ustedes', 'No lo cocinan hace meses'])

  const both = rank({ candidates: [cand(1, [], { own: true, favorite: true })] })
  assert.deepEqual(both[0].reasons, ['Es una receta de ustedes', 'No lo cocinan hace meses'])
  assert.equal(both[0].score, 4)
})

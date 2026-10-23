import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshness, freshnessText, compareItems, comparePantry, freezerText, FREEZER_DAYS } from '../freshness.js'

const item = (name, shelf_days, added_on, expires_on = null) => ({
  product_id: name,
  added_on,
  expires_on,
  product: { name, shelf_days },
})

test('freshness estimates from shelf days', () => {
  const f = freshness(item('leche', 7, '2026-10-20'), '2026-10-22')
  assert.deepEqual(f, { expiresOn: '2026-10-27', daysIn: 2, daysLeft: 5, status: 'ok', manual: false })
})

test('freshness prefers the hand-set date', () => {
  const f = freshness(item('leche', 7, '2026-10-20', '2026-10-23'), '2026-10-22')
  assert.deepEqual(f, { expiresOn: '2026-10-23', daysIn: 2, daysLeft: 1, status: 'soon', manual: true })
})

test('freshness is over after the estimate', () => {
  const f = freshness(item('lechuga', 5, '2026-10-16'), '2026-10-22')
  assert.equal(f.daysLeft, -1)
  assert.equal(f.status, 'over')
})

test('freshness without shelf days never warns', () => {
  const f = freshness(item('sal', null, '2026-10-16'), '2026-10-22')
  assert.equal(f.expiresOn, null)
  assert.equal(f.daysLeft, null)
  assert.equal(f.status, 'ok')
})

test('freshnessText says how long it has been in', () => {
  const since = (daysIn) => freshnessText({ daysIn, daysLeft: null, status: 'ok' }).since
  assert.equal(since(0), 'Entró hoy')
  assert.equal(since(1), 'Entró ayer')
  assert.equal(since(6), 'Hace 6 días')
})

test('freshnessText warns only when about to go off', () => {
  const warning = (daysLeft, status, manual = false) =>
    freshnessText({ daysIn: 3, daysLeft, status, manual }).warning
  assert.equal(warning(0, 'soon'), 'Vence hoy')
  assert.equal(warning(1, 'soon'), 'Vence mañana')
  assert.equal(warning(2, 'soon'), 'Vence en 2 días')
  assert.equal(warning(-1, 'over'), 'Venció ayer')
  assert.equal(warning(-3, 'over'), 'Venció hace 3 días')
  assert.equal(warning(1, 'soon', true), 'Vence mañana')
  assert.equal(warning(5, 'ok'), null)
  assert.equal(warning(null, 'ok'), null)
})

test('compareItems puts the most urgent first', () => {
  const today = '2026-10-22'
  const a = item('a', 8, '2026-10-17') // 3 left
  const b = item('b', 5, '2026-10-16') // -1
  const c = item('c', null, '2026-10-16') // none
  const sorted = [c, a, b].sort((x, y) => compareItems(x, y, today))
  assert.deepEqual(sorted.map((i) => i.product.name), ['b', 'a', 'c'])
})

test('compareItems breaks ties by name', () => {
  const today = '2026-10-22'
  const sorted = [item('zanahoria', null, '2026-10-20'), item('ají', null, '2026-10-20')]
    .sort((x, y) => compareItems(x, y, today))
  assert.deepEqual(sorted.map((i) => i.product.name), ['ají', 'zanahoria'])
})

const placed = (name, shelf_days, added_on, place) => ({ ...item(name, shelf_days, added_on), place })

test('freezer items last 90 days', () => {
  assert.equal(FREEZER_DAYS, 90)
  const f = freshness(placed('pollo', 3, '2026-10-01', 'freezer'), '2026-10-23')
  assert.equal(f.expiresOn, '2026-12-30')
})

test('freezer text', () => {
  const f = freshness(placed('pollo', 3, '2026-10-01', 'freezer'), '2026-10-23')
  assert.equal(freshnessText(f, 'freezer').since, 'Hasta el 30/12')
  assert.equal(freshnessText({ daysIn: 1, daysLeft: null, status: 'ok', expiresOn: null }, 'freezer').since, null)
})

test('pantry rows only warn', () => {
  const today = '2026-10-23'
  const pan = freshnessText(freshness(placed('pan', 4, '2026-10-20', 'pantry'), today), 'pantry')
  assert.deepEqual(pan, { since: null, warning: 'Vence mañana' })
  const arroz = freshnessText(freshness(placed('arroz', 180, '2026-10-20', 'pantry'), today), 'pantry')
  assert.deepEqual(arroz, { since: null, warning: null })
})

test('comparePantry puts soon first, then by name', () => {
  const today = '2026-10-23'
  const list = [
    placed('arroz', 180, '2026-10-20', 'pantry'),
    placed('pan', 4, '2026-10-20', 'pantry'),
    placed('aceite', 365, '2026-10-20', 'pantry'),
  ].sort((x, y) => comparePantry(x, y, today))
  assert.deepEqual(list.map((i) => i.product.name), ['pan', 'aceite', 'arroz'])
})

test('freezerText joins names', () => {
  assert.equal(freezerText([]), null)
  assert.equal(freezerText(['Pollo']), 'Pollo está en el freezer')
  assert.equal(freezerText(['Pollo', 'Carne picada']), 'Pollo y carne picada están en el freezer')
  assert.equal(freezerText(['Pollo', 'Carne picada', 'Merluza']), 'Pollo, carne picada y merluza están en el freezer')
})

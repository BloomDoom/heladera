import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyOrder } from '../suggest.js'
import { habits, habitText, dueHabits, reasonText, buildList, rankWeek } from '../shoppingList.js'

const TODAY = '2026-10-22'
const buys = (id, ...days) => days.map((bought_on) => ({ product_id: id, bought_on }))

test('habitual needs three distinct days', () => {
  assert.equal(habits(buys('a', '2026-10-01', '2026-10-08')).size, 0)
  assert.equal(habits(buys('a', '2026-10-01', '2026-10-01', '2026-10-08')).size, 0)
  const h = habits(buys('a', '2026-10-01', '2026-10-08', '2026-10-15')).get('a')
  assert.equal(h.interval, 7)
  assert.equal(h.last, '2026-10-15')
})

test('habit interval is the median gap', () => {
  // gaps 7, 7, 30
  const h = habits(buys('a', '2026-08-01', '2026-08-08', '2026-08-15', '2026-09-14')).get('a')
  assert.equal(h.interval, 7)
})

test('habitText boundaries', () => {
  assert.equal(habitText(4), 'Lo comprás cada pocos días')
  assert.equal(habitText(5), 'Lo comprás cada semana')
  assert.equal(habitText(10), 'Lo comprás cada semana')
  assert.equal(habitText(11), 'Lo comprás cada dos semanas')
  assert.equal(habitText(20), 'Lo comprás cada dos semanas')
  assert.equal(habitText(21), 'Lo comprás cada mes')
  assert.equal(habitText(45), 'Lo comprás cada mes')
  assert.equal(habitText(46), 'Lo comprás cada 46 días')
})

const habitsMap = new Map([['a', { product_id: 'a', interval: 7, last: '2026-10-15' }]])
const due = (over = {}, today = TODAY) =>
  dueHabits({ habits: habitsMap, presentIds: new Set(), listedIds: new Set(), snoozes: [], today, ...over })

test('a habit is due after its interval', () => {
  assert.equal(due({}, '2026-10-21').length, 0)
  assert.equal(due({}, '2026-10-22').length, 1)
})

test('present or listed habits are not due', () => {
  assert.equal(due({ presentIds: new Set(['a']) }).length, 0)
  assert.equal(due({ listedIds: new Set(['a']) }).length, 0)
})

test('a snooze hides it for one interval', () => {
  const snoozes = [{ product_id: 'a', snoozed_on: '2026-10-22' }]
  assert.equal(due({ snoozes }, '2026-10-28').length, 0)
  assert.equal(due({ snoozes }, '2026-10-29').length, 1)
})

test('most overdue habit comes first', () => {
  const m = new Map([
    ['a', { product_id: 'a', interval: 7, last: '2026-10-14' }],
    ['b', { product_id: 'b', interval: 7, last: '2026-10-01' }],
  ])
  const ids = due({ habits: m }).map((h) => h.product_id)
  assert.deepEqual(ids, ['b', 'a'])
})

test('reasonText', () => {
  const row = (reason, extra = {}) => ({ product_id: 'a', reason, recipe: null, ...extra })
  assert.equal(reasonText(row('se_acabo'), habitsMap), 'Se acabó')
  assert.equal(reasonText(row('habitual'), habitsMap), 'Lo comprás cada semana')
  assert.equal(reasonText(row('habitual', { product_id: 'z' }), habitsMap), 'Lo comprás seguido')
  assert.equal(reasonText(row('plato', { recipe: { title: 'Tarta' } }), habitsMap), 'Para Tarta')
  assert.equal(reasonText(row('plato'), habitsMap), 'Para un plato')
  assert.equal(reasonText(row('a_mano'), habitsMap), null)
})

test('buildList groups by category and puts checked in the cart', () => {
  const r = (id, name, category, checked) => ({
    product_id: id, reason: 'a_mano', recipe_id: null, added_on: TODAY, checked, product: { id, name, category }, recipe: null,
  })
  const rows = [r('l', 'Leche', 'lacteo', false), r('t', 'Tomate', 'verdura', true), r('c', 'Cebolla', 'verdura', false)]
  const products = [{ id: 'p', name: 'Pan', category: 'panificado' }]
  const dueList = [{ product_id: 'p', interval: 3, last: '2026-10-10' }]
  const { groups, cart } = buildList({ rows, due: dueList, products, habitsMap: new Map() })
  assert.deepEqual(groups.map((g) => [g.label, g.entries.map((e) => e.name)]), [
    ['Verdura', ['Cebolla']],
    ['Lácteo', ['Leche']],
    ['Panadería', ['Pan']],
  ])
  assert.deepEqual(cart.map((e) => e.name), ['Tomate'])
  assert.equal(groups[1].entries[0].reasonText, null)
  const pan = groups[2].entries[0]
  assert.equal(pan.stored, false)
  assert.equal(pan.reasonText, 'Lo comprás cada pocos días')
})

test('rankWeek drops recent dishes and prefers favorites', () => {
  const c = (id, missing, extra = {}) => ({
    recipe_id: id, title: id, minutes: 30, missing_names: Array(missing).fill('x'), own: false, favorite: false, ...extra,
  })
  const candidates = [c('plain', 1), c('fav', 3, { favorite: true }), c('recent', 0)]
  const cooked = [{ recipe_id: 'recent', cooked_on: '2026-10-19' }]
  const out = rankWeek({ candidates, cooked, today: TODAY }).map((x) => x.recipe_id)
  assert.deepEqual(out, ['fav', 'plain'])
})

test('even-count median takes the lower middle', () => {
  // gaps 7, 30
  const h = habits(buys('a', '2026-08-01', '2026-08-08', '2026-09-07')).get('a')
  assert.equal(h.interval, 7)
})

test('a snooze for another product does not hide the habit', () => {
  assert.equal(due({ snoozes: [{ product_id: 'z', snoozed_on: TODAY }] }).length, 1)
})

test('buildList sorts by name within a group and keeps unknown categories', () => {
  const r = (id, name, category) => ({
    product_id: id, reason: 'se_acabo', recipe_id: null, added_on: TODAY, checked: false, product: { id, name, category }, recipe: null,
  })
  const rows = [r('1', 'Zanahoria', 'verdura'), r('2', 'Ajo', 'verdura'), r('3', 'Zeta', 'raro'), r('4', 'Alfa', 'raro')]
  const { groups } = buildList({ rows, due: [], products: [], habitsMap: new Map() })
  assert.deepEqual(groups.map((g) => [g.key, g.entries.map((e) => e.name)]), [
    ['verdura', ['Ajo', 'Zanahoria']],
    ['otros', ['Alfa', 'Zeta']],
  ])
  assert.equal(groups[1].label, 'Otros')
  assert.equal(groups[0].entries[0].reasonText, 'Se acabó')
})

test('rankWeek: own ranks like favorite, 14-day boundary, ties by dailyOrder', () => {
  const c = (id, extra = {}) => ({ recipe_id: id, title: id, minutes: 30, missing_names: [], own: false, favorite: false, ...extra })
  const ids = (o) => o.map((x) => x.recipe_id)
  assert.deepEqual(ids(rankWeek({ candidates: [c('plain'), c('mine', { own: true })], cooked: [], today: TODAY })), ['mine', 'plain'])

  const cooked = [
    { recipe_id: 'a', cooked_on: '2026-10-09' }, // 13 days ago
    { recipe_id: 'b', cooked_on: '2026-10-08' }, // 14 days ago
  ]
  assert.deepEqual(ids(rankWeek({ candidates: [c('a'), c('b')], cooked, today: TODAY })), ['b'])

  const tied = rankWeek({ candidates: [c('x'), c('y'), c('z')], cooked: [], today: TODAY })
  const expected = ['x', 'y', 'z'].sort((p, q) => dailyOrder(p, TODAY) - dailyOrder(q, TODAY))
  assert.deepEqual(ids(tied), expected)
})

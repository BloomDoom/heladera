import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todayISO, formatDate, addDays, daysBetween, plural } from '../format.js'

test('todayISO uses Argentina\'s date, not UTC', () => {
  assert.equal(todayISO(new Date('2026-10-23T01:30:00Z')), '2026-10-22')
})

test('formatDate shows DD/MM/YYYY', () => {
  assert.equal(formatDate('2026-10-22'), '22/10/2026')
  assert.equal(formatDate(null), '')
})

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-10-20', 7), '2026-10-27')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-10-20', '2026-10-22'), 2)
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1)
  assert.equal(daysBetween('2026-10-22', '2026-10-20'), -2)
})

test('plural picks one or many', () => {
  assert.equal(plural(1, 'día', 'días'), '1 día')
  assert.equal(plural(3, 'día', 'días'), '3 días')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { swipeDirection } from '../swipe.js'

test('swipeDirection', () => {
  assert.equal(swipeDirection(-81), 'left')
  assert.equal(swipeDirection(81), 'right')
  assert.equal(swipeDirection(40), null)
  assert.equal(swipeDirection(-80), null)
})

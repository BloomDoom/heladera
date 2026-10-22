import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateOwnRecipe, ownRecipeSteps, readOwnSteps, wholeNumber } from '../ownRecipe.js'
import { recipeSteps } from '../steps.js'

const ing = (product_id, product_name = 'Cebolla') => ({ product_id, product_name, line: '1 ' + product_name, is_main: false })
const valid = { title: 'Tortilla', ingredients: [ing(1, 'Huevo'), ing(2, 'Papa')], steps: ['Batir'] }

test('validateOwnRecipe reports the first error', () => {
  assert.equal(validateOwnRecipe({ ...valid, title: '  ' }), 'Poné un nombre.')
  assert.equal(validateOwnRecipe({ ...valid, ingredients: [] }), 'Agregá al menos un ingrediente.')
  assert.equal(validateOwnRecipe({ ...valid, ingredients: [ing(1), ing(null)] }), 'Elegí el producto de cada ingrediente.')
  assert.equal(validateOwnRecipe({ ...valid, steps: [' ', ''] }), 'Escribí al menos un paso.')
  assert.equal(validateOwnRecipe({ title: '', ingredients: [], steps: [] }), 'Poné un nombre.')
  assert.equal(validateOwnRecipe(valid), null)
})

test('validateOwnRecipe rejects a repeated product', () => {
  assert.equal(
    validateOwnRecipe({ ...valid, ingredients: [ing(7), ing(7)] }),
    'Cebolla está dos veces: dejalo en un solo renglón.',
  )
})

test('own steps survive a round trip', () => {
  const text = ownRecipeSteps(['2 huevos batidos con sal', ' ', 'Cocinar\nvuelta y vuelta'])
  assert.deepEqual(recipeSteps(text), ['2 huevos batidos con sal', 'Cocinar vuelta y vuelta'])
})

test('readOwnSteps gives back what ownRecipeSteps wrote', () => {
  for (const steps of [
    ['1. Precalentar el horno', 'Mezclar todo', 'Hornear'],
    ['[Opcional] rallar queso', 'Servir'],
    ['Hervir', 'Fuentes: mi vieja', 'Servir'],
    ['Cocinar\nvuelta y vuelta', 'Servir'],
  ]) {
    assert.deepEqual(readOwnSteps(ownRecipeSteps(steps)), steps)
  }
  // The form never lets a blank line into a step; if one got in, it reads as two.
  assert.deepEqual(readOwnSteps(ownRecipeSteps(['uno\n\ndos'])), ['uno', 'dos'])
  assert.deepEqual(readOwnSteps(null), [])
  assert.deepEqual(readOwnSteps(''), [])
})

test('wholeNumber reads the raw text of the field', () => {
  assert.equal(wholeNumber(''), null)
  assert.equal(wholeNumber('  '), null)
  assert.equal(wholeNumber('30'), 30)
  assert.ok(Number.isNaN(wholeNumber('1,5')))
  assert.ok(Number.isNaN(wholeNumber('abc')))
  assert.ok(Number.isNaN(wholeNumber('0')))
  assert.ok(Number.isNaN(wholeNumber('-2')))
})

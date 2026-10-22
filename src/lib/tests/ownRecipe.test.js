import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateOwnRecipe, ownRecipeSteps } from '../ownRecipe.js'
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

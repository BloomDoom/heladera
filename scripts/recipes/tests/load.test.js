import { test } from 'node:test'
import assert from 'node:assert/strict'
import { productRow, recipeRow, ingredientRows } from '../load.js'

const product = { code: 'leche', name: 'Leche', category: 'lacteo', storage: 'fridge', shelf_days: 7, minor: false, assumed: false, synonyms: ['leche entera'] }
const recipe = {
  sourceKey: 'abuela:1', source: 'abuela', url: 'https://x', title: 'Flan', minutes: 30, servings: 4,
  difficulty: 'baja', country: 'ESP', steps: 'Mezclar.',
  ingredients: [{ code: 'leche', line: '1 litro de leche', isMain: true }, { code: 'huevo', line: '4 huevos', isMain: false }],
}

test('rows use the table column names', () => {
  assert.deepEqual(productRow(product), {
    code: 'leche', name: 'Leche', category: 'lacteo', storage: 'fridge', shelf_days: 7, assumed: false, synonyms: ['leche entera'],
  })
  assert.deepEqual(recipeRow(recipe), {
    source_key: 'abuela:1', title: 'Flan', minutes: 30, servings: 4, difficulty: 'baja', country: 'ESP',
    steps: 'Mezclar.', source: 'abuela', source_url: 'https://x',
  })
})

test('ingredientRows maps codes and keys to ids', () => {
  const productIds = new Map([['leche', 10], ['huevo', 11]])
  const recipeIds = new Map([['abuela:1', 5]])
  assert.deepEqual(ingredientRows([recipe], productIds, recipeIds), [
    { recipe_id: 5, product_id: 10, line: '1 litro de leche', is_main: true },
    { recipe_id: 5, product_id: 11, line: '4 huevos', is_main: false },
  ])
})

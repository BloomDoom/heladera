import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchRecipes, searchByMissing, missingLine } from '../recipeSearch.js'

const recipes = [
  { id: 1, title: 'Tarta de pollo y verduras' },
  { id: 2, title: 'Pollo al limón' },
  { id: 3, title: 'Arroz con pollo' },
  { id: 4, title: 'Empanadas santiagueñas' },
  { id: 5, title: 'Polenta con salsa' },
]
const titles = (list) => list.map((r) => r.title)

test('searchRecipes ignores accents and capitals', () => {
  assert.deepEqual(titles(searchRecipes(recipes, 'LIMON', new Set())), ['Pollo al limón'])
  assert.deepEqual(titles(searchRecipes(recipes, 'santiaguenas', new Set())), ['Empanadas santiagueñas'])
})

test('searchRecipes matches word starts, every word of the query', () => {
  assert.deepEqual(titles(searchRecipes(recipes, 'pol', new Set())), [
    'Polenta con salsa',
    'Pollo al limón',
    'Arroz con pollo',
    'Tarta de pollo y verduras',
  ])
  assert.deepEqual(titles(searchRecipes(recipes, 'pollo arr', new Set())), ['Arroz con pollo'])
  assert.deepEqual(searchRecipes(recipes, 'ollo', new Set()), [])
})

test('searchRecipes puts the dishes you can make first', () => {
  assert.deepEqual(titles(searchRecipes(recipes, 'pollo', new Set([1]))), [
    'Tarta de pollo y verduras',
    'Pollo al limón',
    'Arroz con pollo',
  ])
})

test('searchRecipes puts titles that start with the query next', () => {
  assert.deepEqual(titles(searchRecipes(recipes, 'pollo', new Set())), [
    'Pollo al limón',
    'Arroz con pollo',
    'Tarta de pollo y verduras',
  ])
})

test('searchRecipes needs a query and caps the results', () => {
  assert.deepEqual(searchRecipes(recipes, '  ', new Set()), [])
  const many = Array.from({ length: 80 }, (_, i) => ({ id: i, title: `Guiso ${i}` }))
  assert.equal(searchRecipes(many, 'guiso', new Set()).length, 50)
})

const dishes = [
  { id: 1, title: 'Pollo al horno con papas', minutes: 60 },
  { id: 2, title: 'Pollo con papas fritas', minutes: 40 },
  { id: 3, title: 'Papas con pollo y crema', minutes: 50 },
  { id: 4, title: 'Pollo a la mostaza', minutes: 30 },
  { id: 5, title: 'Pollo con papas y batatas', minutes: 45 },
]

test('searchByMissing puts the dishes missing fewer things first', () => {
  const missing = new Map([
    [1, ['Cebolla', 'Crema', 'Romero']],
    [2, []],
    [3, ['Crema']],
  ])
  const found = searchByMissing(dishes, 'pollo papas', missing)
  assert.deepEqual(
    found.map((r) => [r.id, r.missing]),
    [
      [2, []],
      [3, ['Crema']],
      [1, ['Cebolla', 'Crema', 'Romero']],
      [5, null], // more than 3 missing: not known, goes last
    ],
  )
})

test('searchByMissing breaks ties by titles that start with the query, then by title', () => {
  const found = searchByMissing(dishes, 'pollo', new Map())
  assert.deepEqual(
    found.map((r) => r.id),
    [4, 1, 2, 5, 3],
  )
})

test('searchByMissing is empty for a blank query', () => {
  assert.deepEqual(searchByMissing(dishes, '  ', new Map()), [])
})

test('missingLine says what is missing, in a short line', () => {
  assert.equal(missingLine([]), 'Tenés todo')
  assert.equal(missingLine(['Papa', 'Cebolla']), 'Falta: papa, cebolla')
  assert.equal(missingLine(null), 'Faltan más de 3 cosas')
})

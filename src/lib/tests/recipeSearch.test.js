import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchRecipes } from '../recipeSearch.js'

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

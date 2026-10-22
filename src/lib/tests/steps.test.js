import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recipeSteps } from '../steps.js'

// Most recipes (RecetasDeLaAbuela) store their steps as a Python list
// written out as text, each step starting with its number.
test('recipeSteps reads a list written as text', () => {
  assert.deepEqual(recipeSteps("['1 Pelar las papas.', '2 Hervirlas 20 minutos.']"), [
    'Pelar las papas.',
    'Hervirlas 20 minutos.',
  ])
})

// A step with an apostrophe is written between double quotes instead.
test('recipeSteps reads steps between double quotes', () => {
  assert.deepEqual(recipeSteps(`['1 Cortar.', "2 Servir con salsa 'criolla'.", '3 Listo.']`), [
    'Cortar.',
    "Servir con salsa 'criolla'.",
    'Listo.',
  ])
})

test('recipeSteps reads numbered lines', () => {
  assert.deepEqual(recipeSteps('1. Caramelizar la cebolla.\n2. Sumar las zanahorias\ny las pasas.\n3) Mezclar.'), [
    'Caramelizar la cebolla.',
    'Sumar las zanahorias y las pasas.',
    'Mezclar.',
  ])
})

test('recipeSteps splits plain text on blank lines', () => {
  assert.deepEqual(recipeSteps('Limpiar el pescado\ny secarlo.\n\nDorarlo un minuto.\n\n'), [
    'Limpiar el pescado y secarlo.',
    'Dorarlo un minuto.',
  ])
})

// The markdown recipes end with their sources and use [text](link).
test('recipeSteps drops the sources and keeps link text', () => {
  assert.deepEqual(
    recipeSteps('Acompañar con [puré de manzanas](18.md).\n\nFuentes:\n\n[http://cociname.com.ar/carre]'),
    ['Acompañar con puré de manzanas.'],
  )
})

test('recipeSteps handles nothing', () => {
  assert.deepEqual(recipeSteps(null), [])
  assert.deepEqual(recipeSteps('  '), [])
  assert.deepEqual(recipeSteps('[]'), [])
})

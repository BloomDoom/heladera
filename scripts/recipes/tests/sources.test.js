import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from '../csv.js'
import { splitIngredients, minutesOf, isDinnerDish, readAbuela } from '../abuela.js'
import { parseMarkdownRecipe } from '../markdown.js'
import { buildVocab, fixMojibake } from '../mojibake.js'

test('parseCsv handles quotes, commas and newlines in fields', () => {
  const text = '﻿a,b,c\n1,"x, y","line 1\nline ""2"""\n2,,z\n'
  assert.deepEqual(parseCsv(text), [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'line 1\nline "2"'],
    ['2', '', 'z'],
  ])
})

test('splitIngredients reads both formats', () => {
  assert.deepEqual(splitIngredients("['1 huevo', '2 papas', '1 cucharada de aceite']"), [
    '1 huevo', '2 papas', '1 cucharada de aceite',
  ])
  assert.deepEqual(
    splitIngredients('½ taza de cilantro finamente picado, 1 taza de tomate picadito, Sal al gusto'),
    ['½ taza de cilantro finamente picado', '1 taza de tomate picadito', 'Sal al gusto'],
  )
  assert.deepEqual(splitIngredients(''), [])
})

test('minutesOf', () => {
  assert.equal(minutesOf('00:45'), 45)
  assert.equal(minutesOf('01:00'), 60)
  assert.equal(minutesOf('24:00:00'), null)
  assert.equal(minutesOf(''), null)
})

const row = (over = {}) => ({
  Id: '7', Nombre: 'Guiso', URL: 'https://x/guiso', Ingredientes: "['1 papa', '1 cebolla']",
  Pasos: 'Cocinar.', Pais: 'ARG', Duracion: '00:30', Categoria: '[]', Contexto: '',
  'Valoracion y Votos': '', Comensales: '4 comensales', Tiempo: 'Plato principal',
  Dificultad: 'Dificultad baja', 'Valor nutricional': '', ...over,
})

test('isDinnerDish', () => {
  assert.equal(isDinnerDish(row()), true)
  assert.equal(isDinnerDish(row({ Tiempo: 'Cena', Dificultad: 'Dificultad media' })), true)
  assert.equal(isDinnerDish(row({ Tiempo: 'Postre' })), false)
  assert.equal(isDinnerDish(row({ Tiempo: 'Entrante' })), false)
  assert.equal(isDinnerDish(row({ Tiempo: '' })), false)
  assert.equal(isDinnerDish(row({ Dificultad: 'Dificultad alta' })), false)
  assert.equal(isDinnerDish(row({ Duracion: '01:30' })), false)
})

test('readAbuela maps a row', () => {
  const header = Object.keys(row())
  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [header.join(','), Object.values(row()).map(quote).join(','),
    Object.values(row({ Id: '8', Tiempo: 'Postre' })).map(quote).join(',')].join('\n')
  assert.deepEqual(readAbuela(csv), [{
    sourceKey: 'abuela:7', source: 'abuela', url: 'https://x/guiso', title: 'Guiso', minutes: 30,
    servings: 4, difficulty: 'baja', country: 'ARG', ingredients: ['1 papa', '1 cebolla'], steps: 'Cocinar.',
  }])
})

test('parseMarkdownRecipe reads peregrinogris', () => {
  const md = [
    '## Guiso de Lentejas', '', '<div class="image">', '  <img src="x.jpg"/>', '</div>', '',
    '### Ingredientes:', '', '> Rinde 10 platos', '', '- 300gr de lentejas', '- 1 cebolla mediana', '',
    '### Preparación:', '', '> _**Remojado**_', '>', '> Dejar en remojo.', '', 'Cortar todo.', '',
    '#### Notas', '', 'Se puede freezar.',
  ].join('\n')
  const r = parseMarkdownRecipe(md, 'peregrinogris', 'guiso-lentejas')
  assert.equal(r.sourceKey, 'peregrinogris:guiso-lentejas')
  assert.equal(r.url, 'https://github.com/peregrinogris/recetario/blob/master/recetas/guiso-lentejas.md')
  assert.equal(r.title, 'Guiso de Lentejas')
  assert.deepEqual(r.ingredients, ['300gr de lentejas', '1 cebolla mediana'])
  assert.equal(r.steps, 'Remojado\n\nDejar en remojo.\n\nCortar todo.')
  assert.equal(r.servings, 10)
})

test('parseMarkdownRecipe reads peluso', () => {
  const md = [
    '---', 'raciones: 2', 'tiempo_elaboracion: 1 h 15 min', 'dificultad: Baja', '---',
    '![](https://img/x.heic)', '', 'Intro.', '', '## Ingredientes', '', '- 130 g arroz jazmín', '- Sal',
    '## Elaboración', '', '1. Lavar el arroz.', '2. Hervir.', '', '## Notas', '', 'Nada.',
  ].join('\n')
  const r = parseMarkdownRecipe(md, 'peluso', 'Arroz blanco para acompañar')
  assert.equal(r.sourceKey, 'peluso:Arroz blanco para acompañar')
  assert.equal(r.title, 'Arroz blanco para acompañar')
  assert.deepEqual(r.ingredients, ['130 g arroz jazmín', 'Sal'])
  assert.equal(r.steps, '1. Lavar el arroz.\n2. Hervir.')
  assert.equal(r.servings, 2)
  assert.equal(r.minutes, 75)
  assert.equal(r.difficulty, 'baja')
})

test('fixMojibake picks the most common spelling', () => {
  const vocab = buildVocab(['está está ají', 'esta'])
  const broken = 'Ã�'
  const fix = fixMojibake(`Ya est${broken} con aj${broken}`, vocab)
  assert.equal(fix, 'Ya está con ají')
  const before = fixMojibake.unresolved
  assert.equal(fixMojibake(`zzz${broken}q`, vocab), `zzz${broken}q`)
  assert.equal(fixMojibake.unresolved, before + 1)
})

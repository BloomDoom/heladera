import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assemble } from '../assemble.js'

const p = (code, minor = false, synonyms = []) => ({
  code, name: code.replace(/-/g, ' '), category: 'verdura', storage: 'fridge', shelf_days: 5, minor, assumed: false, synonyms,
})
const dict = [p('cebolla'), p('cebolla-de-verdeo'), p('sal', true, ['sal gruesa']), p('pollo'), p('oregano', true), p('papa', false, ['patata'])]
const opts = { dict, words: { patatas: 'papas', patata: 'papa' }, ignore: ['palillos'], vocab: new Map() }

const raw = (over = {}) => ({
  sourceKey: 'abuela:1', source: 'abuela', url: 'https://x', title: 'Pollo al horno', minutes: 30, servings: 2,
  difficulty: 'baja', country: 'ARG', ingredients: ['1 pollo', '1 cebolla'], steps: 'Hornear.', ...over,
})

test('assemble merges repeated products', () => {
  const { recipes } = assemble([raw({
    ingredients: ['1 cebolla', 'cebolla de verdeo picada (opcional)', 'sal', 'sal gruesa', '1 pollo'],
  })], opts)
  assert.deepEqual(recipes[0].ingredients, [
    { code: 'cebolla', line: '1 cebolla', isMain: true },
    { code: 'cebolla-de-verdeo', line: 'cebolla de verdeo picada (opcional)', isMain: true },
    { code: 'sal', line: 'sal', isMain: false },
    { code: 'pollo', line: '1 pollo', isMain: true },
  ])
})

test('assemble drops recipes with unknown ingredients', () => {
  const { recipes, report } = assemble([raw({ ingredients: ['1 pollo', '1 cebolla', '2 kiwanos'] })], opts)
  assert.equal(recipes.length, 0)
  assert.equal(report.unmatched.get('kiwanos'), 1)
  assert.equal(report.dropped, 1)
})

test('assemble drops recipes with fewer than 2 products', () => {
  assert.equal(assemble([raw({ ingredients: ['1 pollo'] })], opts).recipes.length, 0)
})

test('assemble keeps ignored lines out', () => {
  const { recipes } = assemble([raw({ ingredients: ['1 pollo', '1 cebolla', '24 palillos de madera'] })], opts)
  assert.equal(recipes[0].ingredients.length, 2)
})

test('assemble marks minor ingredients', () => {
  const { recipes } = assemble([raw({ ingredients: ['1 pollo', 'orégano'] })], opts)
  assert.deepEqual(recipes[0].ingredients.map((i) => [i.code, i.isMain]), [['pollo', true], ['oregano', false]])
})

test('assemble adapts titles and lines but not steps', () => {
  const { recipes } = assemble([raw({
    title: 'Patatas guisadas', ingredients: ['3 patatas', '1 cebolla'], steps: 'Pelar las patatas.',
  })], opts)
  assert.equal(recipes[0].title, 'Papas guisadas')
  assert.equal(recipes[0].ingredients[0].line, '3 papas')
  assert.equal(recipes[0].steps, 'Pelar las patatas.')
})

test('assemble drops sauces and desserts by title', () => {
  for (const title of ['Salsa de cebolla', 'Torta de papa', 'Budín de pollo']) {
    assert.equal(assemble([raw({ title })], opts).recipes.length, 0, title)
  }
})

test('assemble repairs broken accents and drops titles it cannot repair', () => {
  const broken = 'Ã�'
  const vocab = new Map([['Pollo', 5], ['jalapeño', 3]])
  const ok = assemble([raw({ title: `Pollo jalape${broken}o` })], { ...opts, vocab })
  assert.equal(ok.recipes[0].title, 'Pollo jalapeño')
  const bad = assemble([raw({ title: `Pollo zzz${broken}` })], { ...opts, vocab })
  assert.equal(bad.recipes.length, 0)
})

test('assemble skips unknown optional ingredients', () => {
  const { recipes, report } = assemble([raw({
    ingredients: ['1 pollo', '1 cebolla', '1 pizca de glutamato (opcional)', 'Croutones, a gusto', 'salsa al gusto'],
  })], opts)
  assert.equal(recipes.length, 1)
  assert.equal(recipes[0].ingredients.length, 2)
  assert.equal(report.unmatched.size, 0)
})

test('assemble takes only the first of alternatives', () => {
  const { recipes } = assemble([raw({ ingredients: ['1 pollo', '1 cebolla o 2 papas', 'papas o cebolla de verdeo'] })], opts)
  assert.deepEqual(recipes[0].ingredients.map((i) => i.code), ['pollo', 'cebolla', 'papa'])
})

test('assemble capitalizes titles', () => {
  assert.equal(assemble([raw({ title: 'pure de papas con pollo' })], opts).recipes[0].title, 'Pure de papas con pollo')
})

test('assemble ignores text in parentheses unless nothing else matched', () => {
  const { recipes } = assemble([raw({ ingredients: ['1 pollo (o papas)', '1 cebolla', 'verdura (papas)'] })], opts)
  assert.deepEqual(recipes[0].ingredients.map((i) => i.code), ['pollo', 'cebolla', 'papa'])
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepare, matchProducts, withoutGenericBeef, isIgnored, argentinize, CATEGORIES } from '../normalize.js'

const load = (name) => JSON.parse(readFileSync(new URL(`../dictionary/${name}`, import.meta.url), 'utf8'))
const products = load('products.json')
const words = load('es-ar.json')
const ignore = load('ignore.json')
const d = prepare(products)
const match = (line) => matchProducts(line, d)

test('matchProducts strips quantities and units', () => {
  assert.deepEqual(match('½ taza de cilantro finamente picado'), ['cilantro'])
  assert.deepEqual(match('300gr de lentejas'), ['lentejas'])
  assert.deepEqual(match('2 o 3 hojas de laurel seco'), ['laurel'])
})

test('matchProducts returns every product in a line', () => {
  assert.deepEqual(match('Sal y pimienta al gusto'), ['sal', 'pimienta'])
})

test('matchProducts matches whole words, longest first', () => {
  assert.ok(!match('2 cucharadas de semillas de ajonjolí').includes('ajo'))
  assert.deepEqual(match('1 pimiento rojo'), ['morron'])
  assert.deepEqual(match('1 taza de harina de maíz'), ['harina-de-maiz'])
  assert.deepEqual(match('2 dientes de ajo'), ['ajo'])
})

test('generic products', () => {
  assert.deepEqual(match('500 g de carne picada'), ['carne-de-vaca'])
  assert.deepEqual(match('1 kg de nalga'), ['carne-de-vaca'])
  assert.deepEqual(match('1 taza de leche descremada'), ['leche'])
  assert.deepEqual(match('3 patatas'), ['papa'])
})

test('isIgnored', () => {
  assert.equal(isIgnored('24 palillos de madera para sostener', ignore), true)
  assert.equal(isIgnored('1 cebolla', ignore), false)
})

test('argentinize keeps case and whole words', () => {
  assert.equal(argentinize('Patatas con nata', words), 'Papas con crema')
  assert.equal(argentinize('patatero', words), 'patatero')
  assert.equal(argentinize('Judías verdes salteadas', words), 'Chauchas salteadas')
})

test('dictionary is valid', () => {
  const codes = new Set()
  const owner = new Map()
  for (const p of products) {
    assert.ok(!codes.has(p.code), `repeated code ${p.code}`)
    codes.add(p.code)
    assert.ok(CATEGORIES.includes(p.category), `${p.code}: category ${p.category}`)
    assert.ok(['fridge', 'freezer', 'pantry'].includes(p.storage), `${p.code}: storage`)
    assert.ok(Number.isInteger(p.shelf_days) && p.shelf_days > 0, `${p.code}: shelf_days`)
    assert.equal(typeof p.minor, 'boolean', `${p.code}: minor`)
    for (const s of [p.name, ...p.synonyms]) {
      const key = s.toLowerCase()
      assert.ok(!owner.has(key) || owner.get(key) === p.code, `"${s}" in ${owner.get(key)} and ${p.code}`)
      owner.set(key, p.code)
    }
  }
  for (const code of ['sal', 'pimienta', 'aceite', 'agua']) {
    assert.equal(products.find((p) => p.code === code)?.assumed, true, code)
  }
})

// "Lomo", "bife", "bistec" and a bare "carne" are cuts or words, not only
// beef: when the line names another meat or fish, that one is the product.
test('generic cuts follow the meat or fish the line names', () => {
  const resolve = (codes, line) => withoutGenericBeef(codes, line, d)
  assert.deepEqual(resolve(match('4 lomos'), '4 lomos o rodajas de merluza'), ['pescado'])
  assert.deepEqual(resolve(match('4 pechugas de Pollo en bistec'), '4 pechugas de Pollo en bistec'), ['pollo'])
  assert.deepEqual(resolve(match('Carne'), 'Carne (Pollo, salchichas, conejo)'), ['pollo'])
  // Real beef stays.
  assert.deepEqual(resolve(match('1 kg de lomo'), '1 kg de lomo'), ['carne-de-vaca'])
  const mixed = '500 gramos de carne picada, trozos de pollo y de solomillo'
  assert.deepEqual(resolve(match(mixed), mixed), ['carne-de-vaca', 'pollo'])
  assert.deepEqual(resolve(match('2 bifes de chorizo'), '2 bifes de chorizo'), ['carne-de-vaca'])
})

test('review I1: generic words inside other foods', () => {
  assert.deepEqual(match('1 Morrón rojo asado'), ['morron'])
  assert.deepEqual(match('Ajo y cebolla asados'), ['ajo', 'cebolla'])
  assert.deepEqual(match('4 lomos de merluza'), ['pescado'])
  assert.deepEqual(match('2 rodajas de salmón en lomos'), ['salmon'])
  assert.deepEqual(match('300 g de carne picada de cerdo'), ['cerdo'])
  assert.deepEqual(match('Carne picada de pechuga de pollo'), ['pollo'])
  assert.deepEqual(match('150 g de carne vegetal'), ['seitan'])
  assert.deepEqual(match('1 cucharada de Ajo en pasta'), ['ajo'])
  assert.deepEqual(match('1 lámina de pasta brisa'), ['masa-de-tarta'])
  assert.deepEqual(match('1 sobre de consomé de pollo'), ['caldo'])
  assert.deepEqual(match('1 pastilla de caldo de carne'), ['caldo'])
  assert.deepEqual(match('1 taza de Fondo de res'), ['caldo'])
  assert.deepEqual(match('100 g de harina de garbanzos'), ['harina'])
  assert.deepEqual(match('1 vaso de leche de soja'), ['leche'])
  assert.deepEqual(match('200 g de espirales de colores'), ['fideos'])
  assert.deepEqual(match('1 cucharada de salsa de pescado'), ['salsa-de-soja'])
  assert.deepEqual(match('250 g de pasta'), ['fideos'])
})

test('review I3: "sin X" is not X', () => {
  assert.deepEqual(match('Harina de rebozar sin huevo'), ['harina'])
  assert.deepEqual(match('50 g de manteca sin sal'), ['manteca'])
})

test('review I1: string for tying meat is ignored', () => {
  assert.equal(isIgnored('Hilo para bridar la carne', ignore), true)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as, ZONA_FIT } from './db.js'

// Households Casa (a1, a2) and Otra (b1), plus solo without household.
// Casa's fridge: huevo, papa. Otra has a private product.
async function setup() {
  const db = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const u = {}
  for (const name of ['a1', 'a2', 'b1', 'solo']) u[name] = await addUser(db, `${name}@x`)
  await db.exec(`
    insert into heladera.households (name) values ('Casa'), ('Otra');
    insert into heladera.products (code, name, category, storage, assumed) values
      ('huevo', 'Huevo', 'huevo', 'fridge', false),
      ('papa', 'Papa', 'verdura', 'pantry', false),
      ('cebolla', 'Cebolla', 'verdura', 'pantry', false),
      ('sal', 'Sal', 'almacen', 'pantry', true);
    insert into heladera.products (household_id, name, category, storage) values
      (2, 'Salsa secreta', 'almacen', 'pantry');
    insert into heladera.recipes (source_key, title, steps, source) values ('t:1', 'tortilla', 'x', 't');
    insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main)
    select r.id, p.id, p.name, i.is_main
    from (values ('huevo', true), ('papa', true), ('sal', false)) i(code, is_main)
    join heladera.products p on p.code = i.code
    cross join heladera.recipes r where r.title = 'tortilla';
    insert into heladera.fridge_items (household_id, product_id, added_on)
    select 1, id, '2026-10-22' from heladera.products where code in ('huevo', 'papa');
  `)
  await db.query(
    `insert into heladera.household_members (user_id, household_id, display_name)
     values ($1, 1, 'A1'), ($2, 1, 'A2'), ($3, 2, 'B1')`,
    [u.a1, u.a2, u.b1],
  )
  const one = async (q) => (await db.query(q)).rows[0].id
  const ids = {
    huevo: await one("select id from heladera.products where code = 'huevo'"),
    papa: await one("select id from heladera.products where code = 'papa'"),
    secreta: await one("select id from heladera.products where name = 'Salsa secreta'"),
    cebolla: await one("select id from heladera.products where code = 'cebolla'"),
  }
  return { db, u, ids, tortilla: await one("select id from heladera.recipes where title = 'tortilla'") }
}

const rows = async (db, user, query, params = []) => (await as(db, user, query, params)).rows
const save = (db, user, id, title, ingredients, steps = 'Batir.\n\nCocinar.') =>
  as(db, user, 'select heladera.save_own_recipe($1, $2, 30, 4, $3, $4::jsonb) as id', [id, title, steps, JSON.stringify(ingredients)])
const two = (ids) => [
  { product_id: ids.huevo, line: '6 huevos', is_main: true },
  { product_id: ids.papa, line: '4 papas', is_main: true },
]
const saveTwo = async (db, user, ids) => (await save(db, user, null, 'Tortilla de la abuela', two(ids))).rows[0].id
const ingredientCount = async (db, id) =>
  Number((await db.query('select count(*) as n from heladera.recipe_ingredients where recipe_id = $1', [id])).rows[0].n)
const recipeRow = async (db, id) => (await db.query('select * from heladera.recipes where id = $1', [id])).rows[0]
const favorite = (db, user, hid, recipe) =>
  as(db, user, 'insert into heladera.favorites (household_id, recipe_id) values ($1, $2)', [hid, recipe])

test('households save their own recipes', async () => {
  const { db, u, ids } = await setup()
  const id = await saveTwo(db, u.a1, ids)
  assert.ok(id)
  const r = await recipeRow(db, id)
  assert.equal(String(r.household_id), '1')
  assert.equal(r.source, 'propia')
  assert.equal(r.source_key, null)
  assert.equal(r.source_url, null)
  assert.equal(r.steps, 'Batir.\n\nCocinar.')
  assert.equal(await ingredientCount(db, id), 2)
})

test('a blank line stores the product name', async () => {
  const { db, u, ids } = await setup()
  const id = (await save(db, u.a1, null, 'X', [{ product_id: ids.huevo, line: '  ', is_main: true }])).rows[0].id
  const { rows: [ri] } = await db.query('select line from heladera.recipe_ingredients where recipe_id = $1', [id])
  assert.equal(ri.line, 'Huevo')
})

test('editing replaces the ingredients', async () => {
  const { db, u, ids } = await setup()
  const id = await saveTwo(db, u.a1, ids)
  const again = (await save(db, u.a2, id, 'Tortilla de papas', [{ product_id: ids.huevo, line: '3 huevos', is_main: true }])).rows[0].id
  assert.equal(String(again), String(id))
  assert.equal((await recipeRow(db, id)).title, 'Tortilla de papas')
  assert.equal(await ingredientCount(db, id), 1)
})

test('a failed save changes nothing', async () => {
  const { db, u, ids } = await setup()
  const id = await saveTwo(db, u.a1, ids)
  await assert.rejects(
    save(db, u.a1, id, 'Cambiada', [
      { product_id: ids.huevo, line: 'h', is_main: true },
      { product_id: ids.secreta, line: 's', is_main: false },
    ]),
    /row-level security/,
  )
  assert.equal((await recipeRow(db, id)).title, 'Tortilla de la abuela')
  assert.equal(await ingredientCount(db, id), 2)
})

test('own recipes and favorites belong to the household', async () => {
  const { db, u, ids, tortilla } = await setup()
  const id = await saveTwo(db, u.a1, ids)
  assert.equal((await rows(db, u.a2, 'select id from heladera.recipes where id = $1', [id])).length, 1)
  assert.equal((await rows(db, u.b1, 'select id from heladera.recipes where id = $1', [id])).length, 0)
  await assert.rejects(save(db, u.b1, id, 'Robada', [{ product_id: ids.cebolla, line: 'c', is_main: true }]), /recipe not found/)
  assert.equal((await recipeRow(db, id)).title, 'Tortilla de la abuela')
  assert.equal((await as(db, u.b1, 'delete from heladera.recipes where id = $1', [id])).affectedRows, 0)
  assert.equal((await as(db, u.a1, "update heladera.recipes set title = 'x' where id = $1", [tortilla])).affectedRows, 0)
  assert.equal((await as(db, u.a1, 'delete from heladera.recipes where id = $1', [tortilla])).affectedRows, 0)
  await assert.rejects(
    as(db, u.a1, "insert into heladera.recipes (household_id, source_key, title, steps, source) values (1, 'k', 't', 's', 'propia')"),
    /permission denied/,
  )
  await assert.rejects(
    as(db, u.a1, "insert into heladera.recipes (title, steps, source) values ('base', 's', 'propia')"),
    /row-level security|violates check/,
  )
  await assert.rejects(
    as(db, u.a1, "insert into heladera.recipes (household_id, title, steps, source) values (2, 't', 's', 'propia')"),
    /row-level security/,
  )
  await assert.rejects(
    as(db, u.a1, "insert into heladera.recipes (household_id, title, steps, source) values (1, 't', 's', 'abuela')"),
    /row-level security/,
  )
  await assert.rejects(
    as(db, u.a1, 'insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main) values ($1, $2, $3, true)', [tortilla, ids.cebolla, 'c']),
    /row-level security/,
  )
  assert.equal((await as(db, u.a1, 'delete from heladera.recipe_ingredients where recipe_id = $1', [tortilla])).affectedRows, 0)

  await favorite(db, u.a1, 1, tortilla)
  assert.equal((await rows(db, u.a2, 'select * from heladera.favorites')).length, 1)
  assert.equal((await rows(db, u.b1, 'select * from heladera.favorites')).length, 0)
  await assert.rejects(favorite(db, u.b1, 1, tortilla), /row-level security/)
  await assert.rejects(favorite(db, u.b1, 2, id), /row-level security/)
  assert.equal((await as(db, u.b1, 'delete from heladera.favorites')).affectedRows, 0)
})

test('users without household cannot save or favorite', async () => {
  const { db, u, ids, tortilla } = await setup()
  await assert.rejects(save(db, u.solo, null, 'X', two(ids)), /row-level security/)
  await assert.rejects(favorite(db, u.solo, 1, tortilla), /row-level security/)
  assert.equal((await rows(db, u.solo, 'select * from heladera.favorites')).length, 0)
})

test('own and favorite recipes are flagged', async () => {
  const { db, u, ids, tortilla } = await setup()
  const id = await saveTwo(db, u.a1, ids)
  await favorite(db, u.a1, 1, tortilla)
  const list = await rows(db, u.a1, 'select * from heladera.recipe_candidates()')
  const own = list.find((c) => String(c.recipe_id) === String(id))
  const base = list.find((c) => String(c.recipe_id) === String(tortilla))
  assert.equal(own.own, true)
  assert.equal(own.favorite, false)
  assert.equal(base.own, false)
  assert.equal(base.favorite, true)
  const other = await rows(db, u.b1, 'select * from heladera.recipe_candidates()')
  assert.ok(other.every((c) => !c.own && !c.favorite))
  assert.ok(!other.some((c) => String(c.recipe_id) === String(id)))
})

test('deleting an own recipe removes its ingredients and favorite', async () => {
  const { db, u, ids } = await setup()
  const id = await saveTwo(db, u.a1, ids)
  await favorite(db, u.a1, 1, id)
  assert.equal((await as(db, u.a1, 'delete from heladera.recipes where id = $1', [id])).affectedRows, 1)
  assert.equal(await ingredientCount(db, id), 0)
  assert.equal((await db.query('select * from heladera.favorites')).rows.length, 0)
})

test('blank title or no ingredients is rejected', async () => {
  const { db, u, ids } = await setup()
  await assert.rejects(save(db, u.a1, null, '  ', two(ids)), /title is required/)
  await assert.rejects(save(db, u.a1, null, 'X', []), /ingredients are required/)
  assert.equal((await db.query('select * from heladera.recipes where household_id is not null')).rows.length, 0)
})

test('anon reads nothing', async () => {
  const { db, ids } = await setup()
  await assert.rejects(as(db, null, 'select * from heladera.favorites'), /permission denied/)
  await assert.rejects(save(db, null, null, 'X', two(ids)), /permission denied/)
})

test('migration matches schema.sql', async () => {
  const shape = async (db) => ({
    columns: (await db.query(`select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema = 'heladera' order by 1, 2`)).rows,
    policies: (await db.query(`select tablename, policyname, cmd, qual, with_check from pg_policies
      where schemaname = 'heladera' order by 1, 2`)).rows,
    routines: (await db.query(`select routine_name, routine_definition from information_schema.routines
      where routine_schema = 'heladera' order by 1, 2`)).rows,
    tableGrants: (await db.query(`select grantee, table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'heladera' order by 1, 2, 3`)).rows,
    columnGrants: (await db.query(`select grantee, table_name, column_name, privilege_type from information_schema.column_privileges
      where table_schema = 'heladera' order by 1, 2, 3, 4`)).rows,
    routineGrants: (await db.query(`select grantee, routine_name, privilege_type from information_schema.routine_privileges
      where routine_schema = 'heladera' order by 1, 2, 3`)).rows,
    indexes: (await db.query(`select tablename, indexname, indexdef from pg_indexes
      where schemaname = 'heladera' order by 1, 2`)).rows,
  })
  const full = await newDb(ZONA_FIT + '/schema.sql', 'supabase/tests/fixtures/heladera-schema-stage2d.sql')
  const migrated = await newDb(
    ZONA_FIT + '/schema.sql',
    'supabase/tests/fixtures/heladera-schema-stage2c.sql',
    'supabase/migrations/2026-10-25-propias.sql',
  )
  assert.deepEqual(await shape(migrated), await shape(full))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as, ZONA_FIT } from './db.js'

// Households Casa (a1, a2) and Otra (b1), plus solo without household.
// Basics: sal, aceite, agua. Casa's fridge: huevo, papa. Otra's: cebolla,
// perejil, oregano, papa.
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
      ('perejil', 'Perejil', 'verdura', 'fridge', false),
      ('oregano', 'Orégano', 'especia', 'pantry', false),
      ('sal', 'Sal', 'almacen', 'pantry', true),
      ('aceite', 'Aceite', 'almacen', 'pantry', true),
      ('agua', 'Agua', 'almacen', 'pantry', true);
    insert into heladera.recipes (source_key, title, steps, source) values
      ('t:1', 'tortilla', 'x', 't'), ('t:2', 'huevo duro', 'x', 't'),
      ('t:3', 'papas al perejil', 'x', 't'), ('t:4', 'agua salada', 'x', 't');
    insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main)
    select r.id, p.id, p.name, i.is_main
    from (values
      ('tortilla', 'huevo', true), ('tortilla', 'papa', true), ('tortilla', 'cebolla', false),
      ('tortilla', 'sal', false), ('tortilla', 'aceite', true),
      ('huevo duro', 'huevo', true), ('huevo duro', 'agua', true), ('huevo duro', 'sal', false),
      ('papas al perejil', 'papa', true), ('papas al perejil', 'perejil', false), ('papas al perejil', 'oregano', false),
      ('agua salada', 'agua', true), ('agua salada', 'sal', false)
    ) i(title, code, is_main)
    join heladera.recipes r on r.title = i.title
    join heladera.products p on p.code = i.code;
    insert into heladera.fridge_items (household_id, product_id, added_on, place)
    select f.hid, p.id, '2026-10-22', 'fridge'
    from (values (1, 'huevo'), (1, 'papa'), (2, 'cebolla'), (2, 'perejil'), (2, 'oregano'), (2, 'papa')) f(hid, code)
    join heladera.products p on p.code = f.code;
  `)
  await db.query(
    `insert into heladera.household_members (user_id, household_id, display_name)
     values ($1, 1, 'A1'), ($2, 1, 'A2'), ($3, 2, 'B1')`,
    [u.a1, u.a2, u.b1],
  )
  const id = async (code) => (await db.query('select id from heladera.products where code = $1', [code])).rows[0].id
  const ids = {}
  for (const code of ['huevo', 'papa', 'cebolla', 'aceite']) ids[code] = await id(code)
  const recipe = async (title) => (await db.query('select id from heladera.recipes where title = $1', [title])).rows[0].id
  return { db, u, ids, tortilla: await recipe('tortilla') }
}

const rows = async (db, user, query, params = []) => (await as(db, user, query, params)).rows
const candidates = (db, user) => rows(db, user, 'select * from heladera.recipe_candidates()')
const titles = (list) => list.map((c) => c.title).sort()
const byTitle = (list, title) => list.find((c) => c.title === title)
const override = (db, user, hid, product, assumed) =>
  as(db, user, 'insert into heladera.assumed_overrides (household_id, product_id, assumed) values ($1, $2, $3)', [hid, product, assumed])

test('candidates need every main ingredient', async () => {
  const { db, u, ids } = await setup()
  const list = await candidates(db, u.a1)
  assert.deepEqual(titles(list), ['huevo duro', 'tortilla'])
  const tortilla = byTitle(list, 'tortilla')
  assert.equal(String(tortilla.missing_product_id), String(ids.cebolla))
  assert.equal(tortilla.missing_product_name, 'Cebolla')
  const duro = byTitle(list, 'huevo duro')
  assert.equal(duro.missing_product_id, null)
  assert.equal(duro.missing_product_name, null)
})

test('used products are the fridge ones, not the basics', async () => {
  const { db, u, ids } = await setup()
  const tortilla = byTitle(await candidates(db, u.a1), 'tortilla')
  assert.deepEqual(tortilla.used_product_ids.map(String).sort(), [String(ids.huevo), String(ids.papa)].sort())
})

test('recipes need at least one product from the fridge', async () => {
  const { db, u } = await setup()
  assert.ok(!titles(await candidates(db, u.a1)).includes('agua salada'))
  assert.ok(!titles(await candidates(db, u.b1)).includes('agua salada'))
})

test('a household can stop assuming a basic', async () => {
  const { db, u, ids } = await setup()
  await override(db, u.a1, 1, ids.aceite, false)
  assert.deepEqual(titles(await candidates(db, u.a1)), ['huevo duro'])
})

test('a household can assume more basics', async () => {
  const { db, u, ids } = await setup()
  await override(db, u.a1, 1, ids.cebolla, true)
  const tortilla = byTitle(await candidates(db, u.a1), 'tortilla')
  assert.equal(tortilla.missing_product_id, null)
})

test("another household's fridge does not count", async () => {
  const { db, u } = await setup()
  const b = titles(await candidates(db, u.b1))
  assert.ok(b.includes('papas al perejil'))
  assert.ok(!b.includes('huevo duro'))
  assert.ok(!titles(await candidates(db, u.a1)).includes('papas al perejil'))
})

test('cooked and rejections belong to the household', async () => {
  const { db, u, tortilla } = await setup()
  await as(db, u.a1, "insert into heladera.cooked (household_id, recipe_id, cooked_on) values (1, $1, '2026-10-22')", [tortilla])
  await as(db, u.a1, "insert into heladera.rejections (household_id, recipe_id, rejected_on) values (1, $1, '2026-10-22')", [tortilla])
  assert.equal((await rows(db, u.a2, 'select * from heladera.cooked')).length, 1)
  assert.equal((await rows(db, u.a2, 'select * from heladera.rejections')).length, 1)
  assert.equal((await rows(db, u.b1, 'select * from heladera.cooked')).length, 0)
  assert.equal((await rows(db, u.b1, 'select * from heladera.rejections')).length, 0)
  await assert.rejects(
    as(db, u.a1, "insert into heladera.cooked (household_id, recipe_id, cooked_on) values (2, $1, '2026-10-22')", [tortilla]),
    /row-level security/,
  )
  await assert.rejects(
    as(db, u.a1, "insert into heladera.rejections (household_id, recipe_id, rejected_on) values (2, $1, '2026-10-22')", [tortilla]),
    /row-level security/,
  )
  assert.equal((await as(db, u.b1, 'delete from heladera.cooked')).affectedRows, 0)
  assert.equal((await as(db, u.a1, 'delete from heladera.cooked')).affectedRows, 1)
})

test('users without household cannot record or get candidates', async () => {
  const { db, u, tortilla } = await setup()
  await assert.rejects(
    as(db, u.solo, "insert into heladera.cooked (household_id, recipe_id, cooked_on) values (1, $1, '2026-10-22')", [tortilla]),
    /row-level security/,
  )
  assert.deepEqual(await candidates(db, u.solo), [])
})

test('basics overrides belong to the household', async () => {
  const { db, u, ids } = await setup()
  await override(db, u.a1, 1, ids.aceite, false)
  assert.equal((await rows(db, u.a2, 'select * from heladera.assumed_overrides')).length, 1)
  assert.equal((await rows(db, u.b1, 'select * from heladera.assumed_overrides')).length, 0)
  await assert.rejects(override(db, u.a1, 2, ids.aceite, false), /row-level security/)
})

test('recipe_candidates returns rows ordered by recipe id', async () => {
  const { db, u } = await setup()
  const list = await candidates(db, u.a1)
  assert.ok(list.length > 1)
  const ids = list.map((c) => Number(c.recipe_id))
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b))
})

test('anon reads nothing', async () => {
  const { db } = await setup()
  await assert.rejects(as(db, null, 'select * from heladera.cooked'), /permission denied/)
  await assert.rejects(as(db, null, 'select * from heladera.recipe_candidates()'), /permission denied/)
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
  const full = await newDb(ZONA_FIT + '/schema.sql', 'supabase/tests/fixtures/heladera-schema-stage2c.sql')
  const migrated = await newDb(
    ZONA_FIT + '/schema.sql',
    'supabase/tests/fixtures/heladera-schema-stage2b.sql',
    'supabase/migrations/2026-10-24-hoy.sql',
  )
  assert.deepEqual(await shape(migrated), await shape(full))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as, sql, ZONA_FIT } from './db.js'

// Households Casa (a1) and Otra (b1), solo without household. A base
// product "leche", a product private to Casa, and a base recipe with leche.
async function setup(...files) {
  const db = await newDb(ZONA_FIT + '/schema.sql', ...(files.length ? files : ['supabase/schema.sql']))
  const u = {}
  for (const name of ['a1', 'b1', 'solo']) u[name] = await addUser(db, `${name}@x`)
  await db.exec(`
    insert into heladera.households (name) values ('Casa'), ('Otra');
    insert into heladera.products (code, name, category, storage, shelf_days)
      values ('leche', 'Leche', 'lacteo', 'fridge', 7);
    insert into heladera.products (household_id, name, category, storage)
      values (1, 'Queso de cabra de Juan', 'lacteo', 'fridge');
    insert into heladera.recipes (source_key, title, steps, source)
      values ('abuela:1', 'Flan', 'Mezclar.', 'abuela');
    insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main)
      values (1, 1, '1 litro de leche', true);
  `)
  await db.query(
    `insert into heladera.household_members (user_id, household_id, display_name)
     values ($1, 1, 'A1'), ($2, 2, 'B1')`,
    [u.a1, u.b1],
  )
  return { db, u }
}

const rows = async (db, user, query) => (await as(db, user, query)).rows

test('base products and recipes are visible to every household', async () => {
  const { db, u } = await setup()
  for (const user of [u.a1, u.b1]) {
    assert.ok((await rows(db, user, 'select code from heladera.products')).some((r) => r.code === 'leche'))
    assert.deepEqual(await rows(db, user, 'select title from heladera.recipes'), [{ title: 'Flan' }])
    assert.equal((await rows(db, user, 'select * from heladera.recipe_ingredients')).length, 1)
  }
})

test('private products are only visible to their household', async () => {
  const { db, u } = await setup()
  assert.equal((await rows(db, u.a1, 'select * from heladera.products')).length, 2)
  assert.deepEqual(await rows(db, u.b1, 'select code from heladera.products'), [{ code: 'leche' }])
})

test('users without household see base data only', async () => {
  const { db, u } = await setup()
  assert.deepEqual(await rows(db, u.solo, 'select code from heladera.products'), [{ code: 'leche' }])
  assert.equal((await rows(db, u.solo, 'select * from heladera.recipes')).length, 1)
})

test('anon reads nothing', async () => {
  const { db } = await setup()
  await assert.rejects(as(db, null, 'select * from heladera.recipes'), /permission denied/)
})

test('households cannot write the dictionary', async () => {
  const { db, u } = await setup()
  await assert.rejects(
    as(db, u.a1, "insert into heladera.products (code, name, category, storage) values ('x', 'X', 'almacen', 'pantry')"),
    /permission denied/,
  )
})

test('unique keys make reloads idempotent', async () => {
  const { db } = await setup()
  await assert.rejects(
    db.exec("insert into heladera.products (code, name, category, storage) values ('leche', 'Leche', 'lacteo', 'fridge')"),
    /duplicate key/,
  )
  await assert.rejects(
    db.exec("insert into heladera.recipes (source_key, title, steps, source) values ('abuela:1', 'Flan', 'x', 'abuela')"),
    /duplicate key/,
  )
  await db.exec(`insert into heladera.products (code, name, category, storage) values ('leche', 'Leche entera', 'lacteo', 'fridge')
                 on conflict (code) do update set name = excluded.name`)
  assert.equal((await db.query("select count(*)::int as n from heladera.products where code = 'leche'")).rows[0].n, 1)
})

test('service_role can write the dictionary', async () => {
  const { db } = await setup()
  await db.exec('set role service_role')
  await db.exec("insert into heladera.products (code, name, category, storage) values ('huevo', 'Huevo', 'huevo', 'fridge')")
  await db.exec('reset role')
})

test('migration matches schema.sql', async () => {
  const shape = async (db) => ({
    columns: (await db.query(`select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema = 'heladera' order by 1, 2`)).rows,
    policies: (await db.query(`select tablename, policyname, cmd, qual from pg_policies
      where schemaname = 'heladera' order by 1, 2`)).rows,
  })
  const full = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const migrated = await newDb(ZONA_FIT + '/schema.sql', 'supabase/tests/fixtures/heladera-schema-stage1.sql',
    'supabase/migrations/2026-10-22-recetario.sql')
  assert.deepEqual(await shape(migrated), await shape(full))
})

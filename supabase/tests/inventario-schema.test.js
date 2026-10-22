import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as, ZONA_FIT } from './db.js'

// Households Casa (a1, a2) and Otra (b1), solo without household. Base
// products leche (shelf 7) and huevo, and a product private to Otra.
async function setup() {
  const db = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const u = {}
  for (const name of ['a1', 'a2', 'b1', 'solo']) u[name] = await addUser(db, `${name}@x`)
  await db.exec(`
    insert into heladera.households (name) values ('Casa'), ('Otra');
    insert into heladera.products (code, name, category, storage, shelf_days)
      values ('leche', 'Leche', 'lacteo', 'fridge', 7), ('huevo', 'Huevo', 'huevo', 'fridge', 21);
    insert into heladera.products (household_id, name, category, storage)
      values (2, 'Dulce de Otra', 'almacen', 'pantry');
  `)
  await db.query(
    `insert into heladera.household_members (user_id, household_id, display_name)
     values ($1, 1, 'A1'), ($2, 1, 'A2'), ($3, 2, 'B1')`,
    [u.a1, u.a2, u.b1],
  )
  const id = async (name) => (await db.query('select id from heladera.products where name = $1', [name])).rows[0].id
  return { db, u, leche: await id('Leche'), otra: await id('Dulce de Otra') }
}

const rows = async (db, user, query, params = []) => (await as(db, user, query, params)).rows
const add = (db, user, ids, today) => as(db, user, 'select heladera.add_to_fridge($1::bigint[], $2::date)', [ids, today])
const iso = (d) => d.toISOString().slice(0, 10)

test('add_to_fridge stores the date it is given', async () => {
  const { db, u, leche } = await setup()
  await add(db, u.a1, [leche], '2026-10-22')
  const items = await rows(db, u.a1, 'select added_on, expires_on from heladera.fridge_items')
  assert.equal(items.length, 1)
  assert.equal(iso(items[0].added_on), '2026-10-22')
  assert.equal(items[0].expires_on, null)
  const bought = await rows(db, u.a1, 'select bought_on from heladera.purchases')
  assert.equal(bought.length, 1)
  assert.equal(iso(bought[0].bought_on), '2026-10-22')
})

test('members of a household share the fridge', async () => {
  const { db, u, leche } = await setup()
  await add(db, u.a1, [leche], '2026-10-22')
  assert.equal((await rows(db, u.a2, 'select * from heladera.fridge_items')).length, 1)
  assert.equal((await rows(db, u.b1, 'select * from heladera.fridge_items')).length, 0)
})

test('adding a present product renews it', async () => {
  const { db, u, leche } = await setup()
  await add(db, u.a1, [leche], '2026-10-20')
  await as(db, u.a1, "update heladera.fridge_items set expires_on = '2026-10-21'")
  await add(db, u.a1, [leche], '2026-10-22')
  const items = await rows(db, u.a1, 'select added_on, expires_on from heladera.fridge_items')
  assert.equal(items.length, 1)
  assert.equal(iso(items[0].added_on), '2026-10-22')
  assert.equal(items[0].expires_on, null)
  assert.equal((await rows(db, u.a1, 'select * from heladera.purchases')).length, 2)
})

test('repeated ids in one call count once', async () => {
  const { db, u, leche } = await setup()
  await add(db, u.a1, [leche, leche], '2026-10-22')
  assert.equal((await rows(db, u.a1, 'select * from heladera.fridge_items')).length, 1)
  assert.equal((await rows(db, u.a1, 'select * from heladera.purchases')).length, 1)
})

test('fridge items only accept products the household can see', async () => {
  const { db, u, otra } = await setup()
  await assert.rejects(add(db, u.a1, [otra], '2026-10-22'), /row-level security/)
  await assert.rejects(
    as(db, u.a1, "insert into heladera.fridge_items (household_id, product_id, added_on) values (1, $1, '2026-10-22')", [otra]),
    /row-level security/,
  )
})

test('users without household cannot add', async () => {
  const { db, u, leche } = await setup()
  await assert.rejects(add(db, u.solo, [leche], '2026-10-22'), /row-level security|null value/)
})

test('se acabó deletes only our item', async () => {
  const { db, u, leche } = await setup()
  await add(db, u.a1, [leche], '2026-10-22')
  await add(db, u.b1, [leche], '2026-10-22')
  await as(db, u.a1, 'delete from heladera.fridge_items where product_id = $1', [leche])
  assert.equal((await rows(db, u.a1, 'select * from heladera.fridge_items')).length, 0)
  assert.equal((await rows(db, u.b1, 'select * from heladera.fridge_items')).length, 1)
})

test('households create private products', async () => {
  const { db, u } = await setup()
  await as(
    db,
    u.a1,
    `insert into heladera.products (household_id, name, category, storage, shelf_days)
     values (1, 'Mburucuyá', 'fruta', 'fridge', 5)`,
  )
  assert.equal((await rows(db, u.a2, "select * from heladera.products where name = 'Mburucuyá'")).length, 1)
  assert.equal((await rows(db, u.b1, "select * from heladera.products where name = 'Mburucuyá'")).length, 0)
})

test('households cannot create products for another household or base products', async () => {
  const { db, u } = await setup()
  await assert.rejects(
    as(db, u.a1, "insert into heladera.products (household_id, name, category, storage) values (2, 'X', 'fruta', 'fridge')"),
    /row-level security/,
  )
  await assert.rejects(
    as(db, u.a1, "insert into heladera.products (household_id, code, name, category, storage) values (1, 'x', 'X', 'fruta', 'fridge')"),
    /permission denied/,
  )
  await assert.rejects(
    as(db, u.a1, "insert into heladera.products (household_id, name, category, storage, assumed) values (1, 'X', 'fruta', 'fridge', true)"),
    /permission denied/,
  )
})

test('anon reads nothing', async () => {
  const { db } = await setup()
  await assert.rejects(as(db, null, 'select * from heladera.fridge_items'), /permission denied/)
})

test('purchases only accept products the household can see', async () => {
  const { db, u, otra } = await setup()
  await assert.rejects(
    as(db, u.a1, "insert into heladera.purchases (household_id, product_id, bought_on) values (1, $1, '2026-10-22')", [otra]),
    /row-level security/,
  )
})

test('households do not see each other purchases', async () => {
  const { db, u, leche } = await setup()
  await add(db, u.a1, [leche], '2026-10-22')
  assert.equal((await rows(db, u.b1, 'select * from heladera.purchases')).length, 0)
})

test('anon cannot call add_to_fridge', async () => {
  const { db } = await setup()
  await assert.rejects(as(db, null, "select heladera.add_to_fridge(array[1], '2026-10-22')"), /permission denied/)
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
    indexes: (await db.query(`select tablename, indexname, indexdef from pg_indexes
      where schemaname = 'heladera' order by 1, 2`)).rows,
  })
  const full = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const migrated = await newDb(
    ZONA_FIT + '/schema.sql',
    'supabase/tests/fixtures/heladera-schema-stage2a.sql',
    'supabase/migrations/2026-10-23-inventario.sql',
  )
  assert.deepEqual(await shape(migrated), await shape(full))
})

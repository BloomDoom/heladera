import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { newDb, addUser, as, ZONA_FIT } from './db.js'

const MIGRATION = 'supabase/migrations/2026-10-27-cocina.sql'
const STAGE3 = 'supabase/tests/fixtures/heladera-schema-stage3.sql'

// Household Casa (a1). Products: leche (lacteo, fridge), arroz (almacen, pantry),
// pollo (pollo, freezer: its usual place after the migration).
async function setup() {
  const db = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const a1 = await addUser(db, 'a1@x')
  await db.exec(`
    insert into heladera.households (name) values ('Casa');
    insert into heladera.products (code, name, category, storage, assumed) values
      ('leche', 'Leche', 'lacteo', 'fridge', false),
      ('arroz', 'Arroz', 'almacen', 'pantry', false),
      ('pollo', 'Pollo', 'pollo', 'freezer', false);
  `)
  await db.query("insert into heladera.household_members (user_id, household_id, display_name) values ($1, 1, 'A1')", [a1])
  const ids = {}
  for (const code of ['leche', 'arroz', 'pollo'])
    ids[code] = (await db.query('select id from heladera.products where code = $1', [code])).rows[0].id
  return { db, a1, ids }
}

const placesOf = async (db) =>
  Object.fromEntries(
    (await db.query(`select p.code, f.place, f.expires_on::text as expires_on
      from heladera.fridge_items f join heladera.products p on p.id = f.product_id`)).rows.map((r) => [r.code, r]),
  )

test('add_to_fridge without places uses the usual place', async () => {
  const { db, a1, ids } = await setup()
  await as(db, a1, "select heladera.add_to_fridge($1::bigint[], '2026-10-27')", [`{${ids.leche},${ids.arroz},${ids.pollo}}`])
  const p = await placesOf(db)
  assert.equal(p.leche.place, 'fridge')
  assert.equal(p.arroz.place, 'pantry')
  assert.equal(p.pollo.place, 'freezer')
})

test('places override the usual place', async () => {
  const { db, a1, ids } = await setup()
  await as(db, a1, "select heladera.add_to_fridge($1::bigint[], '2026-10-27', $2::jsonb)", [
    `{${ids.leche},${ids.arroz}}`,
    JSON.stringify({ [ids.leche]: 'freezer' }),
  ])
  const p = await placesOf(db)
  assert.equal(p.leche.place, 'freezer')
  assert.equal(p.arroz.place, 'pantry')
})

test('renewing moves to the chosen place', async () => {
  const { db, a1, ids } = await setup()
  await db.query(
    "insert into heladera.fridge_items (household_id, product_id, added_on, expires_on, place) values (1, $1, '2026-10-01', '2026-11-30', 'freezer')",
    [ids.pollo],
  )
  await as(db, a1, "select heladera.add_to_fridge($1::bigint[], '2026-10-27', $2::jsonb)", [
    `{${ids.pollo}}`,
    JSON.stringify({ [ids.pollo]: 'fridge' }),
  ])
  const p = await placesOf(db)
  assert.equal(p.pollo.place, 'fridge')
  assert.equal(p.pollo.expires_on, null)
})

test('place must be valid', async () => {
  const { db, a1, ids } = await setup()
  await as(db, a1, "select heladera.add_to_fridge($1::bigint[], '2026-10-27')", [`{${ids.leche}}`])
  await assert.rejects(
    as(db, a1, "update heladera.fridge_items set place = 'garage' where product_id = $1", [ids.leche]),
    /check constraint/,
  )
})

test('store_checked uses the usual place', async () => {
  const { db, a1, ids } = await setup()
  await db.query(
    "insert into heladera.shopping_items (household_id, product_id, reason, added_on, checked) values (1, $1, 'a_mano', '2026-10-27', true)",
    [ids.pollo],
  )
  await as(db, a1, "select heladera.store_checked('2026-10-27')")
  assert.equal((await placesOf(db)).pollo.place, 'freezer')
})

test('an insert without place takes the usual place', async () => {
  const { db, a1, ids } = await setup()
  await as(db, a1, "insert into heladera.fridge_items (household_id, product_id, added_on) values (1, $1, '2026-10-27')", [ids.pollo])
  assert.equal((await placesOf(db)).pollo.place, 'freezer')
  await as(db, a1, "update heladera.fridge_items set place = 'fridge' where product_id = $1", [ids.pollo])
  await as(
    db,
    a1,
    "insert into heladera.fridge_items (household_id, product_id, added_on) values (1, $1, '2026-10-28') on conflict (household_id, product_id) do update set added_on = excluded.added_on",
    [ids.pollo],
  )
  assert.equal((await placesOf(db)).pollo.place, 'fridge')
})

test('backfill puts items in their usual place', async () => {
  const db = await newDb(ZONA_FIT + '/schema.sql', STAGE3)
  await db.exec(`
    insert into heladera.households (name) values ('Casa');
    insert into heladera.products (code, name, category, storage, assumed) values
      ('leche', 'Leche', 'lacteo', 'fridge', false),
      ('arroz', 'Arroz', 'almacen', 'pantry', false),
      ('pollo', 'Pollo', 'pollo', 'fridge', false);
    insert into heladera.fridge_items (household_id, product_id, added_on, expires_on)
    select 1, id, '2026-10-20', case when code = 'arroz' then null else date '2026-11-01' end
    from heladera.products;
  `)
  await db.exec(readFileSync(MIGRATION, 'utf8'))
  const p = await placesOf(db)
  assert.equal(p.pollo.place, 'freezer')
  assert.equal(p.pollo.expires_on, null)
  assert.equal(p.leche.place, 'fridge')
  assert.equal(p.leche.expires_on, '2026-11-01')
  assert.equal(p.arroz.place, 'pantry')
})

test("the dictionary's usual places", async () => {
  const db = await newDb(ZONA_FIT + '/schema.sql', STAGE3)
  await db.exec(`
    insert into heladera.products (code, name, category, storage, assumed) values
      ('cerdo', 'Cerdo', 'carne', 'fridge', false),
      ('pollo', 'Pollo', 'pollo', 'fridge', false),
      ('salmon', 'Salmón', 'pescado', 'fridge', false),
      ('edamame', 'Edamame', 'congelado', 'fridge', false),
      ('leche', 'Leche', 'lacteo', 'fridge', false);
  `)
  await db.exec(readFileSync(MIGRATION, 'utf8'))
  const rows = (await db.query('select code, storage from heladera.products order by code')).rows
  assert.deepEqual(
    rows.map((r) => [r.code, r.storage]),
    [['cerdo', 'freezer'], ['edamame', 'freezer'], ['leche', 'fridge'], ['pollo', 'freezer'], ['salmon', 'freezer']],
  )
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
    published: (await db.query(`select schemaname, tablename from pg_publication_tables
      where pubname = 'supabase_realtime' order by 1, 2`)).rows,
    checks: (await db.query(`select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
      where connamespace = 'heladera'::regnamespace and contype = 'c' order by 1, 2`)).rows,
    triggers: (await db.query(`select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relnamespace = 'heladera'::regnamespace and not t.tgisinternal order by 1, 2`)).rows,
    signatures: (await db.query(`select proname, pg_get_function_identity_arguments(oid) as args from pg_proc
      where pronamespace = 'heladera'::regnamespace order by 1, 2`)).rows,
  })
  const full = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const migrated = await newDb(ZONA_FIT + '/schema.sql', STAGE3, MIGRATION)
  assert.deepEqual(await shape(migrated), await shape(full))
})

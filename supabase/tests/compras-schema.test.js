import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as, ZONA_FIT } from './db.js'

// Households Casa (a1, a2) and Otra (b1).
// Recipe tortilla: huevo main, papa main, cebolla minor, sal minor (sal is a basic).
// Casa's fridge: huevo.
async function setup() {
  const db = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const u = {}
  for (const name of ['a1', 'a2', 'b1']) u[name] = await addUser(db, `${name}@x`)
  await db.exec(`
    insert into heladera.households (name) values ('Casa'), ('Otra');
    insert into heladera.products (code, name, category, storage, assumed) values
      ('huevo', 'Huevo', 'huevo', 'fridge', false),
      ('papa', 'Papa', 'verdura', 'pantry', false),
      ('cebolla', 'Cebolla', 'verdura', 'pantry', false),
      ('leche', 'Leche', 'lacteo', 'fridge', false),
      ('sal', 'Sal', 'almacen', 'pantry', true);
    insert into heladera.recipes (source_key, title, steps, source) values ('t:1', 'tortilla', 'x', 't');
    insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main)
    select r.id, p.id, p.name, i.is_main
    from (values ('huevo', true), ('papa', true), ('cebolla', false), ('sal', false)) i(code, is_main)
    join heladera.products p on p.code = i.code
    cross join heladera.recipes r where r.title = 'tortilla';
    insert into heladera.fridge_items (household_id, product_id, added_on)
    select 1, id, '2026-10-22' from heladera.products where code = 'huevo';
  `)
  await db.query(
    `insert into heladera.household_members (user_id, household_id, display_name)
     values ($1, 1, 'A1'), ($2, 1, 'A2'), ($3, 2, 'B1')`,
    [u.a1, u.a2, u.b1],
  )
  const one = async (q) => (await db.query(q)).rows[0].id
  const ids = {}
  for (const code of ['huevo', 'papa', 'cebolla', 'leche', 'sal'])
    ids[code] = await one(`select id from heladera.products where code = '${code}'`)
  return { db, u, ids, tortilla: await one("select id from heladera.recipes where title = 'tortilla'") }
}

const rows = async (db, user, query, params = []) => (await as(db, user, query, params)).rows
const list = async (db) => (await db.query('select * from heladera.shopping_items order by product_id')).rows
const addItem = (db, hid, pid, extra = {}) =>
  db.query(
    'insert into heladera.shopping_items (household_id, product_id, reason, added_on, checked) values ($1, $2, $3, $4, $5)',
    [hid, pid, extra.reason ?? 'a_mano', '2026-10-22', extra.checked ?? false],
  )
const fridgeIds = async (db, hid = 1) =>
  (await db.query('select product_id from heladera.fridge_items where household_id = $1', [hid])).rows.map((r) => String(r.product_id))

test('finishing adds to the list once', async () => {
  const { db, u, ids } = await setup()
  const r = await as(db, u.a1, "select heladera.finish_fridge_item($1, '2026-10-26') as ok", [ids.huevo])
  assert.equal(r.rows[0].ok, true)
  assert.deepEqual(await fridgeIds(db), [])
  const l = await list(db)
  assert.equal(l.length, 1)
  assert.equal(String(l[0].product_id), String(ids.huevo))
  assert.equal(l[0].reason, 'se_acabo')
  await as(db, u.a1, "insert into heladera.fridge_items (household_id, product_id, added_on) values (1, $1, '2026-10-26')", [ids.huevo])
  const again = await as(db, u.a1, "select heladera.finish_fridge_item($1, '2026-10-27') as ok", [ids.huevo])
  assert.equal(again.rows[0].ok, false)
  assert.equal((await list(db)).length, 1)
})

test('add_to_fridge clears the list', async () => {
  const { db, u, ids } = await setup()
  await addItem(db, 1, ids.leche)
  await addItem(db, 1, ids.papa)
  await as(db, u.a1, "select heladera.add_to_fridge($1::bigint[], '2026-10-26')", [`{${ids.leche}}`])
  assert.deepEqual((await list(db)).map((x) => String(x.product_id)), [String(ids.papa)])
})

test('store_checked moves the cart to the fridge', async () => {
  const { db, u, ids } = await setup()
  await addItem(db, 1, ids.leche, { checked: true })
  await addItem(db, 1, ids.papa)
  const r = await as(db, u.a1, "select heladera.store_checked('2026-10-26') as n")
  assert.equal(Number(r.rows[0].n), 1)
  assert.ok((await fridgeIds(db)).includes(String(ids.leche)))
  const p = await db.query('select bought_on::text as d from heladera.purchases where product_id = $1', [ids.leche])
  assert.equal(p.rows[0].d, '2026-10-26')
  assert.deepEqual((await list(db)).map((x) => String(x.product_id)), [String(ids.papa)])
  const again = await as(db, u.a1, "select heladera.store_checked('2026-10-26') as n")
  assert.equal(Number(again.rows[0].n), 0)
})

test('add_recipe_to_list skips what is home or listed', async () => {
  const { db, u, ids, tortilla } = await setup()
  await addItem(db, 1, ids.cebolla)
  const r = await as(db, u.a1, "select heladera.add_recipe_to_list($1, '2026-10-26') as got", [tortilla])
  assert.deepEqual(r.rows[0].got.map(String), [String(ids.papa)])
  const papa = (await list(db)).find((x) => String(x.product_id) === String(ids.papa))
  assert.equal(papa.reason, 'plato')
  assert.equal(String(papa.recipe_id), String(tortilla))
  const again = await as(db, u.a1, "select heladera.add_recipe_to_list($1, '2026-10-26') as got", [tortilla])
  assert.deepEqual(again.rows[0].got, [])
  await assert.rejects(as(db, u.a1, "select heladera.add_recipe_to_list(-1, '2026-10-26')"), /recipe not found/)
})

test('add_recipe_to_list rejects the own recipe of another household', async () => {
  const { db, u, ids } = await setup()
  await db.exec(`
    insert into heladera.recipes (household_id, title, steps, source) values (2, 'propia de Otra', 'x', 'propia');
  `)
  const other = (await db.query("select id from heladera.recipes where title = 'propia de Otra'")).rows[0].id
  await db.query('insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main) values ($1, $2, $3, true)', [other, ids.papa, 'x'])
  await assert.rejects(as(db, u.a1, "select heladera.add_recipe_to_list($1, '2026-10-26')", [other]), /recipe not found/)
})

test('week_candidates counts what is missing', async () => {
  const { db, u, tortilla } = await setup()
  const mine = async () =>
    (await rows(db, u.a1, 'select * from heladera.week_candidates()')).find((c) => String(c.recipe_id) === String(tortilla))
  const r = await mine()
  assert.deepEqual(r.missing_names, ['Cebolla', 'Papa'])
  assert.equal(r.title, 'tortilla')
  await db.query('delete from heladera.fridge_items')
  assert.deepEqual((await mine()).missing_names, ['Cebolla', 'Huevo', 'Papa'])
  await db.query("update heladera.products set assumed = false where code = 'sal'")
  assert.equal(await mine(), undefined)
})

test('the list belongs to the household', async () => {
  const { db, u, ids } = await setup()
  await addItem(db, 1, ids.leche, { checked: true })
  assert.equal((await rows(db, u.a2, 'select * from heladera.shopping_items')).length, 1)
  assert.equal((await rows(db, u.b1, 'select * from heladera.shopping_items')).length, 0)
  await assert.rejects(
    as(db, u.b1, "insert into heladera.shopping_items (household_id, product_id, reason, added_on) values (1, $1, 'a_mano', '2026-10-26')", [ids.papa]),
    /row-level security/,
  )
  const n = await as(db, u.b1, "select heladera.store_checked('2026-10-26') as n")
  assert.equal(Number(n.rows[0].n), 0)
  assert.equal((await list(db)).length, 1)
  assert.equal((await fridgeIds(db, 2)).length, 0)
  await db.exec(`
    insert into heladera.recipes (household_id, title, steps, source) values (1, 'propia de Casa', 'x', 'propia');
    insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main)
    select r.id, p.id, 'x', true from heladera.recipes r, heladera.products p
    where r.title = 'propia de Casa' and p.code = 'papa';
  `)
  const seen = (user) => rows(db, user, 'select title from heladera.week_candidates() where own')
  assert.equal((await seen(u.a1)).length, 1)
  assert.equal((await seen(u.b1)).length, 0)
})

test('snoozes are per household', async () => {
  const { db, u, ids } = await setup()
  await as(
    db,
    u.a1,
    `insert into heladera.shopping_snoozes (household_id, product_id, snoozed_on) values (1, $1, '2026-10-26')
     on conflict (household_id, product_id) do update set snoozed_on = excluded.snoozed_on`,
    [ids.leche],
  )
  assert.equal((await rows(db, u.a2, 'select * from heladera.shopping_snoozes')).length, 1)
  assert.equal((await rows(db, u.b1, 'select * from heladera.shopping_snoozes')).length, 0)
})

test('a snooze can be renewed', async () => {
  const { db, u, ids } = await setup()
  await as(
    db,
    u.a1,
    `insert into heladera.shopping_snoozes (household_id, product_id, snoozed_on) values (1, $1, '2026-10-26')`,
    [ids.leche],
  )
  await as(
    db,
    u.a1,
    `update heladera.shopping_snoozes set snoozed_on = '2026-10-27' where product_id = $1`,
    [ids.leche],
  )
  const [row] = await rows(db, u.a1, 'select snoozed_on::text as d from heladera.shopping_snoozes')
  assert.equal(row.d, '2026-10-27')
})

test('anon reads nothing', async () => {
  const { db } = await setup()
  await assert.rejects(as(db, null, 'select * from heladera.shopping_items'), /permission denied/)
  await assert.rejects(as(db, null, 'select * from heladera.shopping_snoozes'), /permission denied/)
  for (const call of [
    'heladera.finish_fridge_item(1, current_date)',
    'heladera.store_checked(current_date)',
    'heladera.add_recipe_to_list(1, current_date)',
    'heladera.week_candidates()',
  ])
    await assert.rejects(as(db, null, `select ${call}`), /permission denied/)
})

test('the list is published for realtime', async () => {
  const { db } = await setup()
  const { rows: r } = await db.query(
    "select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'heladera' and tablename = 'shopping_items'",
  )
  assert.equal(r.length, 1)
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
  })
  const full = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const migrated = await newDb(
    ZONA_FIT + '/schema.sql',
    'supabase/tests/fixtures/heladera-schema-stage2d.sql',
    'supabase/migrations/2026-10-26-compras.sql',
  )
  assert.deepEqual(await shape(migrated), await shape(full))
})

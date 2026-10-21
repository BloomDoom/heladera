import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as, sql, ZONA_FIT } from './db.js'

// zona-fit (with Nadia as gym user and one member) plus heladera, with
// two households: "Casa" (a1, a2) and "Otra" (b1). solo has no household.
async function setup() {
  const db = await newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')
  const u = {}
  for (const name of ['nadia', 'a1', 'a2', 'b1', 'solo']) u[name] = await addUser(db, `${name}@x`)
  await db.query('insert into gym_users values ($1)', [u.nadia])
  await db.exec("insert into members (name) values ('Ana')")
  const casa = (await db.query("insert into heladera.households (name) values ('Casa') returning id")).rows[0].id
  const otra = (await db.query("insert into heladera.households (name) values ('Otra') returning id")).rows[0].id
  await db.query(
    `insert into heladera.household_members (user_id, household_id, display_name)
     values ($1, $4, 'A1'), ($2, $4, 'A2'), ($3, $5, 'B1')`,
    [u.a1, u.a2, u.b1, casa, otra],
  )
  return { db, u }
}

const names = async (db, user) =>
  (await as(db, user, 'select name from heladera.households order by name')).rows.map((r) => r.name)

const count = async (db, user, table) =>
  (await as(db, user, `select count(*)::int as n from ${table}`)).rows[0].n

test('member sees own household and both members', async () => {
  const { db, u } = await setup()
  assert.deepEqual(await names(db, u.a1), ['Casa'])
  assert.equal(await count(db, u.a1, 'heladera.household_members'), 2)
})

test('member does not see another household', async () => {
  const { db, u } = await setup()
  assert.deepEqual(await names(db, u.b1), ['Otra'])
  assert.equal(await count(db, u.b1, 'heladera.household_members'), 1)
})

test('my_household_id() is null for a user without household', async () => {
  const { db, u } = await setup()
  assert.equal((await as(db, u.solo, 'select heladera.my_household_id() as h')).rows[0].h, null)
  assert.equal(await count(db, u.solo, 'heladera.households'), 0)
  assert.equal(await count(db, u.solo, 'heladera.household_members'), 0)
})

test('heladera user sees nothing of zona-fit', async () => {
  const { db, u } = await setup()
  assert.equal(await count(db, u.a1, 'public.members'), 0)
})

test('gym user sees nothing of heladera', async () => {
  const { db, u } = await setup()
  assert.equal(await count(db, u.nadia, 'heladera.households'), 0)
})

test('anon cannot read households', async () => {
  const { db } = await setup()
  await assert.rejects(as(db, null, 'select * from heladera.households'), /permission denied/)
})

test('members cannot add members', async () => {
  const { db, u } = await setup()
  await assert.rejects(
    as(db, u.a1, "insert into heladera.household_members (user_id, household_id, display_name) values ($1, 1, 'X')", [u.solo]),
    /permission denied/,
  )
})

test('add-household template fails safely with placeholders', async () => {
  const { db } = await setup()
  await assert.rejects(db.exec(sql('supabase/add-household.sql')))
  await db.exec('rollback')
  assert.equal((await db.query('select count(*)::int as n from heladera.households')).rows[0].n, 2)
})

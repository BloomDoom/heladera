import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as, sql, ZONA_FIT } from './db.js'

const FIXTURE = 'supabase/tests/fixtures/zona-fit-schema-before.sql'
const MIGRATION = ZONA_FIT + '/migrations/2026-10-21-gym-users.sql'
const ROLLBACK = ZONA_FIT + '/migrations/2026-10-21-gym-users-rollback.sql'

// zona-fit as it is today, with Nadia's and the author's logins and some
// data, before the migration runs.
async function today() {
  const db = await newDb(FIXTURE)
  const nadia = await addUser(db, 'nadia@x')
  const autor = await addUser(db, 'autor@x')
  await db.exec(`
    insert into members (name) values ('Ana');
    insert into products (name, price) values ('Remera', 1000);
  `)
  return { db, nadia, autor }
}

async function migrated() {
  const setup = await today()
  await setup.db.exec(sql(MIGRATION))
  return setup
}

const count = async (db, user, table) =>
  (await as(db, user, `select count(*)::int as n from ${table}`)).rows[0].n

const policies = async (db, table) =>
  (await db.query('select policyname from pg_policies where tablename = $1 order by 1', [table]))
    .rows.map((r) => r.policyname)

test('existing users stay gym users', async () => {
  const { db, nadia } = await migrated()
  assert.equal((await db.query('select count(*)::int as n from gym_users')).rows[0].n, 2)
  assert.equal(await count(db, nadia, 'members'), 1)
})

test('new auth user is not a gym user', async () => {
  const { db } = await migrated()
  const late = await addUser(db, 'heladera@x')
  assert.equal(await count(db, late, 'members'), 0)
  assert.equal((await as(db, late, 'select * from open_loans()')).rows.length, 0)
  await assert.rejects(
    as(db, late, "insert into members (name) values ('X')"),
    /row-level security/,
  )
})

test('gym user can still write', async () => {
  const { db, nadia } = await migrated()
  await as(db, nadia, "insert into members (name) values ('Bea')")
  assert.equal(await count(db, nadia, 'members'), 2)
})

test('gym_users shows only your own row', async () => {
  const { db, nadia } = await migrated()
  assert.equal(await count(db, nadia, 'gym_users'), 1)
})

test('migration run twice fails and leaves policies intact', async () => {
  const { db, nadia } = await migrated()
  await assert.rejects(db.exec(sql(MIGRATION)))
  await db.exec('rollback')
  assert.deepEqual(await policies(db, 'members'), ['Gym users have full access'])
  assert.equal(await count(db, nadia, 'members'), 1)
})

test('failed migration changes nothing', async () => {
  const { db } = await today()
  const broken = sql(MIGRATION).replace(/commit;\s*$/, 'select 1/0;\ncommit;\n')
  assert.notEqual(broken, sql(MIGRATION))
  await assert.rejects(db.exec(broken))
  await db.exec('rollback')
  assert.equal((await db.query("select to_regclass('public.gym_users') as t")).rows[0].t, null)
  assert.deepEqual(await policies(db, 'members'), ['Logged-in user has full access'])
})

test('rollback then migrate again', async () => {
  const { db } = await migrated()
  const late = await addUser(db, 'late@x')
  await db.exec(sql(ROLLBACK))
  assert.equal(await count(db, late, 'members'), 1)
  assert.equal((await db.query("select to_regclass('public.gym_users') as t")).rows[0].t, null)
  await db.exec(sql(MIGRATION))
  assert.equal((await db.query('select count(*)::int as n from gym_users')).rows[0].n, 3)
})

test('fresh schema.sql', async () => {
  const db = await newDb(ZONA_FIT + '/schema.sql')
  const u = await addUser(db, 'nadia@x')
  await db.exec('insert into gym_users select id from auth.users')
  assert.equal(await count(db, u, 'members'), 0)
  assert.deepEqual(await policies(db, 'payments'), ['Gym users have full access'])
})

test('ping still works for anon', async () => {
  const { db } = await migrated()
  assert.equal((await as(db, null, 'select ping() as p')).rows[0].p, 1)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, addUser, as } from './db.js'

test('as() switches user', async () => {
  const db = await newDb()
  const u = await addUser(db, 'a@x')
  const me = await as(db, u, 'select auth.uid() as id')
  assert.equal(me.rows[0].id, u)
  const anon = await as(db, null, 'select current_user as r')
  assert.equal(anon.rows[0].r, 'anon')
})

test('old zona-fit schema loads', async () => {
  const db = await newDb('supabase/tests/fixtures/zona-fit-schema-before.sql')
  const u = await addUser(db, 'a@x')
  const { rows } = await as(db, u, 'select count(*)::int as n from members')
  assert.equal(rows[0].n, 0)
})

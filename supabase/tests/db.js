import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// zona-fit is a sibling folder: ../zona-fit next to this repo.
export const ZONA_FIT = '../zona-fit/supabase'

// Reads a SQL file. Paths are relative to the heladera folder (npm runs from there).
export function sql(path) {
  return readFileSync(path, 'utf8')
}

// A fresh in-memory database with the Supabase stub, then each file in order.
export async function newDb(...sqlFiles) {
  const db = new PGlite()
  await db.exec(sql('supabase/tests/supabase-stub.sql'))
  for (const file of sqlFiles) await db.exec(sql(file))
  return db
}

// Creates a login and returns its id.
export async function addUser(db, email) {
  const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email])
  return rows[0].id
}

// Runs a query the way the app would: as that logged-in user, or as a
// visitor (anon) when userId is null. Goes back to the superuser after.
export async function as(db, userId, query, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ''])
  await db.exec(userId ? 'set role authenticated' : 'set role anon')
  try {
    return await db.query(query, params)
  } finally {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', '', false)")
  }
}

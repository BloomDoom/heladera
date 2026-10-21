-- Heladera: database schema (everything in one file).
--
-- Heladera lives inside zona-fit's Supabase project (the free plan allows
-- only 2 projects), in its own Postgres schema "heladera". It never
-- changes anything in "public", which belongs to zona-fit.
--
-- Setup, in this order (Supabase → SQL Editor → paste → Run):
--   1. zona-fit's supabase/migrations/2026-10-21-gym-users.sql, and Nadia
--      confirms zona-fit still shows everything.
--   2. This file.
--   3. Project Settings → API → Exposed schemas (Data API): add "heladera".
--   4. Authentication → Add user, for each person (Auto Confirm User).
--   5. supabase/add-household.sql, filled in (never commit it filled in).
--
-- Conventions:
--   * Everything belongs to a household (hogar), not to a person: members
--     of a household see and share the same data.
--   * Households and their members are created by hand with SQL.
--   * Table and column names are in English; the screens are in Spanish.

create schema heladera;
grant usage on schema heladera to authenticated;


-- ───────────────────────── Households (hogares)
create table heladera.households (
  id         bigint generated always as identity primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

-- user_id is the primary key: a login belongs to one household at most.
create table heladera.household_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id bigint not null references heladera.households(id),
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- The household of the logged-in user (null if they have none). Every
-- table's rule uses it. It's "security definer" so it can read
-- household_members without going through that table's own rule (which
-- calls this function: it would loop forever).
create function heladera.my_household_id()
returns bigint language sql stable security definer set search_path = '' as $$
  select household_id from heladera.household_members where user_id = auth.uid()
$$;
revoke execute on function heladera.my_household_id() from public, anon;
grant execute on function heladera.my_household_id() to authenticated;


-- ───────────────────────── Security (Row Level Security)
-- Each login only sees its own household. Visitors (anon) can't even use
-- the schema. Logins of zona-fit without a household see nothing here.
alter table heladera.households enable row level security;
create policy "Members see their household" on heladera.households
  for select to authenticated using (id = (select heladera.my_household_id()));

alter table heladera.household_members enable row level security;
create policy "Members see their household's members" on heladera.household_members
  for select to authenticated using (household_id = (select heladera.my_household_id()));

-- Only reading: households and members are created by hand with SQL.
grant select on heladera.households, heladera.household_members to authenticated;

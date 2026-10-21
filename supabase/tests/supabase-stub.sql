-- The parts of Supabase that our SQL relies on, so the tests can run on
-- PGlite: the anon/authenticated roles, auth.users and auth.uid().
-- In Supabase, auth.uid() reads the logged-in user from the request's
-- token; here the tests set request.jwt.claim.sub by hand (see db.js).

create role anon nologin;
create role authenticated nologin;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase's server-side role (the secret key). It skips Row Level Security.
create role service_role nologin bypassrls;

# Heladera — Stage 1 (Base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock zona-fit's data to gym users, create the `heladera` schema with households, and ship an empty Heladera PWA (login + tab bar) to GitHub Pages.

**Architecture:** One Supabase project shared with zona-fit. A migration in zona-fit adds `public.gym_users` and rewrites every policy to "user is in `gym_users`". Heladera lives in its own Postgres schema `heladera`, every table scoped to the user's household through `heladera.my_household_id()`. The frontend copies zona-fit's patterns (React 19 + Vite PWA, HashRouter, `useLoad`, `LoadState`) and talks to Supabase with `db: { schema: 'heladera' }`. SQL is tested locally on PGlite with a small stub of Supabase's `auth` schema and roles.

**Tech Stack:** React 19, Vite 8, vite-plugin-pwa, react-router-dom 7, @supabase/supabase-js 2, Node 24 `node:test`, @electric-sql/pglite (devDependency, tests only).

**Spec:** `heladera/docs/superpowers/specs/2026-10-21-heladera-design.md` (§3, §4, §5, §7 tab bar, §11 stage 1).

## Global Constraints

- UI in Rioplatense Spanish; code, table and column names in English. Dates DD/MM/YYYY.
- No new dependencies without asking. Already agreed: copy zona-fit's dependency set. **Ask the user** before adding `@electric-sql/pglite` (devDependency of `heladera` only, never of zona-fit).
- Heladera never modifies `public` except through the Task 2 migration. No triggers on `auth.users`.
- Client: `createClient(url, key, { db: { schema: 'heladera' } })`.
- Zona-fit rules (`zona-fit/.claude/CLAUDE.md`): update `supabase/schema.sql` (always complete), add `supabase/migrations/2026-10-21-gym-users.sql`, update the README.
- Both repos are (or will be) public: never write real emails or user ids into committed files.
- Users, households and members are created by hand in Supabase. "Allow new users to sign up" stays off.
- Monthly cost: zero.
- Bottom bar labels, in this order: **Hoy · Heladera · Compras · Más**. "Hoy" opens on launch.
- Branch `cuenta-de-prueba` in zona-fit is never deleted or merged.

## Review Focus

1. A logged-in user with no household (e.g. Nadia's login on the Heladera URL) must see a clear "no tenés hogar" screen with a logout button, never a crash or a blank app. Test: `my_household_id() is null for a user without household` (Task 3) and the gate in Task 5.
2. Running the zona-fit migration twice must fail and change nothing. Test: `migration run twice fails and leaves policies intact` (Task 2).
3. A zona-fit login created after the migration is locked out until added to `gym_users`. Test: `new auth user is not a gym user` (Task 2); README note (Task 2).
4. Rollback, then migration again, must work (the "undo and retry" path). Test: `rollback then migrate again` (Task 2).
5. The anon key must not read anything in `heladera`. Test: `anon cannot read households` (Task 3).

---

## File Structure

```
zona-fit/supabase/
  schema.sql                              modify: gym_users + new policies
  migrations/2026-10-21-gym-users.sql     create: the migration (one transaction)
  migrations/2026-10-21-gym-users-rollback.sql  create: restores using (true)
zona-fit/README.md                        modify: structure, setup step, note

heladera/
  package.json, vite.config.js, index.html, .env.example, .gitignore
  .github/workflows/deploy.yml            copy of zona-fit's
  public/                                 icons (apple-touch-icon, favicon, 192, 512, maskable)
  supabase/
    schema.sql                            heladera schema, tables, RLS, grants
    add-household.sql                     template to create a household by hand
    tests/
      supabase-stub.sql                   auth schema, auth.uid(), roles
      db.js                               PGlite helpers
      fixtures/zona-fit-schema-before.sql snapshot of zona-fit schema.sql today
      zona-fit-security.test.js
      heladera-schema.test.js
  src/
    main.jsx, App.jsx, index.css
    lib/supabase.js, lib/useLoad.js, lib/errors.js, lib/useOnline.js, lib/household.js
    components/TabBar.jsx, components/LoadState.jsx, components/ErrorBoundary.jsx
    screens/Login.jsx, Today.jsx, Fridge.jsx, Shopping.jsx, More.jsx, NoHousehold.jsx
  README.md
```

---

### Task 1: PGlite test harness

**Files:**
- Create: `heladera/package.json` (only `name: "heladera"`, `private`, `type: "module"`, script `"test:db": "node --test supabase/tests/"`, devDependency `@electric-sql/pglite`; Task 4 adds the rest)
- Create: `heladera/supabase/tests/supabase-stub.sql`, `heladera/supabase/tests/db.js`
- Create: `heladera/supabase/tests/fixtures/zona-fit-schema-before.sql` (byte copy of `zona-fit/supabase/schema.sql` at commit `fa76b3a`)
- Test: `heladera/supabase/tests/harness.test.js`

**Interfaces:**
- Produces, in `db.js`:
  - `newDb(...sqlFiles: string[]): Promise<PGlite>` — fresh in-memory DB, runs `supabase-stub.sql` then each file (paths relative to `heladera/`).
  - `addUser(db, email: string): Promise<string>` — inserts into `auth.users`, returns the uuid.
  - `as(db, userId: string | null, sql: string, params?: any[]): Promise<{rows}>` — runs `sql` as role `authenticated` with `request.jwt.claim.sub = userId` (role `anon` when `userId` is null), then `reset role`.
  - `ZONA_FIT = '../zona-fit/supabase'` constant for paths.
- Stub contents: roles `anon`, `authenticated` (nologin); schema `auth`; `auth.users(id uuid primary key default gen_random_uuid(), email text unique)`; `auth.uid()` returns `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`; `grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated`.

- [ ] **Step 1: Ask the user to approve `@electric-sql/pglite` as a devDependency of heladera.** Stop if refused.
- [ ] **Step 2: Write the failing test** `harness.test.js`:
  - `as() switches user`: after `newDb()`, `addUser(db,'a@x')` returns uuid `u`; `as(db, u, 'select auth.uid() as id')` gives `rows[0].id === u`; `as(db, null, 'select current_user as r')` gives `'anon'`.
  - `old zona-fit schema loads`: `newDb('supabase/tests/fixtures/zona-fit-schema-before.sql')` resolves; as a fresh user, `select count(*)::int as n from members` gives `0` without error.
- [ ] **Step 3: Run** `npm install && npm run test:db` in `heladera/`. Expected: FAIL (`db.js` missing).
- [ ] **Step 4: Implement** the stub and `db.js` per Interfaces. If PGlite rejects `set role`, stop and report: the RLS tests depend on it.
- [ ] **Step 5: Run** `npm run test:db`. Expected: PASS, 2 tests.
- [ ] **Step 6: Commit** in `heladera/`: `test: PGlite harness with Supabase auth stub`.

### Task 2: zona-fit security migration (spec §4)

**Files:**
- Create: `zona-fit/supabase/migrations/2026-10-21-gym-users.sql`
- Create: `zona-fit/supabase/migrations/2026-10-21-gym-users-rollback.sql`
- Modify: `zona-fit/supabase/schema.sql:510-527` (Security block)
- Modify: `zona-fit/README.md` (structure list, "One-time setup → 1. Supabase", "Good to know")
- Test: `heladera/supabase/tests/zona-fit-security.test.js`

**Interfaces:**
- Consumes: `newDb`, `addUser`, `as`, `ZONA_FIT` (Task 1).
- Produces (for Task 3 and the README): table `public.gym_users(user_id uuid primary key references auth.users(id) on delete cascade)`; RLS on, one policy `"Users see their own row"` `for select to authenticated using (user_id = (select auth.uid()))`; `grant select on gym_users to authenticated`. Every zona-fit table (the same 16-name array as today) gets policy `"Gym users have full access"`: `for all to authenticated using (exists (select 1 from gym_users where user_id = (select auth.uid()))) with check (` same `)`. Grants unchanged.

Migration file order (one `begin; … commit;`): header comment in the style of `2026-10-15-consumibles.sql` (what, why, "Supabase → SQL Editor → paste → Run. If anything fails, nothing changes."), `create table gym_users`, `insert into gym_users select id from auth.users` (guarantee 1: everyone who exists today), RLS + policy on `gym_users`, then a `do $$` loop that drops `"Logged-in user has full access"` and creates the new policy on each table. Rollback file: one transaction that recreates `"Logged-in user has full access"` with `using (true) with check (true)` on the 16 tables, drops the new policies and `drop table gym_users`. In `schema.sql`, the Security block creates `gym_users` and the new policies directly, and its comment says that after creating Nadia's login you run `insert into gym_users select id from auth.users;`.

- [ ] **Step 1: Write the failing tests.** Setup for each: `newDb(fixture)`, `addUser` x2 (`nadia`, `autor`), insert one row in `members` and one in `products` as superuser, then run the migration file.
  - `existing users stay gym users`: `select count(*) from gym_users` = 2; as `nadia`, `select count(*) from members` = 1.
  - `new auth user is not a gym user`: `addUser('heladera@x')` after migration; as that user, `members` count = 0, `select * from open_loans()` returns 0 rows, and `insert into members(...)` rejects with `/row-level security/`.
  - `gym user can still write`: as `nadia`, insert into `members` succeeds.
  - `gym_users shows only your own row`: as `nadia`, `select count(*) from gym_users` = 1.
  - `migration run twice fails and leaves policies intact`: running the migration again rejects; afterwards `pg_policies` for `members` has exactly `["Gym users have full access"]` and `nadia` still sees 1 member.
  - `failed migration changes nothing`: on a fresh setup, run the migration text with `select 1/0;` inserted before `commit;`; it rejects; then `rollback`; `to_regclass('public.gym_users')` is null and `members` policy is still `"Logged-in user has full access"`.
  - `rollback then migrate again`: run rollback; the late user sees 1 member and `gym_users` is gone; run the migration again; it succeeds and the late user is now in `gym_users` (count 3).
  - `fresh schema.sql`: `newDb(ZONA_FIT + '/schema.sql')`, `addUser`, `insert into gym_users select id from auth.users`, user sees `members` count 0 without error; `pg_policies` on `payments` is `["Gym users have full access"]`.
  - `ping still works for anon`: as anon, `select ping()` = 1.
- [ ] **Step 2: Run** `npm run test:db`. Expected: FAIL (migration file not found).
- [ ] **Step 3: Write** the migration, rollback and `schema.sql` changes as described.
- [ ] **Step 4: Run** `npm run test:db`. Expected: PASS, all tests.
- [ ] **Step 5: Update** `zona-fit/README.md`: add both files to the structure list; in setup step 1 add the `insert into gym_users …` line after creating the login; under "Good to know" add: "A new login only sees the gym's data after `insert into gym_users values ('<id>')`. Undo: `migrations/2026-10-21-gym-users-rollback.sql`. Heladera shares this Supabase project (schema `heladera`)."
- [ ] **Step 6: Commit** in `zona-fit/` (on `main`, not pushed yet): `Security: only gym users see the gym's data`. Commit the new test in `heladera/`: `test: zona-fit gym_users migration`. Do not run anything on the real Supabase yet (Task 6).

### Task 3: `heladera` schema (spec §4 rules, §5)

**Files:**
- Create: `heladera/supabase/schema.sql`, `heladera/supabase/add-household.sql`
- Test: `heladera/supabase/tests/heladera-schema.test.js`

**Interfaces:**
- Consumes: Task 1 helpers; `zona-fit/supabase/schema.sql` after Task 2.
- Produces (every later stage relies on these):
  - `heladera.households(id bigint generated always as identity primary key, name text not null, created_at timestamptz not null default now())`
  - `heladera.household_members(user_id uuid primary key references auth.users(id) on delete cascade, household_id bigint not null references heladera.households(id), display_name text not null, created_at timestamptz not null default now())` — `user_id` as primary key means one household per user.
  - `heladera.my_household_id() returns bigint` — `language sql stable security definer set search_path = ''`, `select household_id from heladera.household_members where user_id = auth.uid()`. `revoke execute … from public, anon; grant execute … to authenticated`. Later tables use `household_id bigint not null default heladera.my_household_id()` and policy `household_id = (select heladera.my_household_id())`.
  - Policies: `households` select `using (id = (select heladera.my_household_id()))`; `household_members` select `using (household_id = (select heladera.my_household_id()))`. Grants: `usage on schema heladera to authenticated`; `select` only on both tables (households are created by hand).
- `add-household.sql`: a commented template with `EMAIL_1`/`EMAIL_2`/`NOMBRE_1`/`NOMBRE_2`/`NOMBRE_HOGAR` placeholders, one transaction, raises an exception if an email has no login (same style as zona-fit's `cuenta-de-prueba` migration). Header warns: never commit it filled in.

- [ ] **Step 1: Write the failing tests.** Setup: `newDb(ZONA_FIT + '/schema.sql', 'supabase/schema.sql')`; users `nadia` (in `gym_users`), `a1`, `a2` (household "Casa"), `b1` (household "Otra"), `solo` (no household); one zona-fit `members` row.
  - `member sees own household and both members`: as `a1`, households = `["Casa"]`, member count = 2.
  - `member does not see another household`: as `b1`, households = `["Otra"]`, member count = 1.
  - `my_household_id() is null for a user without household`: as `solo`, `select heladera.my_household_id()` is null; households and members counts are 0.
  - `heladera user sees nothing of zona-fit`: as `a1`, `select count(*) from public.members` = 0.
  - `gym user sees nothing of heladera`: as `nadia`, households count = 0.
  - `anon cannot read households`: as anon, `select * from heladera.households` rejects with `/permission denied/`.
  - `members cannot add members`: as `a1`, insert into `household_members` rejects with `/permission denied/`.
  - `add-household template fails safely with placeholders`: running `add-household.sql` unchanged rejects and `households` count stays 2.
- [ ] **Step 2: Run** `npm run test:db`. Expected: FAIL (`supabase/schema.sql` not found).
- [ ] **Step 3: Write** `schema.sql` and `add-household.sql` per Interfaces. Header comment of `schema.sql` lists the setup order: run zona-fit migration first, then this file, then add `heladera` to Settings → API → Exposed schemas, then `add-household.sql`.
- [ ] **Step 4: Run** `npm run test:db`. Expected: PASS, all tests (Task 1–3).
- [ ] **Step 5: Commit**: `feat: heladera schema with households and RLS`.

### Task 4: PWA scaffold

**Files:**
- Modify: `heladera/package.json` (add zona-fit's `dependencies`, `devDependencies` and scripts `dev`, `build`, `preview`, same versions as `zona-fit/package.json`)
- Create: `vite.config.js` (copy zona-fit's; manifest `name`/`short_name` `"Heladera"`, `description` `"¿Qué comemos hoy?"`; keep `BASE_PATH`, `autoUpdate`, workbox comment)
- Create: `index.html` (copy zona-fit's, title `Heladera`, `lang="es"`)
- Create: `.env.example`, `.gitignore` (copies of zona-fit's)
- Create: `.github/workflows/deploy.yml` (copy of zona-fit's; no keep-alive: zona-fit's already pings the shared project)
- Create: `public/` icons with the same five names as zona-fit's `public/` (except `logo-mark.png`), drawn as a simple fridge on a solid background. Generate them with a PowerShell `System.Drawing` script kept in the scratchpad, not in the repo.
- Create: `src/index.css` (copy zona-fit's base: variables, `.screen`, `.center`, `.tab-bar`, `.tab`, `.offline-banner`, `.login`, buttons, inputs, `.error`, `.muted`, `.load-error`; drop gym-only classes)

- [ ] **Step 1: Run** `npm install` then `npm run build`. Expected: build fails (no `src/main.jsx`) — confirms the scaffold is wired.
- [ ] **Step 2: Add a placeholder** `src/main.jsx` rendering `<p>Heladera</p>`.
- [ ] **Step 3: Run** `npm run build`. Expected: PASS, `dist/` contains `manifest.webmanifest` with `"name":"Heladera"` and `sw.js`.
- [ ] **Step 4: Commit**: `feat: PWA scaffold copied from zona-fit`.

### Task 5: App shell — login, household gate, tab bar

**Files:**
- Create: `src/lib/supabase.js` (zona-fit's, with `{ db: { schema: 'heladera' } }`), `src/lib/useLoad.js`, `src/lib/errors.js`, `src/lib/useOnline.js` (copies)
- Create: `src/lib/household.js`
- Create: `src/components/LoadState.jsx`, `ErrorBoundary.jsx` (copies), `TabBar.jsx`
- Create: `src/screens/Login.jsx` (zona-fit's; logo `icon-512.png`, alt `"Heladera"`), `Today.jsx`, `Fridge.jsx`, `Shopping.jsx`, `More.jsx`, `NoHousehold.jsx`
- Modify: `src/main.jsx` (zona-fit's structure: `HashRouter`, `ErrorBoundary`, Nunito font, `index.css`; skip `bigText`/`keyboard` unless the build of a screen needs them)
- Create: `src/App.jsx`

**Interfaces:**
- Consumes: tables from Task 3.
- Produces:
  - `loadHousehold(): Promise<{ id: number, name: string, members: { user_id: string, display_name: string }[] } | null>` in `household.js` — `null` when the user has no household. One query: `households` select `id, name, household_members(user_id, display_name)`, `maybeSingle()`.
  - `tabs` exported from `TabBar.jsx`: `[{ to: '/', label: 'Hoy' }, { to: '/fridge', label: 'Heladera' }, { to: '/shopping', label: 'Compras' }, { to: '/more', label: 'Más' }]`, with inline Lucide-style SVG icons like zona-fit's. No raised home button.
  - `App.jsx`: zona-fit's session logic and offline banner. When logged in, `useLoad(loadHousehold, [session.user.id])`; while loading or on error show `LoadState`; `null` shows `NoHousehold`; otherwise routes `/`, `/fridge`, `/shopping`, `/more`, `*` → `/`, plus `TabBar`. The household is passed to `More` as a prop.
- Copy (exact):
  - `Today`: heading `¿Qué comemos hoy?`, text `Todavía no hay recetas. Llegan en la próxima etapa.`
  - `Fridge`: heading `Heladera`, text `La heladera está vacía.`
  - `Shopping`: heading `Compras`, text `La lista de compras está vacía.`
  - `More`: heading `Más`, the household name, the members' `display_name` joined with ` y `, button `Cerrar sesión` (`supabase.auth.signOut()`).
  - `NoHousehold`: `Tu usuario todavía no tiene un hogar en la Heladera.`, muted `Pedile a quien armó la app que te agregue.`, button `Cerrar sesión`.

- [ ] **Step 1: Write** the files above.
- [ ] **Step 2: Run** `npm run build`. Expected: PASS with no warnings about missing imports.
- [ ] **Step 3: Run** `npm run dev` without `.env`. Expected: the "La app todavía no está conectada a la base de datos." screen (proves the unconfigured path). Login against the real project waits for Task 6.
- [ ] **Step 4: Commit**: `feat: login, household gate and tab bar`.

### Task 6: Go live (manual, in this exact order)

Every step here touches production or publishes something. Ask the user before each numbered step and wait for "ok". The user runs the SQL; Claude never pastes real emails into files.

- [ ] **Step 1: Push zona-fit.** `git push` in `zona-fit/` (only docs, schema.sql and new migration files change; the app build is identical). Check the deploy workflow passes.
- [ ] **Step 2: User runs** `zona-fit/supabase/migrations/2026-10-21-gym-users.sql` in Supabase → SQL Editor. Expected: "Success. No rows returned". Then `select count(*) from gym_users;` equals the number of rows in Authentication → Users.
- [ ] **Step 3: Nadia opens zona-fit** and confirms she sees chicas, pagos and tienda as before. If not: the user runs the rollback file immediately, and the plan stops here. **No heladera user exists before this "ok".**
- [ ] **Step 4: User runs** `heladera/supabase/schema.sql` in SQL Editor, then adds `heladera` to Settings → API → Exposed schemas.
- [ ] **Step 5: User creates** the two logins in Authentication → Add user (auto-confirm), then runs `add-household.sql` filled in the SQL Editor only (not saved in the repo). Expected: `select * from heladera.household_members;` shows 2 rows.
- [ ] **Step 6: Local check.** Copy zona-fit's `.env` to `heladera/.env`. `npm run dev`; log in with each heladera login: tab bar shows Hoy · Heladera · Compras · Más, Más shows the household and both names. Log in with Nadia's login: `NoHousehold` screen. Re-check zona-fit with a heladera login: no data visible.
- [ ] **Step 7: GitHub.** Ask the user to confirm a **public** repo named `heladera` (GitHub Pages on the free plan needs public). Then `gh repo create heladera --public --source . --push`, `gh secret set VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (same values as zona-fit), enable Pages with source "GitHub Actions". Expected: deploy workflow green; `https://<user>.github.io/heladera/` shows the login.
- [ ] **Step 8: README** in `heladera/`: what it is, structure, setup order from `schema.sql`'s header, how to run `npm run test:db`, "shares zona-fit's Supabase project". Commit and push.
- [ ] **Step 9: Done when** (spec §11): Nadia confirmed zona-fit works, and both household members installed the app on their iPhones, logged in and saw the empty app.

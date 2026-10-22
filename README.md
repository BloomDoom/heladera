# Heladera

"¿Qué comemos hoy?": a home app that suggests a dish from what's in the
fridge, keeps the fridge inventory and builds the shopping list. Mobile-first
PWA for the iPhone Home Screen. The screens are in Spanish; the code is in
English.

Design: `docs/superpowers/specs/2026-10-21-heladera-design.md`.
Plans: `docs/superpowers/plans/`.

**Stack:** React + Vite (plain JS) · Supabase (Postgres + Auth) · GitHub Pages.
Same architecture as `../zona-fit`.

**Shared Supabase project:** Heladera lives inside zona-fit's Supabase project
(the free plan allows only 2 projects), in its own Postgres schema `heladera`.
It never changes zona-fit's `public` schema. zona-fit's `gym_users` table keeps
Heladera logins away from the gym's data, and zona-fit's keep-alive workflow
keeps the project awake.

## Project structure

```
index.html                  iPhone/PWA meta tags
vite.config.js              build settings + PWA manifest and service worker
supabase/
  schema.sql                the heladera schema, tables and security rules (run once)
  add-household.sql         template to create a household by hand
  migrations/               dated changes for a database made with an older schema.sql
  tests/                    SQL tests on PGlite (a stub of Supabase auth in supabase-stub.sql)
scripts/recipes/            builds and loads the recipe book (see "Recetario" below)
src/
  main.jsx                  starts React, the router and the crash screen
  App.jsx                   login check, household check, routes, offline banner
  index.css                 all styles (colors/sizes at the top)
  lib/
    supabase.js, auth.js    the client (schema heladera, own login key, local logout)
    household.js            the logged-in user's household and members
    format.js, freshness.js dates and plurals; how fresh a fridge item is
    products.js, fridge.js  product search and shop groups; fridge, purchases and new products
    suggest.js              ranks the dishes you can make and says why
    swipe.js                swipe gesture of the suggestion card
    today.js                loads and saves what Hoy, the recipe and the basics need
    useLoad.js, errors.js, useOnline.js, asset.js   copied from zona-fit
  components/               TabBar, LoadState, ErrorBoundary, Toast, BackButton,
                            FridgeItem, NewProductForm, SuggestionCard, FinishedSheet,
                            AssumedEditor
  screens/                  Login, Today (Hoy), Recipe, Fridge, AddToFridge, Shopping, More, NoHousehold
public/                     icons
.github/workflows/          deploy to GitHub Pages
```

## Setup

The order matters (see the header of `supabase/schema.sql`):

1. zona-fit's `supabase/migrations/2026-10-21-gym-users.sql` has run, and zona-fit
   still works for its users.
2. Supabase → SQL Editor: run `supabase/schema.sql`. On a database made with an
   older `schema.sql`, run the dated files of `supabase/migrations/` instead, in
   order: `2026-10-22-recetario.sql`, then `2026-10-23-inventario.sql`, then `2026-10-24-hoy.sql`.
3. Project Settings → Data API → Exposed schemas: add `heladera`.
4. Authentication → Add user (Auto Confirm User) for each person, unless they
   use an existing login. A Heladera login must not be in zona-fit's `gym_users`.
5. SQL Editor: run `supabase/add-household.sql` filled in. Never commit it filled in.

Locally: `cp .env.example .env` (same URL and key as zona-fit), `npm install`,
`npm run dev`. GitHub Pages: same secrets and Pages settings as zona-fit.

## Recetario (recipes and product dictionary)

Built once from three sources, filtered to easy lunch/dinner dishes of an hour
or less, with every ingredient matched to a product of
`scripts/recipes/dictionary/products.json` (spec §6). The sources and the
generated recipes are **not** in the repo (personal use only).

1. Put the sources in `scripts/recipes/sources/` (URLs at the top of `build.js`).
2. `node scripts/recipes/build.js`: writes `scripts/recipes/out/` and lists the
   ingredient lines that matched no product. To grow the dictionary, add
   products/synonyms (`products.json`), Spain → Argentina words (`es-ar.json`)
   or non-food lines (`ignore.json`), run `npm test` and build again.
3. `node --env-file=.env.local scripts/recipes/load.js`: loads it into Supabase
   (needs `SUPABASE_SERVICE_KEY` in `.env.local`, see `.env.example`). Safe to
   run again.

## Tests

`npm test` runs the SQL tests (`npm run test:db`, needs `../zona-fit` next to
this folder), the `src/lib` tests and the recipe script tests.

## Good to know

- **Login:** stored under its own key (`heladera-auth`), so it doesn't replace
  the zona-fit login in the same browser. "Cerrar sesión" only logs out this app
  on this device.
- **Households:** created by hand with SQL. A login belongs to one household at
  most. A login without a household sees "no tenés hogar".

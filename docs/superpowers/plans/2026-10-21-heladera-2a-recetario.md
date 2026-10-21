# Heladera — Stage 2a (Recetario + diccionario) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the product dictionary and a one-time script that turns the three recipe sources into normalized recipes, and load them into the `heladera` schema.

**Architecture:** New tables `products`, `recipes`, `recipe_ingredients` in `heladera`, readable by every household (base data has `household_id null`). A Node script in `scripts/recipes/` reads the sources from a local download folder, filters, repairs broken accents, adapts words to Argentina, matches every ingredient line against a hand-curated dictionary (`products.json`) and writes JSON to `scripts/recipes/out/` (git-ignored). A separate loader upserts that JSON into Supabase with the service-role key from a git-ignored `.env.local`. No AI runs at app time; the dictionary is curated by Claude during this build.

**Tech Stack:** Node 24 (`node:test`, no new dependencies), PGlite for SQL tests, supabase-js for the loader.

**Spec:** `heladera/docs/superpowers/specs/2026-10-21-heladera-design.md` (§6, §8 product fields, §4 "medir el tamaño antes de cargar").

## Global Constraints

- Code in English, UI text in Rioplatense Spanish. No new dependencies.
- Sources: somosnlp/RecetasDeLaAbuela `main.csv` (config `version_1`), peregrinogris/recetario (MIT), peluso-cocina/recetario-culinario (CC0). Save source and origin URL of every recipe.
- Personal/family use only: the generated recipe data and the downloaded sources are **never committed** (the repo is public). Only scripts, tests and the dictionary are committed.
- Filter (spec §6): main course or dinner, difficulty low or medium, ≤ 60 min; no country filter; no desserts, loose sauces or drinks.
- Adapt title and ingredient lines to Argentine words; steps stay as in the original.
- Dictionary is generic ("carne picada" and "nalga" → "carne de vaca"; "leche descremada" → "leche"). Each product has category, `storage` (`fridge` | `pantry`), typical shelf life in days, synonyms.
- Sal, pimienta, aceite, agua are "assumed" (always available for choosing recipes); aceite is still a normal product.
- Every recipe ingredient is marked main or minor.
- Measure the database size before loading; it must stay well under 500 MB.
- Out of scope here (later plans): editing the assumed list per household (2c), household products and own recipes (2b/2d).
- The service-role key lives only in `heladera/.env.local` (git-ignored), never in the app or the repo.

## Review Focus

1. Ingredient lines full of quantities, fractions and units ("½ taza de cilantro finamente picado", "300gr de lentejas", "2 o 3 hojas de laurel seco") must match the right product. Test: `matchProducts strips quantities and units` (Task 3).
2. One line naming two products ("Sal y pimienta al gusto") must yield both. Test: `matchProducts returns every product in a line` (Task 3).
3. Substring traps: "ajonjolí" is not "ajo", "pimienta" is not "pimiento", "harina de maíz" is not "maíz". Test: `matchProducts matches whole words, longest first` (Task 3).
4. A recipe naming the same product twice gets one ingredient row, main if any line was main. Test: `assemble merges repeated products` (Task 4).
5. Running the loader twice must not duplicate anything. Test: `unique keys make reloads idempotent` (Task 1) plus the upsert keys in Task 6.

---

## File Structure

```
supabase/schema.sql                         modify: products, recipes, recipe_ingredients, RLS, grants
supabase/migrations/2026-10-22-recetario.sql create: same changes for the live DB
supabase/tests/recetario-schema.test.js     create
scripts/recipes/
  csv.js            parseCsv(text) → string[][]
  abuela.js         readAbuela(csvText) → RawRecipe[]; isDinnerDish(); minutesOf(); splitIngredients()
  markdown.js       parseMarkdownRecipe(text, source, slug) → RawRecipe
  mojibake.js       buildVocab(texts) / fixMojibake(text, vocab)
  normalize.js      matchProducts(line, dict) / argentinize(text, words)
  assemble.js       assemble(rawRecipes, dict, words) → { recipes, report }
  build.js          CLI: sources folder → out/*.json + coverage report
  load.js           CLI: out/*.json → Supabase (service-role key)
  dictionary/products.json   the product dictionary (committed)
  dictionary/es-ar.json      Spain → Argentina words (committed)
  dictionary/ignore.json     lines that are not food (palillos, papel aluminio…)
  dictionary/markdown-allowlist.json   which markdown recipes are dishes
  tests/*.test.js
  out/              generated, git-ignored
```

`package.json` `test` script gains `"scripts/recipes/tests/*.test.js"`.

`RawRecipe = { sourceKey: string, source: 'abuela'|'peregrinogris'|'peluso', url: string|null, title: string, minutes: number|null, servings: number|null, difficulty: 'baja'|'media'|null, country: string|null, ingredients: string[], steps: string }`

---

### Task 1: Recetario tables

**Files:**
- Modify: `supabase/schema.sql` (new section after Households, before Security; policies in Security)
- Create: `supabase/migrations/2026-10-22-recetario.sql` (one `begin; … commit;`, header like the stage 1 SQL files)
- Test: `supabase/tests/recetario-schema.test.js`

**Interfaces:**
- Produces:
  - `heladera.products(id bigint generated by default as identity primary key, code text unique, household_id bigint references heladera.households(id), name text not null, category text not null, storage text not null check (storage in ('fridge','pantry')), shelf_days int check (shelf_days > 0), assumed boolean not null default false, synonyms text[] not null default '{}', created_at timestamptz not null default now())`. `code` is the slug of a base product (`'carne-de-vaca'`), null for household products. `check ((household_id is null) = (code is not null))`.
  - `heladera.recipes(id bigint generated by default as identity primary key, source_key text unique, household_id bigint references heladera.households(id), title text not null, minutes int, servings int, difficulty text check (difficulty in ('baja','media','alta')), country text, steps text not null, source text not null, source_url text, created_at timestamptz not null default now())`. Same check between `household_id` and `source_key`.
  - `heladera.recipe_ingredients(recipe_id bigint references heladera.recipes(id) on delete cascade, product_id bigint references heladera.products(id), line text not null, is_main boolean not null, primary key (recipe_id, product_id))`.
  - RLS select policy on all three: base rows (`household_id is null`) or `household_id = (select heladera.my_household_id())`; for `recipe_ingredients`, through its recipe. Grants: `select` to `authenticated`; `select, insert, update, delete` on the three tables and `usage, select` on their sequences to `service_role`. Writes by households come in 2b/2d.
  - In the PGlite stub, add role `service_role` with `bypassrls` (as in Supabase).

- [ ] **Step 1: Write failing tests** in `recetario-schema.test.js` (setup like `heladera-schema.test.js`: households Casa/Otra, one base product `leche`, one product private to Casa, one base recipe using `leche`):
  - `base products and recipes are visible to every household`: `a1` and `b1` both see `leche` and the base recipe with its ingredient.
  - `private products are only visible to their household`: `b1` does not see Casa's product.
  - `users without household see base data only`: `solo` sees the base rows.
  - `anon reads nothing`: rejects `/permission denied/`.
  - `households cannot write the dictionary`: insert into `products` as `a1` rejects `/permission denied/`.
  - `unique keys make reloads idempotent`: inserting a second product with `code 'leche'` or recipe with the same `source_key` rejects `/duplicate key/`; `insert … on conflict (code) do update` keeps 1 row.
- [ ] **Step 2: Run** `npm run test:db`. Expected: FAIL (`relation "heladera.products" does not exist`).
- [ ] **Step 3: Add test** `migration matches schema.sql`: copy today's `supabase/schema.sql` byte for byte to `supabase/tests/fixtures/heladera-schema-stage1.sql`; `stage1 + migration` and `schema.sql` alone must give the same rows from `information_schema.columns` and `pg_policies` for schema `heladera`.
- [ ] **Step 4: Write** the schema.sql section and the migration (identical DDL).
- [ ] **Step 5: Run** `npm test`. Expected: PASS, all.
- [ ] **Step 6: Commit**: `feat: products and recipes tables`.

### Task 2: Reading the sources

**Files:**
- Create: `scripts/recipes/csv.js`, `abuela.js`, `markdown.js`, `mojibake.js`
- Test: `scripts/recipes/tests/sources.test.js`

**Interfaces:**
- Produces:
  - `parseCsv(text: string): string[][]` — RFC 4180 (quoted fields, `""`, newlines inside quotes), strips a leading BOM.
  - `splitIngredients(field: string): string[]` — the field is either a Python list literal (`"['1 huevo', '2 papas']"`) or a comma list (`"½ taza de cilantro, 1 taza de tomate"`); the comma form is split on `/,\s+/`; items are trimmed and empty ones dropped.
  - `minutesOf(duration: string): number | null` — `'00:45'` → 45, `'01:00'` → 60, `'24:00:00'` / `''` → null.
  - `isDinnerDish(row): boolean` — `Tiempo` is `Plato principal` or `Cena`, `Dificultad` is `Dificultad muy baja|baja|media`, `minutesOf ≤ 60`.
  - `readAbuela(csvText: string): RawRecipe[]` — only rows passing `isDinnerDish`; `sourceKey 'abuela:<Id>'`, `difficulty` `'baja'` for muy baja/baja, `'media'` for media; `servings` from `"4 comensales"`/`"4"`; `country` empty → null.
  - `parseMarkdownRecipe(text, source, slug): RawRecipe` — handles both repos: title from `## ` (peregrinogris) or the file name (peluso); ingredients = `- ` lines under the `Ingredientes` heading; steps = text under `Preparación`/`Elaboración` with blockquote markers, images and HTML removed; peluso front matter gives `raciones`, `tiempo_elaboracion` (`'15 min'` → 15), `dificultad`.
  - `buildVocab(texts: string[]): Map<string, number>` and `fixMojibake(text, vocab): string` — every word containing `Ã` followed by U+FFFD is replaced by the candidate (the `Ã�` pair → one of `á é í ó ú ñ ü Á É Í Ó Ú Ñ`) seen most often in the vocab; with no candidate in the vocab the word is left unchanged and `fixMojibake.unresolved` counts it.

- [ ] **Step 1: Write failing tests** (inline strings, no downloads):
  - `parseCsv handles quotes, commas and newlines in fields`
  - `splitIngredients reads both formats`: python list of 3 → 3 items; `"½ taza de cilantro finamente picado, 1 taza de tomate picadito, Sal al gusto"` → 3 items.
  - `minutesOf`: the four cases above.
  - `isDinnerDish`: Plato principal/baja/00:30 true; Postre false; Entrante false; Dificultad alta false; 01:30 false; empty Tiempo false.
  - `readAbuela maps a row`: sourceKey, url, difficulty `'baja'`, servings 4, minutes 30, country `'ARG'`.
  - `parseMarkdownRecipe reads peregrinogris` (the `guiso-lentejas` shape: 21 ingredients, steps without `>`) and `reads peluso` (front matter `raciones: 2`, `tiempo_elaboracion: 15 min`).
  - `fixMojibake picks the most common spelling`: vocab from `'está está ají'` fixes `'estÃ�'` → `'está'` and `'ajÃ�'` → `'ají'`; an unknown word stays and counts as unresolved.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the four modules.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: read recipe sources`.

### Task 3: Dictionary and matching

**Files:**
- Create: `scripts/recipes/normalize.js`, `scripts/recipes/dictionary/products.json`, `es-ar.json`, `ignore.json`
- Test: `scripts/recipes/tests/normalize.test.js`

**Interfaces:**
- `products.json`: `[{ code, name, category, storage, shelf_days, minor, assumed, synonyms: string[] }]`. Categories (fixed list, used later for defaults): `verdura`, `fruta`, `carne`, `pollo`, `pescado`, `fiambre`, `lacteo`, `huevo`, `almacen`, `condimento`, `bebida`, `congelado`, `panificado`. Seed with ~150 common products; Task 5 grows it. Shelf days per spec: verdura de hoja 5, carne fresca 3, yogur 15, queso duro 30; pantry items 365.
- `es-ar.json`: `{ "patata": "papa", "patatas": "papas", "calabacín": "zapallito", "nata": "crema", "judía verde": "chaucha", "judías verdes": "chauchas", "pimiento": "morrón", "aguacate": "palta", "gambas": "langostinos", "guisantes": "arvejas", "frijoles": "porotos", "judías": "porotos", "zumo": "jugo", "melocotón": "durazno", "bacon": "panceta", "maíz tierno": "choclo", "mazorca": "choclo", "champiñones": "champiñones", "cacahuete": "maní", "cacahuetes": "maní", "fresas": "frutillas", "piña": "ananá", "tomate triturado": "tomate triturado" }` — grows in Task 5.
- Produces:
  - `prepare(dict): Dict` — builds the matcher (all synonyms + name, accent-folded, lowercase, sorted longest first).
  - `matchProducts(line: string, d: Dict): string[]` — product codes in order of appearance. Accent-fold and lowercase the line, remove quantities (`\d+([.,/]\d+)?`, `½¼¾⅓⅔⅛`), units (`g gr gramos kg ml cc cm3 l litro(s) taza(s) cucharada(s) cucharadita(s) pizca diente(s) rama(s) lata(s) paquete(s) unidad(es) c/n`), then find synonyms as whole words, longest first, without overlapping.
  - `isIgnored(line, ignoreList): boolean`.
  - `argentinize(text: string, words: object): string` — whole-word replacement, keeps the first letter's case (`'Patatas bravas'` → `'Papas bravas'`).

- [ ] **Step 1: Write failing tests**:
  - `matchProducts strips quantities and units`: `'½ taza de cilantro finamente picado'` → `['cilantro']`; `'300gr de lentejas'` → `['lentejas']`; `'2 o 3 hojas de laurel seco'` → `['laurel']`.
  - `matchProducts returns every product in a line`: `'Sal y pimienta al gusto'` → `['sal', 'pimienta']`.
  - `matchProducts matches whole words, longest first`: `'semillas de ajonjolí'` → not `'ajo'`; `'1 pimiento rojo'` → `['morron']` and not `pimienta`; `'harina de maíz'` → `['harina-de-maiz']`; `'2 dientes de ajo'` → `['ajo']`.
  - `generic products`: `'500 g de carne picada'` and `'1 kg de nalga'` → `['carne-de-vaca']`; `'leche descremada'` → `['leche']`; `'patatas'` → `['papa']`.
  - `argentinize keeps case and whole words`: `'Patatas con nata'` → `'Papas con crema'`; `'patatero'` unchanged.
  - `dictionary is valid`: every product has a unique `code`, a category from the list, `storage` fridge|pantry, `shelf_days > 0`, no synonym used by two products; `sal`, `pimienta`, `aceite`, `agua` exist with `assumed: true`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `normalize.js` and write the seed dictionary files.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: product dictionary and ingredient matching`.

### Task 4: Assemble

**Files:**
- Create: `scripts/recipes/assemble.js`
- Test: `scripts/recipes/tests/assemble.test.js`

**Interfaces:**
- Consumes: `RawRecipe`, `prepare`, `matchProducts`, `isIgnored`, `argentinize`, `fixMojibake`.
- Produces: `assemble(raw: RawRecipe[], { dict, words, ignore, vocab }): { recipes: Recipe[], report: { kept, dropped, unmatched: Map<string, number>, unresolvedMojibake } }` where `Recipe = { sourceKey, source, url, title, minutes, servings, difficulty, country, steps, ingredients: { code, line, isMain }[] }`.
  - Title: `fixMojibake` then `argentinize`. Ingredient `line`: same. Steps: only `fixMojibake`.
  - Ignored lines are dropped. A line with no match goes to `report.unmatched` (key = the line folded, without quantities).
  - **Drop rule:** a recipe is dropped if any non-ignored line has no product, if it ends with fewer than 2 products, or if its title still has unresolved mojibake.
  - `isMain = !product.minor`. Repeated products merge; `isMain` is true if any line was main; `line` keeps the first.
  - Titles that are only a sauce, drink or dessert (`/^(salsa|aderezo|trago|postre|torta|budín|helado)\b/i`) are dropped.

- [ ] **Step 1: Write failing tests**:
  - `assemble merges repeated products`: two lines `'1 cebolla'`, `'cebolla de verdeo picada (opcional)'` with dict `cebolla` / `cebolla-de-verdeo` → 2 products; two lines `'sal'`, `'sal gruesa'` → one `sal`.
  - `assemble drops recipes with unknown ingredients`: one line `'2 kiwanos'` → dropped, `report.unmatched` has `'kiwanos'`.
  - `assemble keeps ignored lines out`: `'24 palillos de madera'` ignored, recipe kept.
  - `assemble marks minor ingredients`: `orégano` (minor) → `isMain false`; `pollo` → `true`.
  - `assemble adapts titles but not steps`: title `'Patatas guisadas'` → `'Papas guisadas'`; steps keep `'patatas'`.
  - `assemble drops sauces and desserts by title`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `assemble.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: assemble normalized recipes`.

### Task 5: Build and curate the dictionary (Claude's normalization pass)

**Files:**
- Create: `scripts/recipes/build.js`, `scripts/recipes/dictionary/markdown-allowlist.json`
- Modify: `scripts/recipes/dictionary/products.json`, `es-ar.json`, `ignore.json`
- Modify: `.gitignore` (`scripts/recipes/out/`, `scripts/recipes/sources/`)

**Interfaces:**
- `node scripts/recipes/build.js <sourcesDir>` where `sourcesDir` has `abuela/main.csv`, `peregrinogris/recetas/*.md`, `peluso/Recetas/*.md` (default `scripts/recipes/sources/`, git-ignored). Writes `out/products.json` (the dictionary as loaded), `out/recipes.json` (`Recipe[]`), and prints: kept/dropped per source, top 60 unmatched lines with counts, unresolved mojibake count.
- `markdown-allowlist.json`: the slugs of the markdown recipes that are main dishes (no dulce de leche, helados, budines, panes, conservas, salsas, tragos).

- [ ] **Step 1: Download** the sources into `scripts/recipes/sources/` (the CSV from `https://huggingface.co/datasets/somosnlp/RecetasDeLaAbuela/resolve/main/main.csv`, `git clone --depth 1` both repos). Already approved by the user for a scratch folder; this folder is git-ignored.
- [ ] **Step 2: Write** `build.js` and the allowlist; run it. Expected: it runs and prints the report.
- [ ] **Step 3: Curate in rounds.** Read the top unmatched lines; add products/synonyms, `es-ar` words or `ignore` entries; re-run `npm test` (dictionary validity) and the build. Stop when **all** hold: ≥ 2,000 recipes kept; every unmatched line with count ≥ 10 is resolved; ≥ 30 of the ~70 markdown recipes kept; unresolved mojibake in kept titles = 0. Record the final numbers in the commit message.
- [ ] **Step 4: Spot-check** 20 random kept recipes (print title + `code/isMain` list): each title reads in Argentine Spanish and each ingredient maps to a sensible product. Fix the dictionary for any miss and re-run.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit**: `feat: recipe build script and curated dictionary (<kept> recipes, <products> products)`.

### Task 6: Load into Supabase

**Files:**
- Create: `scripts/recipes/load.js`
- Modify: `.env.example` (comment: `SUPABASE_SERVICE_KEY` goes only in `.env.local`, never committed), `README.md` (recetario section: how to rebuild and reload)

**Interfaces:**
- `node --env-file=.env.local scripts/recipes/load.js` reads `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, uses `createClient(url, key, { db: { schema: 'heladera' }, auth: { persistSession: false } })`.
  1. Upsert products on `code` (batches of 500); read back `code → id`.
  2. Upsert recipes on `source_key` (batches of 500); read back `source_key → id`.
  3. For the loaded recipe ids: delete their `recipe_ingredients`, insert the new ones (batches of 1,000).
  4. Base recipes in the DB whose `source_key` is no longer in `out/recipes.json` are deleted (their ingredients cascade).
  5. Prints the three counts.

Every step here touches production: ask the user before each.

- [ ] **Step 1: User runs in SQL Editor** `select pg_size_pretty(pg_database_size(current_database()));` and reports it. Expected: well under 500 MB (the build output is ~10 MB).
- [ ] **Step 2: User runs** `supabase/migrations/2026-10-22-recetario.sql`. Expected: "Success. No rows returned".
- [ ] **Step 3: User creates** `heladera/.env.local` with `VITE_SUPABASE_URL=…` and `SUPABASE_SERVICE_KEY=…` (Project Settings → API Keys → secret / service_role). Claude checks `git check-ignore .env.local` before running anything.
- [ ] **Step 4: Run** the loader. Expected: counts equal `out/` sizes. Run it a second time. Expected: same counts (idempotent).
- [ ] **Step 5: Verify.** Claude runs a `curl` with the publishable key on `heladera.recipes`: expected `401` (anon). The user runs in SQL Editor `select count(*) from heladera.recipes;` (equals the kept count) and the size query again (grew by less than 50 MB). Reading as the household login is checked by the 2b screens.
- [ ] **Step 6: Commit** the loader and README; push after the user's ok.

**Done when (stage 2a):** the live DB has the dictionary and ≥ 2,000 normalized recipes, readable by the household login, and the build can be re-run from the committed scripts.

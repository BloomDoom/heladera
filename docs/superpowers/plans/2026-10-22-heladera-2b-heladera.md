# Heladera — Stage 2b (Heladera: inventory and manual loading) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Heladera tab shows what the household has, how long each thing has been there and what is about to go off, and lets the household load what it bought (grid, shop groups, search, new products) and mark things "se acabó".

**Architecture:** Two new tables in `heladera`: `fridge_items` (one row per product present, no quantities) and `purchases` (one row per product per load, the history that "lo que comprás seguido" and stage 3's "lo habitual" read). Loading goes through one SQL function, `add_to_fridge`, so the item upsert and the purchase rows are saved together. Households can insert their own private products. Everything the screens decide (dates, freshness, search, frequent products, shop groups) lives in pure functions in `src/lib/` with `node:test` tests. The screens only call them and Supabase.

**Tech Stack:** React 19 + Vite (plain JS), supabase-js, PGlite for SQL tests, `node:test`. No new dependencies.

**Spec:** `heladera/docs/superpowers/specs/2026-10-21-heladera-design.md` (§8 Heladera, §9 "Sin ticket", §6 "Productos nuevos" and "Básicos asumidos", §5 households).

**Stage 2 split.** The spec's stage 2 ships in sub-stages, each usable alone: 2a recetario (done), **2b Heladera (this plan)**, 2c "¿Qué comemos hoy?" (suggestions, "Lo cocinamos", history, rejections, assumed list per household), 2d favorites and own recipes.

## Global Constraints

- Code in English, UI text in Rioplatense Spanish, dates shown as DD/MM/YYYY. No new dependencies.
- Inventory is present or absent only: no quantities (§2).
- Every `heladera` table has RLS: a household only sees and writes its own rows (§5).
- Nothing in `public` changes. Update `supabase/schema.sql`, add `supabase/migrations/2026-10-23-inventario.sql` with the same DDL, update the README (§4 rules).
- "Today" is the date in Argentina (`America/Argentina/Buenos_Aires`), computed on the phone and sent to the database. Never use the database's `current_date`: Supabase runs in UTC, so after 21:00 it is already tomorrow there.
- Estimated expiry = `added_on + shelf_days`, unless the household set `expires_on` by hand (§8). No package dates.
- New household products are private to the household (§6), with defaults by category.
- Undo instead of "¿Estás seguro?" dialogs (zona-fit pattern).
- Out of scope: the shopping list (stage 3: "se acabó" only removes the item for now), ticket labels and variants (stage 4), editing or deleting household products, a separate Alacena (§11).

## Review Focus

1. Loading at night: at 22:30 in Argentina the items must enter with today's date, not tomorrow's. Test: `todayISO uses Argentina's date, not UTC` (Task 2) and `add_to_fridge stores the date it is given` (Task 1).
2. Loading something that is already in the fridge (new milk) renews it: date becomes today, a hand-set expiry is cleared, and no duplicate row appears. Test: `adding a present product renews it` (Task 1).
3. Search the way people type: no accents, lower case, synonyms ("limon" finds Limón, "nalga" finds Carne de vaca). Test: `searchProducts ignores accents and case and matches synonyms` (Task 3).
4. Creating a product that already exists ("leche", "Leche ") must point to the existing one instead of making a duplicate. Test: `findByName matches ignoring accents, case and spaces` (Task 3).
5. A household must not see or use another household's private products or items, including by guessing ids. Test: `fridge items only accept products the household can see` (Task 1).

---

## File Structure

```
supabase/schema.sql                              modify: fridge_items, purchases, add_to_fridge, product insert
supabase/migrations/2026-10-23-inventario.sql    create: same changes for the live DB
supabase/tests/fixtures/heladera-schema-stage2a.sql  create: byte copy of today's schema.sql
supabase/tests/inventario-schema.test.js         create
supabase/tests/recetario-schema.test.js          modify: its migration test compares against the stage2a fixture
src/lib/format.js         todayISO, formatDate, addDays, daysBetween, plural (copied from zona-fit + daysBetween)
src/lib/freshness.js      freshness(item, today), freshnessText(f)
src/lib/products.js       CATEGORIES, SHOPS, DEFAULT_FREQUENT, normalizeText, searchProducts, findByName, frequentProducts, groupByShop
src/lib/fridge.js         Supabase calls for the two screens
src/lib/tests/format.test.js, freshness.test.js, products.test.js
src/components/Toast.jsx       copied from zona-fit
src/components/BackButton.jsx  copied from zona-fit
src/components/FridgeItem.jsx  one row of the list, expands to "Se acabó" and the expiry date
src/components/NewProductForm.jsx
src/screens/Fridge.jsx         the list
src/screens/AddToFridge.jsx    grid, shop groups, search, "Agregar N"
src/App.jsx, src/main.jsx, src/index.css   routes, ToastProvider, styles
README.md
```

Shapes used across tasks:

- `Product = { id: number, code: string|null, household_id: number|null, name: string, category: string, storage: 'fridge'|'pantry', shelf_days: number|null, synonyms: string[] }`
- `Item = { product_id: number, added_on: 'YYYY-MM-DD', expires_on: 'YYYY-MM-DD'|null, product: Product }`
- `Purchase = { product_id: number, bought_on: 'YYYY-MM-DD' }`

---

### Task 1: Inventory tables

**Files:**
- Create: `supabase/tests/fixtures/heladera-schema-stage2a.sql`, `supabase/migrations/2026-10-23-inventario.sql`, `supabase/tests/inventario-schema.test.js`
- Modify: `supabase/schema.sql`, `supabase/tests/recetario-schema.test.js` (`migration matches schema.sql`: `full` becomes `newDb(ZONA_FIT + '/schema.sql', 'supabase/tests/fixtures/heladera-schema-stage2a.sql')`)

**Interfaces:**
- Produces:
  - `heladera.fridge_items (household_id bigint not null references households, product_id bigint not null references products, added_on date not null, expires_on date, primary key (household_id, product_id))`. Policy `for all to authenticated`: `using (household_id = (select heladera.my_household_id()))`, `with check` the same **and** `exists (select 1 from heladera.products p where p.id = product_id)` (runs under products' RLS, so only visible products). Grant `select, insert, update, delete` to `authenticated`.
  - `heladera.purchases (id bigint generated always as identity primary key, household_id bigint not null references households, product_id bigint not null references products, bought_on date not null)` plus an index on `(household_id, bought_on)`. Policies: select and insert where `household_id = (select heladera.my_household_id())`. Grant `select, insert` to `authenticated`.
  - `heladera.add_to_fridge(product_ids bigint[], today date) returns void`, `language sql`, `security invoker`, `set search_path = ''`. For each **distinct** id: upsert into `fridge_items` (household = `heladera.my_household_id()`, `added_on = today`; on conflict set `added_on = excluded.added_on, expires_on = null`), and insert one `purchases` row with `bought_on = today`. Execute revoked from `public, anon`, granted to `authenticated`.
  - Products: policy `for insert to authenticated with check (household_id = (select heladera.my_household_id()))`; `grant insert (household_id, name, category, storage, shelf_days) on heladera.products to authenticated` (no `code`, no `assumed`, no `synonyms`: the base dictionary stays read-only).
  - The migration is wrapped in `begin; … commit;` with the same header style as `2026-10-22-recetario.sql`.

- [ ] **Step 1: Copy** today's `supabase/schema.sql` byte for byte to `supabase/tests/fixtures/heladera-schema-stage2a.sql`.
- [ ] **Step 2: Write failing tests** in `inventario-schema.test.js`. Setup like `recetario-schema.test.js`: households Casa (user a1, a2) and Otra (b1), user solo without a household, base products `leche` (shelf 7) and `huevo`, a product private to Otra.
  - `add_to_fridge stores the date it is given`: a1 calls `select heladera.add_to_fridge(array[<leche>], '2026-10-22')`; a1 reads `fridge_items` → one row, `added_on = 2026-10-22`, `expires_on = null`; `purchases` has one row with `bought_on = 2026-10-22`.
  - `members of a household share the fridge`: a1 adds leche; a2 sees it; b1 sees no rows.
  - `adding a present product renews it`: add leche on `2026-10-20`, a1 updates `expires_on = '2026-10-21'`, add leche again on `2026-10-22` → still one item, `added_on = 2026-10-22`, `expires_on = null`; `purchases` has 2 rows.
  - `repeated ids in one call count once`: `add_to_fridge(array[<leche>, <leche>], …)` → 1 item, 1 purchase.
  - `fridge items only accept products the household can see`: a1 calls `add_to_fridge` with Otra's private product id → rejects `/row-level security/`; same for a direct insert into `fridge_items`.
  - `users without household cannot add`: solo calls `add_to_fridge` → rejects (`household_id` is null: `/null value/`).
  - `se acabó deletes only our item`: a1 and b1 both add leche; a1 deletes `where product_id = <leche>` → b1 still has it.
  - `households create private products`: a1 inserts `(household_id, name, category, storage, shelf_days) = (Casa, 'Mburucuyá', 'fruta', 'fridge', 5)` → a2 sees it, b1 does not.
  - `households cannot create products for another household or base products`: a1 inserting with `household_id = Otra` → `/row-level security/`; with `code` → `/permission denied/`; with `assumed` → `/permission denied/`.
  - `anon reads nothing`: anon `select * from heladera.fridge_items` → `/permission denied/`.
  - `migration matches schema.sql`: `stage2a fixture + 2026-10-23-inventario.sql` and `schema.sql` give the same `information_schema.columns` and `pg_policies` rows for schema `heladera` (copy the `shape` helper from `recetario-schema.test.js`).
- [ ] **Step 3: Run** `npm run test:db`. Expected: FAIL (`relation "heladera.fridge_items" does not exist`).
- [ ] **Step 4: Write** the `schema.sql` section and the migration (identical DDL). Update the recetario migration test to the stage2a fixture.
- [ ] **Step 5: Run** `npm test`. Expected: PASS, all (the existing `households cannot write the dictionary` still passes: inserting `code` is a column permission error).
- [ ] **Step 6: Commit**: `feat: fridge items, purchases and household products`.

### Task 2: Dates and freshness

**Files:**
- Create: `src/lib/format.js`, `src/lib/freshness.js`, `src/lib/tests/format.test.js`, `src/lib/tests/freshness.test.js`

**Interfaces:**
- Produces:
  - `format.js`: `todayISO(now = new Date()) → 'YYYY-MM-DD'` (zona-fit's, with the `now` parameter added for tests), `formatDate(iso) → 'DD/MM/YYYY'`, `addDays(iso, n) → iso`, `daysBetween(fromIso, toIso) → number` (whole days, `to - from`, safe across daylight-saving changes: compute with `Date.UTC`), `plural(n, one, many)`. Copy the first three and `plural` from `../zona-fit/src/lib/format.js` with its header comment; only these five.
  - `freshness(item, today) → { expiresOn: iso|null, daysIn: number, daysLeft: number|null, status: 'ok'|'soon'|'over', manual: boolean }`. `expiresOn = item.expires_on ?? (shelf_days ? addDays(added_on, shelf_days) : null)`. `status`: `'over'` if `daysLeft < 0`, `'soon'` if `daysLeft <= 2`, else `'ok'` (also `'ok'` when there's no `expiresOn`).
  - `freshnessText(f) → { since: string, warning: string|null }`. `since`: `'Entró hoy'`, `'Entró ayer'`, `'Hace N días'`. `warning` only when status isn't `'ok'`: `'Vence hoy'`, `'Vence mañana'`, `'Vence en 2 días'`, `'Venció ayer'`, `'Venció hace N días'`. Same words when `manual`: the expanded row shows the date itself.
  - `compareItems(a, b, today)`: sort order for the list: `daysLeft` ascending (null last), then `product.name` with `localeCompare('es')`.

- [ ] **Step 1: Write failing tests:**
  - `todayISO uses Argentina's date, not UTC`: `todayISO(new Date('2026-10-23T01:30:00Z'))` → `'2026-10-22'` (22:30 in Buenos Aires).
  - `daysBetween counts whole days`: `('2026-10-20', '2026-10-22')` → 2; `('2026-12-31', '2027-01-01')` → 1; `('2026-10-22', '2026-10-20')` → -2.
  - `freshness estimates from shelf days`: leche (7) added `2026-10-20`, today `2026-10-22` → `{ expiresOn: '2026-10-27', daysIn: 2, daysLeft: 5, status: 'ok', manual: false }`.
  - `freshness prefers the hand-set date`: same with `expires_on: '2026-10-23'` → `daysLeft: 1, status: 'soon', manual: true`.
  - `freshness is over after the estimate`: lechuga (5) added `2026-10-16`, today `2026-10-22` → `daysLeft: -1, status: 'over'`.
  - `freshness without shelf days never warns`: `shelf_days: null` → `expiresOn: null, daysLeft: null, status: 'ok'`.
  - `freshnessText`: `daysIn` 0/1/6 → `'Entró hoy'`, `'Entró ayer'`, `'Hace 6 días'`; `daysLeft` 0/1/2/-1/-3 → `'Vence hoy'`, `'Vence mañana'`, `'Vence en 2 días'`, `'Venció ayer'`, `'Venció hace 3 días'`; `daysLeft` 5 → `warning: null`.
  - `compareItems puts the most urgent first`: three items with `daysLeft` 3, -1, null → order -1, 3, null.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: dates and freshness for fridge items`.

### Task 3: Products: categories, search, frequent, shops

**Files:**
- Create: `src/lib/products.js`, `src/lib/tests/products.test.js`

**Interfaces:**
- Produces:
  - `CATEGORIES`: the 13 categories of `scripts/recipes/dictionary/products.json`, in this order, with label and defaults for new products:

    | key | label | storage | shelf_days |
    |---|---|---|---|
    | verdura | Verdura | fridge | 7 |
    | fruta | Fruta | fridge | 7 |
    | carne | Carne | fridge | 3 |
    | pollo | Pollo | fridge | 2 |
    | pescado | Pescado | fridge | 2 |
    | fiambre | Fiambre | fridge | 7 |
    | lacteo | Lácteo | fridge | 10 |
    | huevo | Huevos | fridge | 21 |
    | panificado | Panadería | pantry | 4 |
    | congelado | Congelado | fridge | 90 |
    | almacen | Almacén | pantry | 180 |
    | condimento | Condimento | pantry | 365 |
    | bebida | Bebida | pantry | 180 |

    Shape: `[{ key, label, storage, shelf_days }]`.
  - `SHOPS = [{ key: 'verduleria', label: 'Verdulería', categories: ['verdura', 'fruta'] }, { key: 'carniceria', label: 'Carnicería', categories: ['carne', 'pollo', 'pescado', 'fiambre'] }, { key: 'super', label: 'Súper', categories: <every other category> }]`.
  - `DEFAULT_FREQUENT = ['huevo', 'leche', 'tomate', 'cebolla', 'papa', 'lechuga', 'pollo', 'carne-de-vaca', 'queso', 'pan', 'zanahoria', 'manzana', 'banana', 'yogur', 'fideos', 'arroz']` (codes in the dictionary).
  - `normalizeText(s) → string`: lower case, accents removed (NFD + strip `\p{Diacritic}`), spaces collapsed and trimmed.
  - `searchProducts(products, query) → Product[]`: empty/blank query → `[]`. A product matches when its name or a synonym, normalized, contains every word of the query as the start of one of its words. Order: name starts with the query, then other name matches, then synonym-only matches; ties by name (`localeCompare('es')`). Products with `code === 'agua'` never appear.
  - `findByName(products, name) → Product|null`: the product whose normalized name or synonym equals `normalizeText(name)`.
  - `frequentProducts(products, purchases, limit = 16) → Product[]`: products ordered by purchase count (desc, ties by most recent `bought_on`), then filled up to `limit` with `DEFAULT_FREQUENT` in that order, no repeats.
  - `groupByShop(products) → [{ shop, products }]`: one entry per `SHOPS` item in order, products sorted by name, empty shops left out; `agua` left out.

- [ ] **Step 1: Write failing tests** (a handful of inline products, not the JSON file):
  - `searchProducts ignores accents and case and matches synonyms`: `'limon'` → Limón; `'LIMÓN'` → Limón; `'nalga'` → Carne de vaca (synonym `nalga`); `'  '` → `[]`.
  - `searchProducts matches word starts, name matches first`: products Queso, Queso crema, Crema, Ajo → `'que'` → `[Queso, Queso crema]`; `'crema'` → `[Crema, Queso crema]` (name start first, then word start inside the name); `'jo'` → `[]` (not a word start).
  - `searchProducts never shows agua`.
  - `findByName matches ignoring accents, case and spaces`: `' leche '` → Leche; `'Limon'` → Limón; `'carne picada'` → Carne de vaca via synonym; `'mburucuya'` → null.
  - `frequentProducts ranks by purchases and fills with defaults`: products include tomate, queso, huevo, leche, arroz; purchases of tomate ×3 and queso ×1 with limit 4 → `[tomate, queso, huevo, leche]`.
  - `groupByShop splits by shop and skips empty shops`: lechuga, pollo, arroz, agua → Verdulería `[lechuga]`, Carnicería `[pollo]`, Súper `[arroz]`.
  - `every dictionary category has a CATEGORIES entry`: read `scripts/recipes/dictionary/products.json` with `readFileSync` and check every `category` is a `CATEGORIES` key and every `DEFAULT_FREQUENT` code exists.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `products.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: product search, frequent products and shop groups`.

### Task 4: Heladera screen

**Files:**
- Create: `src/lib/fridge.js`, `src/components/Toast.jsx`, `src/components/FridgeItem.jsx`
- Modify: `src/screens/Fridge.jsx`, `src/main.jsx` (wrap the app in `ToastProvider`), `src/App.jsx` (pass `household={household.data}` to `Fridge`), `src/index.css`

**Interfaces:**
- Consumes: `freshness`, `freshnessText`, `compareItems`, `todayISO`, `formatDate` (Task 2); tables from Task 1.
- Produces (`src/lib/fridge.js`, every function returns what `unwrap` returns and throws on error, like `household.js`):
  - `loadFridge() → Item[]`: `from('fridge_items').select('product_id, added_on, expires_on, product:products(id, code, household_id, name, category, storage, shelf_days, synonyms)')`.
  - `finishItem(productId)`: delete our row for that product (RLS limits it to the household).
  - `restoreItem(householdId, item)`: upsert `{ household_id, product_id, added_on, expires_on }` back (for Undo; no purchase row).
  - `setExpiry(productId, iso|null)`: update `expires_on`.
  - `Toast.jsx`: copied from `../zona-fit/src/components/Toast.jsx` with its CSS (`.toast`), unchanged.

Screen behavior:
- Title "Heladera", a primary button "Agregar" that goes to `/fridge/add`, then the list sorted with `compareItems`. Empty: "La heladera está vacía. Tocá Agregar para cargar lo que compraste."
- A row shows the product name, `since` in muted text, and `warning` as a chip (`soon`: amber text, `over`: `--danger`). Add one token `--warn` (amber with ≥ 4.5:1 on `--surface`) to `:root`.
- Tapping a row expands it (one at a time): button "Se acabó", and "Vence el" with a native `<input type="date">` showing the estimate or the manual date; when manual, a link "Usar la estimada" sets it back to `null`. The estimated date is shown as text in DD/MM/YYYY next to the input when not manual.
- "Se acabó": remove from the list at once, call `finishItem`, toast `"<Nombre>: se acabó"` with Undo → `restoreItem`. On save error, put the row back and toast `saveErrorMessage(error)`.
- Load and error states use `useLoad` + `LoadState`, like `App.jsx`.

- [ ] **Step 1: Implement** `fridge.js`, `Toast.jsx`, `FridgeItem.jsx`, `Fridge.jsx`, the CSS and the `main.jsx`/`App.jsx` changes.
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS, build without errors.
- [ ] **Step 3: Check in the app** (`npm run dev`, phone-sized window). The new tables are not in production until Task 6, so here the screen shows the load error with "Probar de nuevo" and the tab bar still works. The full check is Task 6 Step 3.
- [ ] **Step 4: Commit**: `feat: fridge list with freshness, se acabó and expiry`.

### Task 5: Cargar lo comprado

**Files:**
- Create: `src/screens/AddToFridge.jsx`, `src/components/NewProductForm.jsx`, `src/components/BackButton.jsx`
- Modify: `src/lib/fridge.js`, `src/App.jsx` (route `/fridge/add` with `household`), `src/index.css`

**Interfaces:**
- Consumes: `searchProducts`, `findByName`, `frequentProducts`, `groupByShop`, `CATEGORIES` (Task 3); `todayISO`, `addDays` (Task 2); `useToast` (Task 4).
- Produces (`src/lib/fridge.js`):
  - `loadAddData(today) → { products: Product[], purchases: Purchase[], presentIds: Set<number> }`: products (`id, code, household_id, name, category, storage, shelf_days, synonyms`), purchases with `bought_on >= addDays(today, -90)`, and the `product_id`s in `fridge_items`, in parallel.
  - `addToFridge(productIds, today)`: `rpc('add_to_fridge', { product_ids, today })`.
  - `createProduct(householdId, { name, category, storage, shelf_days }) → Product`: insert and `select().single()`.
  - `BackButton.jsx`: copied from `../zona-fit/src/components/BackButton.jsx` with its CSS (`.back-link`), fallback `/fridge`.

Screen behavior (spec §9 "Sin ticket"):
- "‹ Volver", title "Cargar lo comprado", a search field at the top.
- Search empty: section "Lo que comprás seguido" (`frequentProducts`) as a grid of tiles, then one section per `groupByShop` entry, also tiles. Search filled: only the `searchProducts` results as tiles, and under them a button `Crear "<texto>"` that opens `NewProductForm` with the name filled in.
- Tapping a tile toggles it selected (clear selected style and `aria-pressed`). A product already in the fridge shows a small "ya está" (selecting it renews it).
- A sticky bottom bar above the tab bar: primary button "Agregar N" (`plural`: "Agregar 1 producto" / "Agregar 3 productos"), disabled with 0. On tap: `addToFridge(ids, todayISO())`, toast "Listo, ya están en la heladera", navigate to `/fridge`. On error: keep the selection and toast `saveErrorMessage(error)`.
- `NewProductForm`: name (required, trimmed), category select (labels from `CATEGORIES`), "Dura más o menos" number of days (prefilled from the category, changes when the category changes until the user edits it, 1–3650), and "Se guarda en" Heladera/Alacena (prefilled from the category). Before saving, `findByName(products, name)`: if it exists, show "Ya existe: <Nombre>" with a button that selects that product instead. On save: `createProduct`, add it to the loaded products, select it, close the form.

- [ ] **Step 1: Implement** the files above.
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS, build without errors.
- [ ] **Step 3: Commit**: `feat: load what you bought into the fridge`.

### Task 6: Production and the real check

Every step here touches production: ask the user before each.

- [ ] **Step 1: README**: in the database setup section, add `supabase/migrations/2026-10-23-inventario.sql` after the recetario one; in the structure section, the new `src/lib` files and screens. Commit: `docs: README for the heladera screens`.
- [ ] **Step 2: User runs** `supabase/migrations/2026-10-23-inventario.sql` in the SQL Editor. Expected: "Success. No rows returned".
- [ ] **Step 3: Check in the app** (`npm run dev` against production, logged in as a household member): load 5 products including one from search without accents and one new product; see them in Heladera with "Entró hoy"; set one expiry to yesterday and see "Venció ayer" first; "Se acabó" and Undo; load a product already there and see it renewed. Expected: all as described, no console errors.
- [ ] **Step 4: User checks** on both phones after the deploy: the second member sees what the first one loaded.
- [ ] **Step 5: Push** after the user's ok (GitHub Pages deploys from `main`).

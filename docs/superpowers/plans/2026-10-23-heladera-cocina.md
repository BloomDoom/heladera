# Heladera — Cocina (Heladera, Freezer, Alacena) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The kitchen is split into Heladera, Freezer and Alacena. Each item lives in one of them. Loading puts each product in its usual place, which can be changed. Items can be moved later, and each place shows expiry its own way.

**Architecture:**
- **Data:** `products.storage` (the usual place) gains `freezer`. `fridge_items` gains `place`. Both use the same vocabulary: `fridge` | `freezer` | `pantry`.
- **Loading:** `add_to_fridge` gains an optional `places jsonb`. Products it does not name go to their usual place, so every existing caller keeps working.
- **Display:** freshness and sorting depend on the place. Hoy adds a line naming the freezer items a dish uses.
- **Screens:** the Fridge screen becomes "Cocina", with tabs. The load screen shows a place label per chosen product.

**Tech Stack:** React 19 + Vite (plain JS), supabase-js, PGlite for SQL tests, `node:test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-23-heladera-cocina-design.md` (§3 user decisions, §4 behavior, §4b builder's calls). Mock-up: artifact "Cocina virtual", artboard A.

## Global Constraints

- **Code and copy:** code in English. UI in Rioplatense Spanish. Dates shown as DD/MM/YYYY, except the freezer's `Hasta el DD/MM`.
- **No new dependencies.**
- **Data rules:** RLS per household; nothing in `public` changes.
- **Files:**
  - Update `supabase/schema.sql`.
  - Add `supabase/migrations/2026-10-27-cocina.sql` with the same DDL.
  - Update the README.
- **Place vocabulary:**
  - In the DB and code: `fridge`, `freezer`, `pantry`.
  - In the UI: **Heladera**, **Freezer**, **Alacena**.
- **Usual place:**
  - Categories `carne`, `pollo`, `pescado` and `congelado` → `freezer`.
  - Today's `pantry` categories stay `pantry`.
  - The rest → `fridge`.
- **Freezer expiry:** `added_on + 90 days`, unless set by hand. Heladera and Alacena use the product's `shelf_days`. "Soon" stays at ≤2 days.
- **Moving:**
  - Sets `place`, sets `added_on = today` and clears `expires_on`.
  - Records no purchase.
  - Undo restores the old `place`, `added_on` and `expires_on`.
- **Only Undo:** no confirmation dialogs.
- **Touch targets** must be ≥48px.
- **Production SQL** goes to the user in short blocks, each ending in `commit;`, with a check query.
  - Keep each `$$ … $$` body whole.
  - Keep `drop function add_to_fridge` together with its `create` in one block.
- **Out of scope:** thawing, the freezer notification, quantities, one product in two places.

## Review Focus

1. **Old callers of `add_to_fridge`.** The app version still deployed during the release window, and `store_checked`, call `add_to_fridge(product_ids, today)` without places. They must keep working and put each product in its usual place. Test: `add_to_fridge without places uses the usual place` (Task 1).
2. **Loading a product that is already in another place.** It renews the item and moves it to the chosen place. Test: `renewing moves to the chosen place` (Task 1).
3. **Production backfill.**
   - Meat in the fridge today, with a date set by hand, moves to the freezer and loses that date.
   - A yogurt keeps its place and its dates.
   - Test: `backfill puts items in their usual place` (Task 1).
4. **Bread in the Alacena** (panificado, 4 days) still warns "Vence mañana". A rice packet shows nothing. Test: `pantry rows only warn` (Task 2).
5. **Undo of a move** puts back the place and both dates exactly. Covered by Task 3's `moveItem`/`restoreItem` pair; the reviewer checks the round trip.

---

## File Structure

```
supabase/schema.sql, supabase/migrations/2026-10-27-cocina.sql
supabase/tests/fixtures/heladera-schema-stage3.sql   byte copy of today's schema.sql
supabase/tests/cocina-schema.test.js                  create
supabase/tests/compras-schema.test.js                 modify: migration test compares against the stage3 fixture
scripts/recipes/dictionary/products.json               storage → freezer for carne/pollo/pescado/congelado
scripts/recipes/tests/normalize.test.js                storage may be freezer
src/lib/products.js        CATEGORIES storage; PLACES
src/lib/freshness.js       place-aware freshness, text and order
src/lib/suggest.js         freezer reason
src/lib/fridge.js          place in selects, moveItem, restoreItem, addToFridge(places)
src/screens/Fridge.jsx     Cocina with tabs
src/components/FridgeItem.jsx   place-aware row, move buttons
src/components/TabBar.jsx  label "Cocina"
src/screens/AddToFridge.jsx     place label per chosen product
src/components/NewProductForm.jsx  Freezer option
src/screens/Shopping.jsx   "Guardar N en la cocina"
```

---

### Task 1: Places in the database

**Files:**
- Create: the fixture, the migration and `cocina-schema.test.js`.
- Modify:
  - `supabase/schema.sql`.
  - `compras-schema.test.js`: point it at the stage3 fixture.
  - `scripts/recipes/dictionary/products.json`: the 10 products in those categories get `"storage":"freezer"`.
  - `normalize.test.js`: `['fridge', 'freezer', 'pantry']`.

**Interfaces (produces):**
- **`products.storage` check:** drop `products_storage_check` and add the check `storage in ('fridge','freezer','pantry')`. If the constraint has another name, read it from `pg_constraint` in the test DB.
- **Backfill of usual places:** `update heladera.products set storage = 'freezer' where category in ('carne','pollo','pescado','congelado')`. This covers base and own products.
- **New column `heladera.fridge_items.place text`:**
  - Backfill it from the product's (updated) `storage`.
  - Rows that the backfill puts in `freezer` get `expires_on = null`.
  - Then `set not null` and add the check `place in ('fridge','freezer','pantry')`.
  - The existing grants already cover `update`.
- **`add_to_fridge`:** drop `heladera.add_to_fridge(bigint[], date)` and create `heladera.add_to_fridge(product_ids bigint[], today date, places jsonb default '{}')`.
  - `places` maps a product id (as text) to a place.
  - Every product the map leaves out uses its `storage`.
  - On conflict, it updates `added_on`, `expires_on = null` and `place = excluded.place`.
  - It still deletes those products from `shopping_items` and still records the purchases.
  - It is `security invoker set search_path = ''`. Re-apply the revoke and grant.
  - `store_checked` calls it with 2 arguments, which works through the default.
- Migration header like `2026-10-26-compras.sql`, wrapped in `begin; … commit;`.

- [ ] **Step 1: Copy** `supabase/schema.sql` byte for byte to `supabase/tests/fixtures/heladera-schema-stage3.sql`. Repoint the compras migration test to it.
- [ ] **Step 2: Write failing tests** in `cocina-schema.test.js`, set up like `compras-schema.test.js`. Products: leche (lacteo, fridge), arroz (almacen, pantry), pollo (pollo, fridge before the migration).
  - `add_to_fridge without places uses the usual place`: a1 calls `add_to_fridge('{<leche>,<arroz>,<pollo>}', '2026-10-27')`. The places are `fridge`, `pantry` and `freezer`.
  - `places override the usual place`: called with places `{"<leche>":"freezer"}`, leche is in `freezer`.
  - `renewing moves to the chosen place`: pollo is in `freezer` with a hand-set `expires_on`. Calling `add_to_fridge('{<pollo>}', d, '{"<pollo>":"fridge"}')` leaves the place `fridge` and `expires_on` null.
  - `place must be valid`: an update to `place = 'garage'` fails with `/check constraint/`.
  - `store_checked uses the usual place`: a checked pollo on the list ends up in `freezer`.
  - `backfill puts items in their usual place`:
    - Apply the stage3 fixture.
    - Insert a fridge pollo with `expires_on` set, a leche with `expires_on` set, and an arroz.
    - Then run the migration. After it: pollo is `freezer` with `expires_on` null, leche is `fridge` with `expires_on` kept, and arroz is `pantry`.
  - `the dictionary's usual places`: after the migration, base products in carne, pollo, pescado and congelado have `storage = 'freezer'`.
  - `migration matches schema.sql`: the stage3 fixture plus `2026-10-27-cocina.sql`, compared against `schema.sql` with the `shape` helper.
- [ ] **Step 3: Run** `npm run test:db`. Expected: FAIL.
- [ ] **Step 4: Implement** the change in schema.sql and in the migration, with identical DDL. Update `products.json` and `normalize.test.js`.
- [ ] **Step 5: Run** `npm test`. Expected: PASS, all.
- [ ] **Step 6: Commit**: `feat: kitchen places in the database`.

### Task 2: Place-aware logic

**Files:**
- Modify:
  - `src/lib/products.js`: `CATEGORIES` storage becomes `freezer` for carne, pollo, pescado and congelado.
  - `src/lib/freshness.js`.
  - `src/lib/suggest.js`.
- Tests: `src/lib/tests/freshness.test.js`, `src/lib/tests/suggest.test.js`.

**Interfaces (produces):**
- **`PLACES`** (in `products.js`): `[{ key: 'fridge', label: 'Heladera' }, { key: 'freezer', label: 'Freezer' }, { key: 'pantry', label: 'Alacena' }]`.
- **`FREEZER_DAYS = 90`** (in `freshness.js`).
- **`freshness(item, today)`:** when `item.place === 'freezer'`, the shelf life is `FREEZER_DAYS`. Otherwise it is `item.product.shelf_days`. Its return shape does not change.
- **`freshnessText(f, place = 'fridge')`** returns `{ since, warning }`:
  - `fridge`: as today.
  - `freezer`: `since` is `` `Hasta el ${DD}/${MM}` `` (from `f.expiresOn`; null when there is no date). `warning` is as today.
  - `pantry`: `since` is `null`. `warning` is as today.
- **`compareItems(a, b, today)`** stays as it is. It is used for fridge and freezer.
- **`comparePantry(a, b, today)`** sorts items whose status is not `ok` first, by days left. The rest follow by name, using `es`.
- **`freezerText(names: string[]) → string|null`:**
  - `[]` gives `null`.
  - `['Pollo']` gives `'Pollo está en el freezer'`.
  - `['Pollo','Carne picada']` gives `'Pollo y carne picada están en el freezer'`.
  - `['Pollo','Carne picada','Merluza']` gives `'Pollo, carne picada y merluza están en el freezer'`.
  - Every name after the first starts in lowercase.
- **`rankSuggestions`:** when the used items (`used_product_ids` ∩ items) include any with `place === 'freezer'`, add `freezerText(their names, in recipe order of used ids)` as the **last** reason. It adds no score.

- [ ] **Step 1: Write failing tests.**
  - `freezer items last 90 days`: `added_on` 2026-10-01, place `freezer`, product `shelf_days` 3, gives `expiresOn` 2026-12-30.
  - `freezer text`: `since` reads `Hasta el 30/12`.
  - `pantry rows only warn`:
    - Pan (`shelf_days` 4) added 2026-10-20, read on 2026-10-23 at place `pantry`: `since` null, `warning` `Vence mañana`.
    - Arroz (`shelf_days` 180): `since` null, `warning` null.
  - `comparePantry`: pan, which is soon, comes first, then aceite before arroz.
  - `freezerText`: each of the four cases above.
  - `freezer reason on the card`: a candidate uses pollo (`freezer`) and tomate (`fridge`). Its last reason is `'Pollo está en el freezer'`, and the score is unchanged against the same dish with pollo in the fridge.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: place-aware freshness and freezer reason`.

### Task 3: The Cocina screen

**Files:**
- Modify:
  - `src/lib/fridge.js`.
  - `src/screens/Fridge.jsx`.
  - `src/components/FridgeItem.jsx`.
  - `src/components/TabBar.jsx` (the label `'Cocina'`; the route stays `/fridge`).
  - `src/index.css`.

**Interfaces:**
- **Consumes** from Task 2: `PLACES`, `freshness`, `freshnessText(f, place)`, `compareItems` and `comparePantry`.
- **Produces** (`fridge.js`):
  - `loadFridge` also selects `place`.
  - `restoreItem` upserts `place` too.
  - `moveItem(productId, place, today)` runs `update({ place, added_on: today, expires_on: null })`.

**Screen.** The title is "Cocina". Under it, a 3-button segmented control, as in the mock-up:
- Each button shows `` `${label} ${count}` ``, with `aria-pressed`, and is at least 48px tall.
- The selected tab is kept in a module-level variable, so it survives navigation while the app is open. It starts on `fridge`.
- The list shows only the items of the selected place:
  - Heladera and Freezer are sorted with `compareItems`.
  - Alacena is sorted with `comparePantry`.
- The row's muted text is `since` from `freshnessText(f, item.place)`, shown only when it is not null.
- "Cargar lo comprado" stays.
- Empty tab: `` `No hay nada en ${label.toLowerCase() === 'freezer' ? 'el freezer' : `la ${label.toLowerCase()}`}.` ``, that is "No hay nada en la heladera.", "No hay nada en el freezer." or "No hay nada en la alacena."

**Row actions** (`FridgeItem`, the open panel). It keeps today's actions and adds one button per other place:
- "Pasar a la heladera", "Pasar al freezer" and "Pasar a la alacena".
- A move:
  - Is optimistic: the row leaves the tab.
  - Shows the toast `` `${name}: ${'a la heladera'|'al freezer'|'a la alacena'}` `` with an Undo that calls `restoreItem` with the old item.
  - On error it rolls back and shows `saveErrorMessage`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS. Only the known chunk-size advisory may appear.
- [ ] **Step 3: Commit**: `feat: cocina screen with heladera, freezer and alacena`.

### Task 4: Choosing the place when loading

**Files:**
- Modify:
  - `src/lib/fridge.js`.
  - `src/screens/AddToFridge.jsx`.
  - `src/components/NewProductForm.jsx`.
  - `src/screens/Shopping.jsx`.
  - `src/index.css`.

**Interfaces:**
- `addToFridge(productIds, today, places = {})` calls RPC `add_to_fridge` with `{ product_ids, today, places }`. `places` maps an id to a place, and only contains choices that differ from the usual place.

**AddToFridge:**
- Above the "Agregar N" button, a list "Van a:" shows each selected product: its name, plus a place label button.
- The label shows its `PLACES` label and starts at the product's `storage`. Each tap moves to the next place in the cycle Heladera → Freezer → Alacena. Its `aria-label` is `` `${name}: ${label}. Cambiar lugar` ``, and it is at least 48px tall.
- Unselecting a product forgets its choice.
- The success toast stays as today.

**NewProductForm:** the storage select gains `<option value="freezer">Freezer</option>`. The default comes from `CATEGORIES`, which Task 2 changed.

**Shopping:**
- The button reads `` `Guardar ${n} en la cocina` ``.
- The toast reads `` `${n} ${plural(n,'producto','productos')} a la cocina` ``.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 3: Commit**: `feat: choose the place when loading`.

### Task 5: Production

- [ ] **Step 1: README.** List `2026-10-27-cocina.sql` after compras and describe the three places. This is folded into the final fix wave.
- [ ] **Step 2: Production migration** (ask first):
  - Run it in short blocks, each with a check query: `place` exists on `fridge_items`, the count of rows by place, and the count of base products with `storage='freezer'` (10).
  - Verify through the API that the RPC `add_to_fridge` answers `401`/`42501`.
  - Remind the user that the products loader now writes `freezer`, so a future reload keeps it.
- [ ] **Step 3: Merge and push** after the user's OK. Watch the deploy with `gh run watch`.
- [ ] **Step 4: Phone check by the user:**
  - The tabs work.
  - Meat that was already loaded now shows in the Freezer with `Hasta el …`.
  - The Alacena shows rice without dates.
  - Moving an item and Undo work.
  - Loading chicken puts it in the Freezer, and the label can change it.
  - A Hoy card shows "… está en el freezer".

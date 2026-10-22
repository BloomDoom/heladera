# Heladera — Stage 3 (Lista de compras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared, live shopping list that fills itself (what ran out, what is usually bought, the week's dishes), takes manual additions, and sends what is ticked off at the supermarket into the fridge.

**Architecture:**
- **Stored items.** A `shopping_items` table holds the list, one row per product, with a reason. It is in Supabase Realtime, so both phones stay in step.
- **What ran out.** "Se acabó" in the fridge goes through a new `finish_fridge_item` RPC, which also adds the product to the list.
- **What is usually bought.** These items are not stored. They are computed on the phone from the purchase history; dismissing one stores a snooze.
- **The week's dishes.** One RPC adds a recipe's missing ingredients to the list. A swipe deck picks the dishes.
- **Ticking off.** A ticked item moves to "En el carrito". "Guardar en la heladera" sends every ticked product through `add_to_fridge`, which now also clears those products from the list.

**Tech Stack:** React 19 + Vite (plain JS), supabase-js (Realtime included), PGlite for SQL tests, `node:test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-heladera-design.md`. This plan covers:
- §10 "Lista de compras": three sources plus manual items, shared and live, connection only, each item says why it is there.
- §9 "Tachar en el súper": what is ticked off enters the fridge.
- §11 stage 3.

## Global Constraints

- **Language and dates:** code in English, UI text in Rioplatense Spanish, dates shown as DD/MM/YYYY.
- **Dependencies:** no new ones.
- **Data per household:** every `heladera` table has RLS, so a household only sees and writes its own rows (§5). Nothing in `public` changes.
- **Files to update:** `supabase/schema.sql`, plus `supabase/migrations/2026-10-26-compras.sql` with the same DDL, and the README.
- **"Solo con conexión (decidido)"** (§10): no offline queue. The existing offline banner covers it.
- **Every item shows why it is there** (§10):
  - "Se acabó".
  - "Lo comprás cada semana" (the habit text, Task 2).
  - "Para <título del plato>".
  - Manual items show no reason.
- **Undo** instead of "¿Estás seguro?" dialogs (§7 style). Exception: "Guardar en la heladera" has no undo. It only adds, and anything added can be marked "se acabó" in the fridge.
- **Touch targets** are ≥48px. The list is used one-handed at the supermarket.
- **Production SQL** goes to the user in short blocks. Each block ends in `commit;` and is followed by a check query (memory: the phone copy cuts long blocks). Keep each `$$ … $$` body whole, and keep a `drop function` with its `create`.
- **Out of scope:** quantities (§11 "para más adelante"), offline use, receipts (stage 4), a planning calendar with days.

## Decisions taken here (the spec leaves them open)

1. **Ticking off goes to a cart first.** A tick moves the item to "En el carrito", struck through, and it can be unticked freely. The button "Guardar N en la heladera" then puts every ticked product in the fridge and records the purchases.
   - Why: putting each product in at the tick would make an accidental tick record a purchase and touch the fridge. Undoing that cleanly is hard.
   - The cost is one extra tap at the end.
   - The spec says "al tachar, entra a la heladera". This decision is for the user to confirm when they review the plan.
2. **"Lo habitual"** needs a product bought on at least 3 distinct days in the last 180. Its interval is the median gap between those days, in days. It is suggested when that many days have passed since the last purchase, and only while the product is not in the fridge, not already on the list and not snoozed.
3. **Dismissing a habitual item ("Quitar")** stores a snooze. The item stays hidden until another interval has passed.
4. **"Se acabó" always adds the product to the list,** with reason "Se acabó". Undo takes it off again. Remove it from the list if it isn't needed.
5. **Buying through "Cargar lo comprado"** (`add_to_fridge`) takes those products off the list, whether or not they were ticked.
6. **The week's dishes** come from a swipe deck of recipes missing 1 to 3 products. Swipe right picks a dish and adds what it is missing. The recipe screen also gets a button "Agregar lo que falta a la lista". The reason is "Para <título>". There are no weekdays.

## Review Focus

1. **Undo on "Se acabó" must restore the fridge and remove the list item.** It must not remove the item when the product was already on the list before. Test: `finishing adds to the list once` (Task 1) and the `finish → undo` handling in Task 3.
2. **Buying elsewhere clears the list.** Loading milk through "Cargar lo comprado" while milk is on the list takes it off. Test: `add_to_fridge clears the list` (Task 1).
3. **Gaps in the purchase history:**
   - A product bought only twice, or twice on the same day, never counts as habitual.
   - A snoozed product does not come back the next day.
   - Test: `habitual needs three distinct days`, `a snooze hides it for one interval` (Task 2).
4. **Another household's list:** another household never sees or writes our list, our snoozes or our week candidates. Test: `the list belongs to the household` (Task 1).
5. **A dish that needs nothing.** Picking one whose missing products are all on the list already, or all in the fridge, adds nothing and says so. Test: `add_recipe_to_list skips what is home or listed` (Task 1). Copy (Task 4/5): "Ya tienen todo para <título>".

---

## File Structure

```
supabase/schema.sql                                 modify
supabase/migrations/2026-10-26-compras.sql          create
supabase/tests/fixtures/heladera-schema-stage2d.sql create: byte copy of today's schema.sql
supabase/tests/supabase-stub.sql                    modify: create publication supabase_realtime;
supabase/tests/compras-schema.test.js               create
supabase/tests/propias-schema.test.js               modify: its migration test compares against the stage2d fixture
src/lib/shoppingList.js       pure: habits, reasons, list building, week ranking
src/lib/tests/shoppingList.test.js
src/lib/shopping.js           Supabase calls: list, snoozes, store, week, realtime
src/lib/fridge.js             modify: finishItem uses the RPC
src/screens/Fridge.jsx, src/screens/Recipe.jsx   modify: undo removes the list item; Recipe "Agregar lo que falta"
src/screens/Shopping.jsx      the list
src/screens/WeekDishes.jsx    /shopping/week swipe deck
src/components/SuggestionCard.jsx  modify: optional label for the right action
src/App.jsx, src/index.css, README.md
```

Shapes:
- `ListRow` (stored) is `{ product_id, reason: 'se_acabo'|'habitual'|'plato'|'a_mano', recipe_id, added_on, checked, product: { id, name, category }, recipe: { title } | null }`.
- `Habit` is `{ product_id, interval: number, last: 'YYYY-MM-DD' }`.
- `ListEntry` (on screen) is `{ product_id, name, category, reasonText: string|null, checked: boolean, stored: boolean }`.

---

### Task 1: Shopping list in the database

**Files:**
- Create: `supabase/tests/fixtures/heladera-schema-stage2d.sql`, `supabase/migrations/2026-10-26-compras.sql`, `supabase/tests/compras-schema.test.js`
- Modify: `supabase/schema.sql`, `supabase/tests/supabase-stub.sql`, `supabase/tests/propias-schema.test.js` (`migration matches schema.sql` compares stage2c + propias against the **stage2d fixture** instead of `schema.sql`)

**Interfaces (produces):**
- `heladera.shopping_items`:

  ```
  household_id bigint not null references households,
  product_id   bigint not null references products,
  reason       text not null check (reason in ('se_acabo','habitual','plato','a_mano')),
  recipe_id    bigint references recipes on delete set null,
  added_on     date not null,
  checked      boolean not null default false,
  primary key (household_id, product_id)
  ```

  - Policy `for all`, limited to the household's rows. Its `with check` also requires the product to be visible, and the recipe too when `recipe_id` is set.
  - Grants: `select, insert, delete`, plus `update (checked)`.
  - `alter publication supabase_realtime add table heladera.shopping_items;`. The stub gains `create publication supabase_realtime;`, and PGlite accepts it.
- `heladera.shopping_snoozes`:

  ```
  household_id bigint not null references households,
  product_id   bigint not null references products,
  snoozed_on   date not null,
  primary key (household_id, product_id)
  ```

  - Policy `for all` on the household's rows, with a visible product.
  - Grants: `select, insert, delete`, plus `update (snoozed_on)`.
- `heladera.finish_fridge_item(product_id bigint, today date) returns boolean`
  - It deletes the household's fridge row.
  - It inserts a `shopping_items` row with `reason 'se_acabo'` and `added_on today`, `on conflict do nothing`.
  - It returns true only when that row was inserted.
- `heladera.add_to_fridge(product_ids bigint[], today date)`, same signature, via `create or replace`:
  - As today, it puts the products in the fridge and records the purchases.
  - New: it also deletes the household's `shopping_items` rows for those products.
- `heladera.store_checked(today date) returns int`
  - It calls `add_to_fridge` with every checked product on the household's list, which removes those rows.
  - It returns how many products that was. When nothing is checked it returns 0 and changes nothing.
- `heladera.add_recipe_to_list(recipe_id bigint, today date) returns bigint[]`
  - It inserts every product of the recipe's ingredients that is not "home", with `reason 'plato'`, that `recipe_id` and `added_on today`.
  - "Home" means the fridge or the effective basics, with the same definition as `recipe_candidates()`.
  - It skips products already on the list (`on conflict do nothing`).
  - It returns the ids it inserted. If the recipe is not visible, it raises `recipe not found`.
- `heladera.week_candidates() returns table (recipe_id bigint, title text, minutes int, missing_names text[], own boolean, favorite boolean)`
  - It returns visible recipes with 1 to 3 ingredient products not home (main or minor).
  - `missing_names` are those products' names, ordered by name.
  - Rows are ordered by missing count, then `recipe_id`, with `limit 300`.
- All five functions:
  - `security invoker set search_path = ''`.
  - Execute revoked from `public, anon` and granted to `authenticated`.
- The migration is wrapped in `begin; … commit;` with a header like `2026-10-25-propias.sql`.

- [ ] **Step 1: Copy** today's `supabase/schema.sql` byte for byte to `supabase/tests/fixtures/heladera-schema-stage2d.sql`. Then repoint the propias migration test to it.
- [ ] **Step 2: Write failing tests** in `compras-schema.test.js`.

  **Setup,** as in `propias-schema.test.js`:
  - Households: Casa (a1, a2) and Otra (b1).
  - Base products: huevo, papa, cebolla, leche, sal (assumed).
  - Recipe `tortilla`: huevo main, papa main, cebolla minor, sal minor.
  - Casa's fridge: huevo.

  **Tests:**
  - `finishing adds to the list once`:
    - a1 calls `finish_fridge_item(<huevo>, '2026-10-26')` and gets true.
    - The fridge has no huevo. The list has huevo with reason `se_acabo`.
    - a1 puts huevo back in the fridge (insert) and calls it again: it returns false, and the list still has one huevo row.
  - `add_to_fridge clears the list`:
    - leche and papa are on the list. a1 calls `add_to_fridge('{<leche>}', …)`.
    - leche is off the list and papa is still on it.
  - `store_checked moves the cart to the fridge`:
    - The list has leche (checked) and papa (unchecked). a1 calls `store_checked('2026-10-26')` and gets 1.
    - leche is in the fridge with a purchase dated 2026-10-26. papa is still on the list.
    - A second call returns 0.
  - `add_recipe_to_list skips what is home or listed`:
    - Fridge has huevo, cebolla is on the list, sal is a basic.
    - `add_recipe_to_list(<tortilla>, …)` returns `{<papa>}`. papa's row has reason `plato` and recipe_id tortilla.
    - A second call returns `{}`.
  - `week_candidates counts what is missing`:
    - With only huevo in the fridge, tortilla is returned with `missing_names = {cebolla,papa}`.
    - With nothing in the fridge, tortilla is missing huevo, papa and cebolla (3), and is still returned.
    - A recipe missing 4 products is not returned.
  - `the list belongs to the household`:
    - a2 sees a1's list items. b1 sees none of Casa's list items, snoozes or own-recipe week candidates.
    - b1 inserting a list row for Casa fails with `/row-level security/`.
    - b1's `store_checked` does not touch Casa's rows.
  - `snoozes are per household`: a1 upserts a snooze, a2 sees it and b1 doesn't.
  - `anon reads nothing`: anon on `shopping_items`, `shopping_snoozes` and each new function fails with `/permission denied/`.
  - `the list is published for realtime`: `pg_publication_tables` has `heladera.shopping_items` in `supabase_realtime`.
  - `migration matches schema.sql`: stage2d fixture + `2026-10-26-compras.sql` vs `schema.sql`, with the `shape` helper.
- [ ] **Step 3: Run** `npm run test:db`. Expected: FAIL (`relation "heladera.shopping_items" does not exist`).
- [ ] **Step 4: Write** the `schema.sql` changes and the migration, with identical DDL. The existing inventario/hoy/propias tests must still pass.
- [ ] **Step 5: Run** `npm test`. Expected: PASS, all.
- [ ] **Step 6: Commit**: `feat: shopping list in the database`.

### Task 2: List logic (pure)

**Files:**
- Create: `src/lib/shoppingList.js`, `src/lib/tests/shoppingList.test.js`

**Interfaces:**
- Consumes:
  - `daysBetween(fromIso, toIso)` and `addDays` from `format.js`.
  - `CATEGORIES` from `products.js`.
  - `dailyOrder(recipeId, today)` from `suggest.js`.
- Produces:
  - `habits(purchases: {product_id, bought_on}[]) → Map<product_id, Habit>`.
    - Only products bought on ≥3 distinct days count.
    - `interval` is the median of the gaps between consecutive distinct days. With an even count, take the lower middle value. It is ≥1.
    - `last` is the latest day.
  - `habitText(interval) → string`:
    - ≤4 → `"Lo comprás cada pocos días"`
    - ≤10 → `"Lo comprás cada semana"`
    - ≤20 → `"Lo comprás cada dos semanas"`
    - ≤45 → `"Lo comprás cada mes"`
    - otherwise → `` `Lo comprás cada ${interval} días` ``
  - `dueHabits({ habits, presentIds: Set, listedIds: Set, snoozes: {product_id, snoozed_on}[], today }) → Habit[]`.
    - A habit is due when `daysBetween(last, today) >= interval`, and it is not present, not listed, and not snoozed.
    - Snoozed means `daysBetween(snoozed_on, today) < interval`.
    - Ordered by how overdue it is (most first).
  - `reasonText(row: ListRow, habitsMap) → string|null`:
    - `se_acabo` → `"Se acabó"`.
    - `habitual` → `habitText` of the product's habit, or `"Lo comprás seguido"` when there is none.
    - `plato` → `` `Para ${row.recipe?.title ?? 'un plato'}` ``.
    - `a_mano` → null.
  - `buildList({ rows, due, products, habitsMap }) → { groups: [{ key, label, entries: ListEntry[] }], cart: ListEntry[] }`.
    - Unchecked stored rows and due habits (`stored: false`, `checked: false`, reason from `habitText`) are grouped by product category, in `CATEGORIES` order, by name within a group.
    - Empty groups are left out.
    - Checked stored rows go in `cart`, by name.
  - `rankWeek({ candidates, cooked: {recipe_id, cooked_on}[], today }) → candidate[]`.
    - It drops recipes cooked in the last 14 days.
    - Then it sorts: own or favorite first, then fewer `missing_names`, then `dailyOrder(recipe_id, today)`.

- [ ] **Step 1: Write failing tests:**
  - `habitual needs three distinct days`:
    - Two purchases, or three on two distinct days: not in `habits`.
    - Days 2026-10-01, 10-08 and 10-15: `interval` 7, `last` 10-15.
  - `habit interval is the median gap`: gaps 7, 7 and 30 give 7.
  - `habitText` boundaries: 4, 5, 10, 11, 20, 21, 45, 46.
  - `a habit is due after its interval`: last 10-15, interval 7. On 10-21 it is not due; on 10-22 it is.
  - `present or listed habits are not due`.
  - `a snooze hides it for one interval`: snoozed on 10-22 with interval 7. Not due on 10-28; due on 10-29.
  - `reasonText`: each reason, plus a `plato` row whose recipe was deleted (`recipe: null`) gives `"Para un plato"`.
  - `buildList groups by category and puts checked in the cart`:
    - leche (lacteo), tomate (verdura) checked, cebolla (verdura), and a due habit pan (panificado).
    - Groups: Verdura [Cebolla], Lácteo [Leche], Panadería [Pan]. Cart: [Tomate].
  - `rankWeek`: drops a recipe cooked 3 days ago. A favorite missing 3 products comes before a plain recipe missing 1.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: shopping list logic`.

### Task 3: Data calls and "se acabó" goes to the list

**Files:**
- Create: `src/lib/shopping.js`
- Modify: `src/lib/fridge.js`, `src/screens/Fridge.jsx`, `src/screens/Recipe.jsx` (only the "¿Se acabó algo?" undo)

**Interfaces:**
- Produces (`src/lib/shopping.js`, same style as `fridge.js`):
  - `loadShopping(today)` returns `{ rows: ListRow[], products, purchases, presentIds: Set, snoozes }`. It loads in parallel. Purchases cover the last 180 days. Products use the same select as `loadAddData`.
  - `addToList(householdId, productId, reason, today, recipeId = null)` inserts. It ignores `23505`, because the product is already on the list.
  - `removeFromList(productId)` deletes the household's row.
  - `restoreListRow(householdId, row)` puts a removed row back, for Undo.
  - `setChecked(productId, checked)` updates.
  - `checkHabit(householdId, productId, today)` inserts `{ reason: 'habitual', checked: true }`.
  - `snooze(householdId, productId, today)` upserts. `unsnooze(productId)` deletes.
  - `storeChecked(today) → number` calls RPC `store_checked`.
  - `addRecipeToList(recipeId, today) → number[]` calls RPC `add_recipe_to_list`.
  - `loadWeek(today)` returns `{ candidates, cooked }`. It calls RPC `week_candidates`, plus `cooked` for the last 14 days.
  - `subscribeShopping(householdId, onChange) → () => void`.
    - It uses a Supabase channel `postgres_changes`, event `*`, schema `heladera`, table `shopping_items`, filter `household_id=eq.<id>`.
    - It calls `onChange` on every event, and the returned function removes the channel.
- `finishItem(productId, today) → boolean (listed)` now calls RPC `finish_fridge_item`.
- Fridge "Se acabó":
  - The toast becomes `` `${name}: se acabó. Va a la lista.` `` when `listed`. Otherwise it stays as today.
  - Undo calls `restoreItem` and, when `listed`, also `removeFromList(productId)`.
- Recipe's "¿Se acabó algo?" does the same for each finished item. Only the listed ones are removed on Undo.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS, no new warnings. The >500 kB chunk advisory is known.
- [ ] **Step 3: Commit**: `feat: shopping data calls; finished products go to the list`.

### Task 4: The Compras screen

**Files:**
- Modify: `src/screens/Shopping.jsx`, `src/index.css`

**Interfaces:**
- Consumes: Task 2 and Task 3 functions, `searchProducts`/`findByName` (`products.js`), `NewProductForm`, `useToast`, `saveErrorMessage`, `todayISO`.

**Screen:** "Compras", from top to bottom:
1. **Search field** "Agregar a la lista…".
   - Up to 5 results, using `searchProducts`. Tapping one does `addToList(…, 'a_mano', …)` and clears the field.
   - When nothing matches exactly, offer `Crear "<texto>"`. It opens `NewProductForm` and adds the new product, as in the recipe form.
2. **The list,** grouped as `buildList` returns it, with the group label as a small heading.
   - Each row: a large tick area (checkbox and name), the reason in muted text, and a "Quitar" button.
   - Tick:
     - A stored row toggles `setChecked`.
     - A due habit runs `checkHabit`.
     - Both are optimistic, with rollback and a toast on error.
   - Quitar:
     - A stored row runs `removeFromList`, with an Undo toast "<Producto> fuera de la lista".
     - A habit runs `snooze`, with Undo `unsnooze`.
3. **"En el carrito (N)"** section: checked rows, struck through, tap to untick.
   - Under it, a primary button `Guardar ${N} en la heladera`. It runs `storeChecked`, then shows the toast `` `${n} ${plural(n,'producto','productos')} a la heladera` `` and reloads.
4. **Link button** "Elegir platos de la semana", to `/shopping/week`.

**Empty state** (no entries, no cart): "La lista está vacía. Lo que se acaba en la heladera aparece acá solo."

**Live updates:**
- `subscribeShopping` reloads the list on remote changes. It skips a reload while a save of this phone is in flight, then reloads once after.
- Reload as well when the app comes back to the foreground, using the `visibilitychange` pattern in `Today.jsx`.
- Unsubscribe on unmount.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 3: Commit**: `feat: shopping list screen`.

### Task 5: Week dishes and "Agregar lo que falta"

**Files:**
- Create: `src/screens/WeekDishes.jsx`
- Modify: `src/components/SuggestionCard.jsx`, `src/screens/Recipe.jsx`, `src/App.jsx` (route `/shopping/week`), `src/index.css`

**Interfaces:**
- Consumes: `loadWeek`, `addRecipeToList`, `removeFromList` (Task 3), `rankWeek` (Task 2).
- `SuggestionCard` gains an optional `openLabel` prop for the ✓ action's text and accessible label. The default keeps today's label, and the Hoy screen does not change.

**WeekDishes** (`/shopping/week`, `BackButton` with fallback `/shopping`):
- Title: "Platos de la semana".
- Cards come from `rankWeek`. Each card's reason is `` `Falta: ${missing_names.join(', ')}` ``.
- Swipe left, or ✕: next card.
- Swipe right, or ✓ with `openLabel` "Lo elijo":
  - It runs `addRecipeToList`.
  - When ids come back: toast `` `A la lista: ${names}` `` with Undo, which removes those ids.
  - When none come back: "Ya tienen todo para <título>".
- A counter shows "Elegidos: N de 4".
- After 4 picks, or the "Listo" button, it goes back to `/shopping`.
- Empty deck: "No hay más platos para elegir." with "Listo".

**Recipe screen:**
- A secondary button "Agregar lo que falta a la lista" goes under the ingredients, on every recipe.
- It shows the same toasts and Undo as the swipe.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 3: Commit**: `feat: week dishes and missing ingredients to the list`.

### Task 6: Production

- [ ] **Step 1: README.** List `supabase/migrations/2026-10-26-compras.sql` after propias. Add the new screens and files. This step folds into the final fix wave.
- [ ] **Step 2: Production migration.** Ask the user first. Give the SQL in short blocks, each ending in `commit;`, plus a check query: `to_regclass` for both tables, `to_regprocedure` for the new functions, and a `pg_publication_tables` row. Then verify through the API that `shopping_items` answers `401`/`42501`, not `404`/`PGRST205`.
- [ ] **Step 3: Merge and push** after the user's OK. Run the deploy with `gh run watch`.
- [ ] **Step 4: Phone check by the user.** Check these, using both phones:
  - A "se acabó" product appears on the list.
  - Something ticked on one phone shows up on the other.
  - "Guardar en la heladera" works.
  - A dish picked in "Platos de la semana" adds its missing ingredients.
  - After about three weeks of purchases, habitual items show up.

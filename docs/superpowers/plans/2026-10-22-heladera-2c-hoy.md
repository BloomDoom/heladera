# Heladera — Stage 2c ("¿Qué comemos hoy?") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Hoy tab proposes one dish at a time that can be made with what the household has, says why, and lets the household skip it, open it, and record "Lo cocinamos" (offering to mark used products as finished). The household can edit its always-available basics, and see what it cooked.

**Architecture:** One SQL function, `recipe_candidates()`, finds the recipes the household can make (every main ingredient at home, at most 1 minor missing; assumed basics count as at home). The ranking runs on the phone in a pure function, `rankSuggestions`, so its rules stay simple, testable and explainable ("por qué"). New tables `cooked`, `rejections` and `assumed_overrides` hold the household's history, skips and basics. Screens: Hoy (card with swipe), Receta (ingredients, steps, "Lo cocinamos"), and two sections in Más.

**Tech Stack:** React 19 + Vite (plain JS), supabase-js, PGlite for SQL tests, `node:test`. No new dependencies.

**Spec:** `heladera/docs/superpowers/specs/2026-10-21-heladera-design.md` (§7 "¿Qué comemos hoy?", §6 "Básicos asumidos", §5 households).

**Stage 2 split:** 2a recetario (done), 2b Heladera (done), **2c Hoy (this plan)**, 2d favorites and own recipes (spec §7 rule 5 "Las recetas propias y las favoritas suben" lands there).

## Global Constraints

- Code in English, UI text in Rioplatense Spanish, dates shown as DD/MM/YYYY. No new dependencies.
- Every `heladera` table has RLS: a household only sees and writes its own rows (§5). Nothing in `public` changes. Update `supabase/schema.sql`, add `supabase/migrations/2026-10-24-hoy.sql` with the same DDL, update the README.
- "Today" is `todayISO()` from the phone (Argentina), passed to the database; never `current_date`.
- Choosing rules (§7, approved): (1) only dishes makeable with what there is, tolerating **1 missing minor ingredient**, with a warning; (2) first the ones using products about to expire; (3) then the ones not eaten in a long time; (4) recently rejected ones go down. Simple and explainable: the card shows why.
- Rejections and cooked history are **per household**, not per person (§7).
- "Lo cocinamos" records the dish with its date and **offers** to mark used ingredients as "se acabó"; it never does it alone (§7).
- Sal, pimienta, aceite, agua are assumed by default (`products.assumed`); each household can edit its list. Assumed only counts for choosing recipes; aceite is still a normal fridge product (§6).
- Swipe left: another dish. Swipe right: ingredients and steps. ✕/✓ buttons do the same (§7). No gesture library.
- The app opens on Hoy (already true: route `/`).
- Out of scope: favorites and own recipes (2d), the shopping list (stage 3).

## Review Focus

1. A recipe whose only ingredients are basics (agua, sal) must not be suggested: something from the fridge has to be used. Test: `recipes need at least one product from the fridge` (Task 1).
2. A household that stops assuming aceite and has none must not get dishes where aceite is a main ingredient. Test: `a household can stop assuming a basic` (Task 1).
3. When every makeable dish was skipped recently, the screen must still show dishes (lower), never an empty screen. Test: `rejected dishes sink but stay` (Task 2).
4. Skipping, closing the app and opening it again the same night must not show the same order: the order must be stable within a day, and not identical every day. Test: `order is stable within a day and changes across days` (Task 2).
5. A dish cooked this week must not come back first tomorrow. Test: `cooked this week sinks` (Task 2).

---

## File Structure

```
supabase/schema.sql                                modify: cooked, rejections, assumed_overrides, recipe_candidates
supabase/migrations/2026-10-24-hoy.sql             create
supabase/tests/fixtures/heladera-schema-stage2b.sql create: byte copy of today's schema.sql
supabase/tests/hoy-schema.test.js                  create
supabase/tests/inventario-schema.test.js           modify: its migration test compares against the stage2b fixture
src/lib/suggest.js         rankSuggestions, urgencyText, noveltyText, dailyOrder
src/lib/swipe.js           swipeDirection(dx, threshold)
src/lib/products.js        modify: effectiveAssumed
src/lib/today.js           Supabase calls for Hoy, Receta and Más
src/lib/tests/suggest.test.js, swipe.test.js, products.test.js (modify)
src/components/SuggestionCard.jsx   the card, with swipe
src/components/FinishedSheet.jsx    "¿Se acabó algo?" after cooking
src/components/AssumedEditor.jsx    "Siempre hay en casa" (in Más)
src/screens/Today.jsx      modify: the real screen
src/screens/Recipe.jsx     create: /recipe/:id
src/screens/More.jsx       modify: basics + "Lo que cocinaron"
src/App.jsx, src/index.css, README.md
```

Shapes:

- `Candidate = { recipe_id: number, title: string, minutes: number|null, used_product_ids: number[], missing_product_id: number|null, missing_product_name: string|null }` (what the SQL function returns; `used_product_ids` are the recipe's products that are in the fridge, assumed basics excluded).
- `Suggestion = { recipeId, title, minutes, score: number, reasons: string[], missing: string|null }`.
- `Item` as in stage 2b (`{ product_id, added_on, expires_on, product }`); `Cooked = { id, recipe_id, cooked_on }`; `Rejection = { recipe_id, rejected_on }`.

---

### Task 1: Tables and recipe candidates

**Files:**
- Create: `supabase/tests/fixtures/heladera-schema-stage2b.sql`, `supabase/migrations/2026-10-24-hoy.sql`, `supabase/tests/hoy-schema.test.js`
- Modify: `supabase/schema.sql`, `supabase/tests/inventario-schema.test.js` (`migration matches schema.sql`: `full` becomes the stage2b fixture)

**Interfaces:**
- Produces:
  - `heladera.cooked (id bigint generated always as identity primary key, household_id bigint not null references households, recipe_id bigint not null references recipes on delete cascade, cooked_on date not null)`. Policies: select, insert, delete where `household_id = (select heladera.my_household_id())`; insert also checks `exists (select 1 from heladera.recipes r where r.id = recipe_id)`. Grants `select, insert, delete` to authenticated. Delete is for Undo.
  - `heladera.rejections (id bigint generated always as identity primary key, household_id …, recipe_id … on delete cascade, rejected_on date not null)`. Select and insert (same checks). Grants `select, insert`.
  - `heladera.assumed_overrides (household_id bigint not null references households, product_id bigint not null references products, assumed boolean not null, primary key (household_id, product_id))`. Policy `for all`, `with check` also requires the product to be visible. Grants `select, insert, update, delete`.
  - `heladera.recipe_candidates() returns table (recipe_id bigint, title text, minutes int, used_product_ids bigint[], missing_product_id bigint, missing_product_name text)`, `language sql stable security invoker set search_path = ''`. Logic:
    - "at home" = products in the household's `fridge_items` ∪ products whose `coalesce(assumed_overrides.assumed, products.assumed)` is true for the household.
    - Per recipe: zero main ingredients missing, at most one minor missing (return its id and name), and at least one ingredient that is in `fridge_items` (`used_product_ids` = those in `fridge_items` that are not assumed for the household, non-empty).
    - Execute revoked from `public, anon`, granted to `authenticated`.
  - Migration wrapped in `begin; … commit;`, header like `2026-10-23-inventario.sql`.

- [ ] **Step 1: Copy** today's `supabase/schema.sql` byte for byte to `supabase/tests/fixtures/heladera-schema-stage2b.sql`.
- [ ] **Step 2: Write failing tests** in `hoy-schema.test.js`. Setup: households Casa (a1, a2) and Otra (b1); base products `huevo`, `papa`, `cebolla`, `perejil`, `oregano`, `sal` (assumed), `aceite` (assumed), `agua` (assumed); recipes:
  - `tortilla`: huevo main, papa main, cebolla minor, sal minor, aceite main.
  - `huevo duro`: huevo main, agua main, sal minor.
  - `papas al perejil`: papa main, perejil minor, oregano minor.
  - `agua salada`: agua main, sal minor.
  Casa's fridge: huevo, papa. Otra's fridge: cebolla, perejil, oregano, papa.
  - `candidates need every main ingredient`: a1 → `tortilla` (missing cebolla, name `Cebolla`) and `huevo duro` (missing null); not `papas al perejil` (2 minors missing).
  - `used products are the fridge ones, not the basics`: tortilla's `used_product_ids` = [huevo, papa] in any order.
  - `recipes need at least one product from the fridge`: `agua salada` is never a candidate, for a1 or b1.
  - `a household can stop assuming a basic`: a1 inserts `assumed_overrides (Casa, aceite, false)` → `tortilla` is gone; `huevo duro` stays.
  - `a household can assume more basics`: a1 inserts override `(Casa, cebolla, true)` → tortilla's `missing_product_id` is null.
  - `another household's fridge does not count`: b1 gets `papas al perejil` (nothing missing) and never `huevo duro`; a1 never gets `papas al perejil`.
  - `cooked and rejections belong to the household`: a1 inserts cooked (Casa, tortilla, '2026-10-22') and a rejection; a2 sees both; b1 sees none; a1 inserting with `household_id` = Otra → `/row-level security/`; a1 can delete its cooked row; b1's delete affects 0 rows.
  - `anon reads nothing`: anon on `cooked` and `recipe_candidates()` → `/permission denied/`.
  - `migration matches schema.sql`: stage2b fixture + `2026-10-24-hoy.sql` vs `schema.sql`, using the `shape` helper of `inventario-schema.test.js` (columns, policies, routines, grants, column privileges, indexes).
- [ ] **Step 3: Run** `npm run test:db`. Expected: FAIL (`relation "heladera.cooked" does not exist`).
- [ ] **Step 4: Write** the `schema.sql` section and the migration (identical DDL). Point the inventario migration test at the stage2b fixture.
- [ ] **Step 5: Run** `npm test`. Expected: PASS, all.
- [ ] **Step 6: Commit**: `feat: cooked, rejections, basics and recipe candidates`.

### Task 2: Ranking

**Files:**
- Create: `src/lib/suggest.js`, `src/lib/swipe.js`, `src/lib/tests/suggest.test.js`, `src/lib/tests/swipe.test.js`
- Modify: `src/lib/products.js`, `src/lib/tests/products.test.js`

**Interfaces:**
- Consumes: `freshness(item, today)` (`src/lib/freshness.js`), `daysBetween`, `plural` (`src/lib/format.js`).
- Produces:
  - `rankSuggestions({ candidates, items, cooked, rejections, today }) → Suggestion[]`, sorted by `score` desc, then `dailyOrder(recipeId, today)` asc. Score, one term each (the formula is the explanation, keep it this simple):

    | Rule | Condition | Points | Reason text |
    |---|---|---|---|
    | Por vencer | soonest `daysLeft` among `used_product_ids`' items ≤ 2 | +3 | `urgencyText(name, daysLeft)` of that item |
    | Hace mucho | never cooked, or last `cooked_on` ≥ 14 days ago | +2 | `noveltyText(days)` (`null` days = never) |
    | Hace poco | last cooked 7–13 days ago | +1 | — |
    | Repetido | last cooked < 7 days ago | −3 | — |
    | Descartado | last rejection 0–3 days ago | −4 | — |
    | Descartado antes | last rejection 4–14 days ago | −2 | — |
    | Falta algo | `missing_product_id` not null | −1 | — (shown as `missing`) |

    `reasons`: the "Por vencer" text first, then the "Hace mucho" text; if neither applies, `['Se puede hacer con lo que hay']`. `missing`: `` `Falta ${missing_product_name.toLowerCase()}` `` or null.
  - `urgencyText(name, daysLeft)`: 0 → `"<Name> vence hoy"`, 1 → `"<Name> vence mañana"`, 2 → `"<Name> vence en 2 días"`, < 0 → `"<Name> ya pasó la fecha estimada"`.
  - `noveltyText(days)`: `null` → `"No lo cocinaron nunca"`; ≥ 14 → `` `No lo comen hace ${plural(Math.floor(days / 7), 'semana', 'semanas')}` ``.
  - `dailyOrder(recipeId, today) → number`: a deterministic hash of `` `${recipeId}:${today}` `` (e.g. FNV-1a 32-bit) used only to break ties.
  - `swipeDirection(dx, threshold = 80) → 'left'|'right'|null`.
  - `effectiveAssumed(products, overrides) → Product[]` in `products.js`: products where `override?.assumed ?? product.assumed`, sorted by name; `overrides = [{ product_id, assumed }]`.

- [ ] **Step 1: Write failing tests** (today `'2026-10-22'`; build candidates and items inline):
  - `expiring products come first`: A uses huevo with `daysLeft` 1, B uses papa with `daysLeft` 10, both never cooked → order A, B; A's reasons `['Huevo vence mañana', 'No lo cocinaron nunca']`.
  - `cooked this week sinks`: A cooked `2026-10-19`, B cooked `2026-09-01` → B first; B's reasons include `'No lo comen hace 7 semanas'`.
  - `rejected dishes sink but stay`: A rejected `2026-10-22`, B not → order B, A; with only A, result is `[A]`.
  - `older rejections weigh less`: A rejected `2026-10-15` (7 days, −2), B rejected `2026-10-21` (−4), otherwise equal → A first.
  - `a missing minor is warned and lowers the dish`: A missing Cebolla, B nothing missing, otherwise equal → B first; A's `missing` = `'Falta cebolla'`.
  - `no reason falls back`: cooked 10 days ago, nothing expiring → reasons `['Se puede hacer con lo que hay']`.
  - `order is stable within a day and changes across days`: 20 equal candidates → same order on two calls with `today` `2026-10-22`; a different order with `2026-10-23`.
  - `urgencyText`: 0, 1, 2, −3 → the four texts above with `'Huevo'`.
  - `swipeDirection`: −81 → `'left'`, 81 → `'right'`, 40 → null, −80 → null.
  - `effectiveAssumed`: sal (assumed), aceite (assumed), cebolla; overrides aceite false, cebolla true → `[Cebolla, Sal]`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `suggest.js`, `swipe.js`, `effectiveAssumed`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: rank dish suggestions`.

### Task 3: Hoy screen

**Files:**
- Create: `src/lib/today.js`, `src/components/SuggestionCard.jsx`
- Modify: `src/screens/Today.jsx`, `src/App.jsx` (pass `household` to `Today`), `src/index.css`

**Interfaces:**
- Consumes: `rankSuggestions`, `swipeDirection` (Task 2); `loadFridge` (`src/lib/fridge.js`); `todayISO`, `addDays`; `useToast`; `saveErrorMessage`.
- Produces (`src/lib/today.js`, same style as `fridge.js`):
  - `loadSuggestionsData(today) → { candidates, items, cooked, rejections }`, in parallel: `rpc('recipe_candidates')`, `loadFridge()`, cooked with `cooked_on >= addDays(today, -180)`, rejections with `rejected_on >= addDays(today, -14)`.
  - `rejectRecipe(householdId, recipeId, today)`: insert a rejection.

Screen behavior:
- Title "¿Qué comemos hoy?". Under it, one `SuggestionCard` with the first suggestion: title, minutes (`"45 min"`, hidden if null), each reason on its own line, `missing` as a warning chip (`--warn`).
- Swipe left or ✕ ("Otro plato"): the card slides out, `rejectRecipe` runs in the background, the next suggestion shows. A failed save toasts `saveErrorMessage` and does not bring the card back.
- Swipe right or ✓ ("Ver receta"): go to `/recipe/<id>`.
- Swipe: pointer events on the card, the card follows the finger horizontally (`transform: translateX`), `swipeDirection(dx)` on release decides; below the threshold it springs back. `touch-action: pan-y` so vertical scroll still works. Respect `prefers-reduced-motion` (no slide animation).
- Skipped dishes stay skipped for this visit: keep a list of skipped ids in state and show the next one not in it. When every suggestion was skipped: "No hay más platos con lo que hay. Probá de nuevo más tarde o cargá lo que compraste." with a link to `/fridge/add`.
- No candidates at all: empty fridge → "Cargá lo que hay en la heladera para ver qué cocinar." with a button "Cargar lo comprado" (`/fridge/add`); fridge not empty → "Con lo que hay no sale ningún plato. Cargá lo que compraste." with the same button.
- Load and error states with `useLoad` + `LoadState`. Reload when the screen opens (it already remounts on tab change).

- [ ] **Step 1: Implement** the files above.
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS, build without warnings.
- [ ] **Step 3: Commit**: `feat: today screen with dish suggestions and swipe`.

### Task 4: Receta and "Lo cocinamos"

**Files:**
- Create: `src/screens/Recipe.jsx`, `src/components/FinishedSheet.jsx`
- Modify: `src/lib/today.js`, `src/App.jsx` (route `/recipe/:id` with `household`), `src/index.css`

**Interfaces:**
- Consumes: `finishItem`, `restoreItem`, `loadFridge` (`fridge.js`); `BackButton`; `useToast`; `todayISO`.
- Produces (`src/lib/today.js`):
  - `loadRecipe(id) → { id, title, minutes, servings, steps, source, source_url, ingredients: [{ line, is_main, product_id, product: { name } }] }` (`.single()`).
  - `markCooked(householdId, recipeId, today) → { id }`: insert into `cooked`, return the row.
  - `undoCooked(id)`: delete that `cooked` row.
  - `loadBasics() → { products, overrides }`: products (`id, code, household_id, name, category, storage, shelf_days, synonyms, assumed`) and `assumed_overrides (product_id, assumed)`, in parallel. Task 5 reuses it.
  - `loadRecipePage(id) → { recipe, items, assumedIds: Set<number> }`: `loadRecipe`, `loadFridge` and `loadBasics` in parallel; `assumedIds` from `effectiveAssumed`.

Screen behavior:
- "‹ Volver" (fallback `/`), title, minutes and servings when known ("45 min · 4 porciones").
- "Ingredientes": main ingredients first, then a "Para condimentar" group with the minor ones; each shows `line` as written; one whose product is neither in the fridge nor assumed shows "(falta)" in `--warn`. The screen loads with `loadRecipePage(id)`.
- "Preparación": `steps` split into paragraphs on blank lines (`/\n\s*\n/`), single line breaks inside a paragraph joined with a space.
- Source at the end, small and muted: "Receta de <source>" linking to `source_url` when present (`target="_blank" rel="noopener"`).
- Sticky primary button "Lo cocinamos": `markCooked(household.id, id, todayISO())`; then open `FinishedSheet` listing the recipe's products that are in the fridge (checkboxes, none checked; title "¿Se acabó algo?"; buttons "Listo" and "Nada se acabó"). "Listo" calls `finishItem` for each checked product, then goes to `/` and toasts `"Anotado: <título>"` with Undo → `undoCooked(id)` and `restoreItem` for each finished item. "Nada se acabó" does the same without finishing anything. Any failed save toasts `saveErrorMessage`; a failed `markCooked` keeps the user on the recipe.
- Double-tap on "Lo cocinamos" must not record twice (ref + disabled, like "Agregar").

- [ ] **Step 1: Implement** the files above.
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 3: Commit**: `feat: recipe screen and lo cocinamos`.

### Task 5: Basics and history in Más

**Files:**
- Create: `src/components/AssumedEditor.jsx`
- Modify: `src/lib/today.js`, `src/screens/More.jsx`, `src/App.jsx` (if `More` needs more props), `src/index.css`

**Interfaces:**
- Consumes: `effectiveAssumed`, `searchProducts` (`products.js`); `loadBasics` (Task 4); `formatDate`.
- Produces (`src/lib/today.js`):
  - `setAssumed(householdId, productId, assumed)`: upsert into `assumed_overrides`.
  - `loadHistory() → [{ id, cooked_on, recipe: { id, title } }]`: the last 30 `cooked` rows, newest first.

Screen behavior (Más, below the household and above "Cerrar sesión"):
- "Siempre hay en casa": one-line explanation "Para elegir platos, la app cuenta con que esto nunca falta." Each `effectiveAssumed` product as a chip with an ✕ (`aria-label="Sacar <nombre>"`) → `setAssumed(…, false)`. A search field "Agregar algo que siempre hay" using `searchProducts`; tapping a result → `setAssumed(…, true)`. Optimistic, with rollback and `saveErrorMessage` on error.
- "Lo que cocinaron": the history as rows "DD/MM/YYYY · Título", each linking to `/recipe/<id>`. Empty: "Todavía no cocinaron nada con la app."

- [ ] **Step 1: Implement** the files above.
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 3: Commit**: `feat: household basics and cooking history`.

### Task 6: Production and a real night

Every step here touches production: ask the user before each.

- [ ] **Step 1: README**: database setup lists `2026-10-24-hoy.sql` after the inventario migration; structure lists the new lib files, screens and components. Commit: `docs: README for the hoy screen`.
- [ ] **Step 2: User runs** `supabase/migrations/2026-10-24-hoy.sql` in the SQL Editor. Expected: "Success. No rows returned".
- [ ] **Step 3: Merge and push** after the user's ok; wait for the GitHub Pages deploy to succeed.
- [ ] **Step 4: User checks** on the phone: Hoy shows a dish with a reason; ✕ and swipe left show another; ✓ opens the recipe; "Lo cocinamos" offers the fridge products and Undo works; the dish appears in "Lo que cocinaron" and doesn't come back first; removing aceite from "Siempre hay en casa" makes dishes show "Falta aceite" (aceite is a minor ingredient in the recipes), and Deshacer puts it back.
- [ ] **Step 5: Stage 2 "listo cuando"** (spec §11): one real night, the app proposes a dish that can be made with what there is and is not "lo de siempre". The user confirms.

# Heladera — Stage 2d (Favoritas y recetas propias) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The household can mark recipes as favorites and write its own recipes, and both go up in the "¿Qué comemos hoy?" suggestions with a reason on the card.

**Architecture:** A `favorites` table. Households can now write recipes with their `household_id`, saved atomically through one SQL function, `save_own_recipe`. `recipe_candidates()` also returns `own` and `favorite`, and `rankSuggestions` adds one score row for them. Screens: a star on the recipe, a recipe form (new and edit), and "Mis recetas" plus "Favoritas" in Más.

**Tech Stack:** React 19 + Vite (plain JS), supabase-js, PGlite for SQL tests, `node:test`. No new dependencies.

**Spec:** `heladera/docs/superpowers/specs/2026-10-21-heladera-design.md` (§6 "Recetario propio": "el hogar puede marcar recetas como favoritas y cargar las suyas. Las propias y las favoritas tienen prioridad en las sugerencias"; §7 rule 5 "Las recetas propias y las favoritas suben"; §5 households; §6 "Productos nuevos").

**Stage 2 split:** 2a recetario, 2b Heladera, 2c Hoy (all done), **2d favorites and own recipes (this plan)**. With 2d, stage 2 is complete (spec §11).

## Global Constraints

- Code in English, UI text in Rioplatense Spanish, dates shown as DD/MM/YYYY. No new dependencies.
- Every `heladera` table has RLS: a household only sees and writes its own rows (§5). Base recipes and base products stay read-only for households. Nothing in `public` changes. Update `supabase/schema.sql`, add `supabase/migrations/2026-10-25-propias.sql` with the same DDL, update the README.
- Favorites and own recipes are **per household**, like cooked and rejections (§7).
- An own recipe uses the same product dictionary as every recipe (§6), including the household's private products. Each ingredient is main or minor.
- Own recipes go through the same choosing rules as base recipes (§7 rules 1–4); own and favorite only add points.
- The ranking stays simple and explainable: the card shows why (§7).
- Undo instead of "¿Estás seguro?" dialogs, except deleting an own recipe (see Task 4).
- Production SQL is given to the user in short blocks, each ending in `commit;` and followed by a check query (memory: the phone copy cuts long blocks).
- Out of scope: sharing recipes between households, photos, importing from a link.

## Review Focus

1. Another household must never see, edit or delete our own recipe, nor see or write our favorites. Test: `own recipes and favorites belong to the household` (Task 1).
2. Editing a recipe with a bad ingredient (another household's private product) must fail as a whole and leave the old recipe exactly as it was. Test: `a failed save changes nothing` (Task 1).
3. Two ingredient rows with the same product ("cebolla" for the sofrito and "cebolla" for the salsa) must be explained in the form, not end in a database error. Test: `validateOwnRecipe rejects a repeated product` (Task 2).
4. A step that starts with a number ("2 huevos batidos con sal") must come back as the same step when the recipe is edited. Test: `own steps survive a round trip` (Task 2).
5. A favorite or own recipe that can be made comes up with its reason on the card; one that cannot be made still does not come up. Test: `own and favorite recipes are flagged` (Task 1) and `favorites and own recipes go up` (Task 2).

---

## File Structure

```
supabase/schema.sql                                 modify: favorites, recipe writes, save_own_recipe, recipe_candidates v2
supabase/migrations/2026-10-25-propias.sql          create
supabase/tests/fixtures/heladera-schema-stage2c.sql create: byte copy of today's schema.sql
supabase/tests/propias-schema.test.js               create
supabase/tests/hoy-schema.test.js                   modify: its migration test compares against the stage2c fixture
src/lib/suggest.js            modify: the "own or favorite" score row
src/lib/ownRecipe.js          validateOwnRecipe, ownRecipeSteps
src/lib/recipes.js            Supabase calls for favorites and own recipes
src/lib/tests/suggest.test.js (modify), ownRecipe.test.js
src/screens/Recipe.jsx        modify: star, "Editar"/"Borrar" for own recipes
src/screens/RecipeForm.jsx    create: /recipes/new and /recipe/:id/edit
src/components/IngredientPicker.jsx  one ingredient row: product search, main/minor, line
src/screens/More.jsx          modify: "Mis recetas" and "Favoritas"
src/App.jsx, src/index.css, README.md
```

Shapes:

- `Candidate` gains `own: boolean` and `favorite: boolean`.
- `OwnIngredient = { product_id: number|null, product_name: string, line: string, is_main: boolean }` in the form; `saveOwnRecipe` sends only `{ product_id, line, is_main }`.
- `OwnRecipeInput = { title: string, minutes: number|null, servings: number|null, steps: string[], ingredients: OwnIngredient[] }`.

---

### Task 1: Favorites, own recipes and candidates v2

**Files:**
- Create: `supabase/tests/fixtures/heladera-schema-stage2c.sql`, `supabase/migrations/2026-10-25-propias.sql`, `supabase/tests/propias-schema.test.js`
- Modify: `supabase/schema.sql`, `supabase/tests/hoy-schema.test.js` (`migration matches schema.sql`: `full` becomes the stage2c fixture)

**Interfaces:**
- Produces:
  - `heladera.favorites (household_id bigint not null references households, recipe_id bigint not null references recipes on delete cascade, created_at timestamptz not null default now(), primary key (household_id, recipe_id))`. Policy `for all`: household's rows; `with check` also requires the recipe to be visible. Grants `select, insert, delete`.
  - Recipes written by households:
    - `recipes`: insert policy `with check (household_id = (select heladera.my_household_id()))`; update and delete policies `using` the same (update `with check` the same). Grants: `insert (household_id, title, minutes, servings, steps, source)`, `update (title, minutes, servings, steps)`, `delete`. The existing check `(household_id is null) = (source_key is not null)` keeps households from writing base rows.
    - `recipe_ingredients`: insert and delete policies only for ingredients of the household's own recipes: `exists (select 1 from heladera.recipes r where r.id = recipe_id and r.household_id = (select heladera.my_household_id()))`; insert also requires the product to be visible. Grants `insert, delete`.
  - `heladera.save_own_recipe(recipe_id bigint, title text, minutes int, servings int, steps text, ingredients jsonb) returns bigint`, `language plpgsql security invoker set search_path = ''`. `recipe_id` null → insert a recipe with `household_id = (select heladera.my_household_id())`, `source = 'propia'`; otherwise update that recipe (0 rows updated → `raise exception 'recipe not found'`). Then delete its `recipe_ingredients` and insert one per element of `ingredients` (`[{ product_id, line, is_main }]`). Returns the recipe id. Raises if `title` is blank or `ingredients` is empty. Execute revoked from `public, anon`, granted to `authenticated`.
  - `heladera.recipe_candidates()` v2: same logic and order as today, plus two returned columns `own boolean` (`r.household_id is not null`) and `favorite boolean` (a `favorites` row for the household). The migration does `drop function heladera.recipe_candidates();` then creates it and re-applies its revoke/grant (the return type changes).
  - Migration in `begin; … commit;`, header like `2026-10-24-hoy.sql`.

- [ ] **Step 1: Copy** today's `supabase/schema.sql` byte for byte to `supabase/tests/fixtures/heladera-schema-stage2c.sql`.
- [ ] **Step 2: Write failing tests** in `propias-schema.test.js`. Setup as in `hoy-schema.test.js` (Casa: a1, a2; Otra: b1; solo; base products huevo, papa, cebolla, sal (assumed); a private product of Otra; base recipe `tortilla` (huevo main, papa main, sal minor); Casa's fridge: huevo, papa).
  - `households save their own recipes`: a1 calls `save_own_recipe(null, 'Tortilla de la abuela', 30, 4, 'Batir.\n\nCocinar.', '[{"product_id":<huevo>,"line":"6 huevos","is_main":true},{"product_id":<papa>,"line":"4 papas","is_main":true}]')` → returns an id; the recipe has `household_id` = Casa, `source` = `propia`, `source_key` null, and 2 ingredients.
  - `editing replaces the ingredients`: save again with that id, title `Tortilla de papas`, only huevo → title changed, 1 ingredient.
  - `a failed save changes nothing`: save with that id and an ingredient using Otra's private product → rejects; the recipe still has its previous title and ingredients.
  - `own recipes and favorites belong to the household`: a2 sees Casa's own recipe; b1 does not; b1's `save_own_recipe(<Casa's id>, …)` rejects (`recipe not found`); b1's delete of it affects 0 rows; a1 cannot update or delete the base `tortilla` (0 rows or permission error); a1 cannot insert a recipe with `source_key` (`/permission denied/`); a1 favorites `tortilla`, a2 sees the favorite, b1 does not; b1 inserting a favorite for Casa → `/row-level security/`.
  - `own and favorite recipes are flagged`: after a1 saves the own recipe (huevo + papa) and favorites `tortilla`, a1's `recipe_candidates()` returns both: the own one with `own = true, favorite = false`, `tortilla` with `own = false, favorite = true`; b1's candidates contain neither flag set and not the own recipe.
  - `deleting an own recipe removes its ingredients and favorite`: a1 favorites its own recipe and deletes it → no ingredients or favorite rows left.
  - `blank title or no ingredients is rejected`: `save_own_recipe(null, '  ', …)` and `save_own_recipe(null, 'X', …, '[]')` reject.
  - `anon reads nothing`: anon on `favorites` and `save_own_recipe` → `/permission denied/`.
  - `migration matches schema.sql`: stage2c fixture + `2026-10-25-propias.sql` vs `schema.sql`, with the `shape` helper used in `hoy-schema.test.js`.
- [ ] **Step 3: Run** `npm run test:db`. Expected: FAIL (`relation "heladera.favorites" does not exist`).
- [ ] **Step 4: Write** the `schema.sql` changes and the migration (identical DDL). Point the hoy migration test at the stage2c fixture. Existing `hoy-schema.test.js` candidate tests must still pass (they ignore the new columns).
- [ ] **Step 5: Run** `npm test`. Expected: PASS, all.
- [ ] **Step 6: Commit**: `feat: favorites and own recipes in the database`.

### Task 2: Ranking and own-recipe helpers

**Files:**
- Create: `src/lib/ownRecipe.js`, `src/lib/tests/ownRecipe.test.js`
- Modify: `src/lib/suggest.js`, `src/lib/tests/suggest.test.js`

**Interfaces:**
- Consumes: `recipeSteps(text)` (`src/lib/steps.js`).
- Produces:
  - `rankSuggestions` gains one score row: **own or favorite → +2**, reason `"Es una receta de ustedes"` (own) or `"Es una de sus favoritas"` (favorite; own wins if both). Reasons order: urgency, then this one, then novelty.
  - `validateOwnRecipe({ title, ingredients, steps }) → string|null` (the first error, in Spanish, or null): blank title → `"Poné un nombre."`; no ingredients → `"Agregá al menos un ingrediente."`; an ingredient without product → `"Elegí el producto de cada ingrediente."`; a product repeated → `` `${name} está dos veces: dejalo en un solo renglón.` `` (ingredients carry `product_name` for this); no non-blank step → `"Escribí al menos un paso."`.
  - `ownRecipeSteps(steps: string[]) → string`: non-blank steps, trimmed, joined with `"\n\n"`. Reading back uses `recipeSteps`.

- [ ] **Step 1: Write failing tests:**
  - `favorites and own recipes go up`: A (`favorite: true`) and B, otherwise equal and never cooked → A first, A's reasons `['Es una de sus favoritas', 'No lo cocinan hace meses']`; with `own: true` the reason is `'Es una receta de ustedes'`; own and favorite → only the own reason, still +2.
  - `validateOwnRecipe`: each error above in that order of checks; a valid input → null.
  - `validateOwnRecipe rejects a repeated product`: two ingredients with product 7 named `Cebolla` → `'Cebolla está dos veces: dejalo en un solo renglón.'`.
  - `own steps survive a round trip`: `recipeSteps(ownRecipeSteps(['2 huevos batidos con sal', ' ', 'Cocinar\nvuelta y vuelta']))` → `['2 huevos batidos con sal', 'Cocinar vuelta y vuelta']`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `recipeSteps` already reads `"2 huevos…\n\nCocinar…"` as paragraphs (its numbered-list rule needs `1.` or `1)`); do not change `steps.js`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat: rank favorites and own recipes; own recipe checks`.

### Task 3: Favorites on screen

**Files:**
- Create: `src/lib/recipes.js`
- Modify: `src/lib/today.js` (`loadRecipePage` also returns `favorite: boolean` and `recipe.household_id`), `src/screens/Recipe.jsx`, `src/screens/More.jsx`, `src/index.css`

**Interfaces:**
- Produces (`src/lib/recipes.js`, same style as `today.js`):
  - `setFavorite(householdId, recipeId, on: boolean)`: insert or delete the `favorites` row.
  - `loadFavorites() → [{ recipe_id, recipe: { id, title } }]`, newest first.

Screen behavior:
- Recipe: a star button next to the title, `aria-pressed`, `aria-label` "Favorita"; filled when favorite. Optimistic toggle; on error roll back and toast `saveErrorMessage`. Toast "Guardada en favoritas" when turned on.
- Más: section "Favoritas" (after "Siempre hay en casa"): rows linking to `/recipe/<id>`, same style as "Lo que cocinaron"; empty: "Todavía no marcaron favoritas. Tocá la estrella en una receta."

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS, no new warnings (the >500 kB chunk advisory is known).
- [ ] **Step 3: Commit**: `feat: favorite recipes`.

### Task 4: Own recipe form

**Files:**
- Create: `src/screens/RecipeForm.jsx`, `src/components/IngredientPicker.jsx`
- Modify: `src/lib/recipes.js`, `src/screens/Recipe.jsx`, `src/screens/More.jsx`, `src/App.jsx` (routes `/recipes/new` and `/recipe/:id/edit`, both with `household`), `src/index.css`

**Interfaces:**
- Consumes: `validateOwnRecipe`, `ownRecipeSteps` (Task 2); `recipeSteps`; `searchProducts`; `NewProductForm` and `createProduct` (stage 2b); `loadBasics` (products list); `BackButton`; `useToast`.
- Produces (`src/lib/recipes.js`):
  - `saveOwnRecipe(recipeId|null, input: OwnRecipeInput) → number`: `rpc('save_own_recipe', { recipe_id, title, minutes, servings, steps: ownRecipeSteps(input.steps), ingredients })`.
  - `deleteOwnRecipe(id)`: delete the recipe row.
  - `loadOwnRecipes() → [{ id, title }]`: recipes with `household_id` not null (RLS limits them to the household), by title.

Screen behavior (`RecipeForm`):
- Title "Nueva receta" or "Editar receta"; "‹ Volver".
- Fields: "Nombre" (required), "Minutos" and "Porciones" (optional whole numbers > 0).
- "Ingredientes": one `IngredientPicker` row each: a product search (`searchProducts` over the household's products, results as a short list; tapping one sets it), a "Principal / Para condimentar" switch (default Principal), and "Cómo lo dice la receta" (optional; defaults to the product name when saving). "Agregar ingrediente" adds a row; each row has "Quitar". No product found → `Crear "<texto>"` opens `NewProductForm`; the created product is selected.
- "Pasos": one textarea per step, "Agregar paso", each with "Quitar".
- Sticky "Guardar": `validateOwnRecipe` first (show the error under the button, `role="alert"`); then `saveOwnRecipe`; on success go to `/recipe/<id>` (replace) and toast "Receta guardada"; on error toast `saveErrorMessage` and stay. Double-tap guard (ref + disabled).
- Edit mode loads the recipe (`loadRecipe`) and fills the form; steps from `recipeSteps`.

Recipe screen for an own recipe (`recipe.household_id` not null): "Editar" (to `/recipe/<id>/edit`) and "Borrar receta". Deleting removes its history and favorite (cascade), so it can't be undone: first tap turns the button into "Tocá de nuevo para borrar" for 4 seconds; second tap deletes, goes to `/` and toasts "Receta borrada". This is the one exception to "undo instead of confirm" (the cascade makes Undo impossible).

Más: section "Mis recetas" (before "Favoritas"): button "Nueva receta" (`/recipes/new`) and rows linking to each own recipe; empty: "Todavía no cargaron recetas propias."

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 3: Commit**: `feat: write and edit your own recipes`.

### Task 5: Production

Every step here touches production: ask the user before each.

- [ ] **Step 1: README**: setup lists `2026-10-25-propias.sql` after the hoy migration; structure lists the new files. Commit: `docs: README for favorites and own recipes`.
- [ ] **Step 2: User runs** the migration in the SQL Editor **in short blocks** (each ending in `commit;`, each followed by a `to_regclass`/`to_regprocedure` check). Claude then confirms via the API: `favorites` answers `42501`/`401`, not `PGRST205`/`404`.
- [ ] **Step 3: Merge and push** after the user's ok; wait for the deploy.
- [ ] **Step 4: User checks** on the phone: star a recipe, see it in Más → Favoritas and as "Es una de sus favoritas" on Hoy when it can be made; write an own recipe with one new product, edit it, see it in Hoy with "Es una receta de ustedes"; delete it with two taps.

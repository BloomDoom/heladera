# Heladera — Cocina: Heladera, Freezer y Alacena (diseño)

Builds on `2026-10-21-heladera-design.md`. That document's §11 ("Ideas anotadas para cuando escale: Alacena") is taken up here, together with a freezer.

## 1. Why

The big idea of the project, in the user's words: **"tener la cocina virtualizada"** ("to have the kitchen virtualized"). Each thing appears in the app where it really is.

Today the Heladera screen shows everything in one list. Rice and pasta sit next to the milk, and that does not look like the real kitchen. The freezer does not exist at all, even though meat lives there.

Success: opening the app feels like opening the right door of your kitchen.

## 2. Goals, non-goals, anti-goals

**Goals**
- Three places: **Heladera**, **Freezer** and **Alacena**. Each item in the kitchen is in exactly one of them.
- Loading purchases puts each product in its usual place. The place can be changed while loading, and moved later.
- Expiry information that fits each place:
  - Heladera: as today.
  - Freezer: long dates.
  - Alacena: quiet, it only speaks up when something is about to go off.
- Everything in the three places counts as "at home" for the dish suggestions (Hoy), the shopping list and the week dishes.

**Non-goals (this round)**
- Thawing. The user said: "Its my part of the game to defroze it." Taking something out of the freezer does nothing in the app. Meat goes from the freezer straight to the pot, and cooking it uses it up. It never passes through the Heladera.
- A notification reminding the user to take something out of the freezer. This is a **Could** in the user's MoSCoW. It needs real push notifications on iPhone, which is a project of its own. Later.
- Quantities, and splitting one product across two places. A product is in one place at a time.

**Anti-goals**
- Extra steps for meat. The user rejected any in-between step: "Going to the fridge meanwhile seems helpless."
- Dates in the Alacena that clutter the list.

## 3. What the user decided

- **Layout (option A from the mock-up):** the screen has tabs at the top, **Heladera · Freezer · Alacena**. Each tab shows how many things it holds, and only one place is shown at a time.
  - The mock-up is the artifact "Cocina virtual", https://claude.ai/artifact/GRR2LJ3DFiBUm9sJ83Nw7T, artboard A.
- **The bottom tab is renamed from "Heladera" to "Cocina".**
- **Usual place per product:**
  - Meat, chicken, fish and frozen food go to the **Freezer**.
  - Pantry products (almacén, condimentos, bebidas, panadería) go to the **Alacena**.
  - Everything else goes to the **Heladera**.
- **Meat goes to the Freezer by default, even if it will be eaten today.**
- **Loading purchases ("Cargar lo comprado"):** each chosen product shows its place as a small label before "Agregar N". Tapping the label changes the place.
- **Moving later:** opening a row in Cocina, the same place where the expiry is edited today, offers to move it to each of the other two places.
- **The Freezer gives a longer expiry.**
- **What is in the Alacena** counts for suggestions and the shopping list. "Se acabó" sends it to the list, the same as from the Heladera.
- **Own products** get a usual place when they are created. The new-product form already asks Heladera or Alacena; Freezer is added.

## 4. Behavior in detail

**The Cocina screen.** It is reached from the bottom tab "Cocina". Its route stays `/fridge`.

| Tab | Row shows | Order |
|---|---|---|
| Heladera | as today ("Entró hace N días", plus the warning when close to expiring) | most urgent first, as today |
| Freezer | `Hasta el DD/MM` (the estimated date), plus a warning once it is close | the one that expires first comes first |
| Alacena | only the warning, when close or past ("Vence mañana") | warnings first, then by name |

- The "Cargar lo comprado" button stays on the screen.
- The tab that is open is remembered while the app is open. When the app starts, it opens on Heladera.

**Freezer expiry.**
- The estimated date is the date the item went into the freezer plus **90 days**, unless a date was set by hand. The 90 days apply to every product in the Freezer; frozen products today already have 90.
- "Close to expiring" follows the existing rule: 2 days or fewer.

**Moving.**
- Moving an item restarts its time in the new place: it counts as entering that place today.
- A date set by hand is cleared when the item moves.
- No purchase is recorded.
- Undo puts it back where it was, with its old dates.

**Loading again a product that is already at home** (in any place):
- It renews the item, as today.
- It goes to the place chosen while loading.

**"Guardar en la heladera" on the shopping list.**
- Ticked products go to their **usual place**, not all of them to the Heladera.
- The button text becomes "Guardar N en la cocina".

**Existing data in production.**
- Items already loaded move to their usual place, by the rule above.
- Meat that is in the "fridge" today therefore moves to the Freezer. It keeps the date it entered.

**Hoy (dish suggestions).**
- Items in all three places count as at home.
- "Vence pronto" urgency keeps working for any item that is close to its date, wherever it is.
- When a suggested dish uses something from the Freezer, the card adds the reason line `<Producto> está en el freezer`, so the user can plan the thawing. The reason is the user's job.

**Shopping list, week dishes, "¿Se acabó algo?"** These work for all three places with no change in behavior.

## 4b. Builder's calls (settled after the builder check, not decided by the user)

1. **Expiry by place.**
   - The Freezer uses 90 days.
   - The Heladera and the Alacena use the product's `shelf_days`, as today.
   - So meat moved from the Freezer to the Heladera gets its normal 2–3 days, counted from the move.
2. **Each item's place lives on the item:** a new column on `fridge_items`.
   - `products.storage` stays the *usual* place.
   - The two can differ after a move.
3. **The usual place:**
   - The base products of the categories carne, pollo, pescado and congelado get `storage = 'freezer'`, in `products.json` and in production.
   - The household's own products of those categories are backfilled the same way.
4. **Existing items in production** take the usual place of their product.
   - Items that move to the Freezer this way lose a date set by hand.
   - Their date of entry is kept.
5. **Adding to the fridge without a place:** a call to `add_to_fridge` that gives no place puts each product in its usual place. `store_checked` (the shopping cart) does the same.
6. **The freezer reason on Hoy cards is one line** naming every used Freezer item:
   - one item: `Pollo está en el freezer`.
   - more than one: `Pollo y carne picada están en el freezer`.
7. **Freezer items are part of "¿Se acabó algo?"** after cooking, so cooking can use them up. They are also part of "Se acabó" on the Cocina screen.

## 5. Constraints

The constraints of the main design still hold:
- Rioplatense Spanish in the UI.
- RLS per household.
- No new dependencies.
- Undo instead of confirmation dialogs.
- Touch targets of at least 48px.
- Production SQL handed to the user in short blocks, each ending in `commit;`.

## 6. Left to the builder

- **How the place is stored.**
  - The products' `storage` (`fridge`/`pantry` today) gains `freezer`, and the base dictionary is updated, both in `products.json` and in production.
  - Each fridge item gets its place.
  - The names, the migration shape and how `add_to_fridge` receives the chosen places are the builder's call. Existing callers must keep working.
- Exact styling of the tabs and of the place label in "Cargar lo comprado", following the mock-up and the app's tokens.
- The exact wording of the move buttons ("Pasar al freezer", "Pasar a la alacena", "Pasar a la heladera") and the undo toast.

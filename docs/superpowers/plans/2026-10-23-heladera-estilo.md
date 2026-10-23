# Estilo: puerta blanca + pantalla — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app as the user's white fridge door (light) and a dark-grey fridge with a display (dark), with a switch in Más.

**Architecture:**
- A small `src/lib/theme.js` reads, saves and applies the theme. It sets `data-theme` on `<html>`, and an inline script in `index.html` does the same before React renders.
- `src/index.css` gets one token set per theme. Every screen's styles use only tokens.
- Door objects are pure CSS, tied to existing class names: magnets, sticky notes, tape and the handle in light; the display panel and lit dots in dark.
- The only new UI pieces are the logo, the Más switch and a read-only "Vence pronto" strip on Hoy.

**Tech Stack:** React 19, Vite 8, plain CSS, `node --test`, Fontsource fonts.

**Spec:** `docs/superpowers/specs/2026-10-23-heladera-estilo-design.md`

**Mockup:** https://claude.ai/artifact/8NKyjHYvpLZcPnSN21xXDP
- Light: artboard "C · Puerta de la heladera".
- Dark: artboard "C oscuro · Heladera con pantalla".
- Local copies: `Puerta.dc.html` and `Noche.dc.html` under the session scratchpad `estilo/project/`. The controller passes their paths.

## Global Constraints

- Rioplatense Spanish in all UI copy.
- No new runtime dependencies except the three font packages:
  - `@fontsource-variable/rethink-sans` 5.x
  - `@fontsource-variable/caveat` 5.x
  - `@fontsource/chakra-petch` 5.x, weights 500 and 600
- `@fontsource-variable/nunito` is removed.
- Touch targets at least 48px (`--tap`). Text contrast at least 4.5:1 on its own background, in both themes.
- Sizes in `rem`. Keep `font: -apple-system-body` on `html` (iOS Dynamic Type). Keep the safe-area padding.
- The light theme is the default. The theme is saved per device in `localStorage` under the key `heladera-theme`, with values `'light'` / `'dark'`.
- Caveat is light-only, for short notes. Chakra Petch is dark-only, for short readouts (dates, "mañana", "25 min"), never sentences. Everything else uses Rethink Sans 400/600/800.
- No gradient washes, no all-caps labels, no emoji, no images for textures (CSS or inline SVG only).
- Motion only in response to user actions, and it respects `prefers-reduced-motion`.
- Behavior and copy stay as they are. The only additions are the Más switch and the Hoy "Vence pronto" strip (Task 5).
- Token values are exactly the spec §4 tables.

## Review Focus

1. **Large iPhone text size (Dynamic Type at the biggest setting).** Tilted cards, sticky notes and the shopping note must wrap, not clip or overflow under the handle. Checked in the Task 6 and 7 screenshots at `html { font-size: 26px }`.
2. **Storage blocked** (private mode, or `localStorage` throws). The app opens in light and the switch still works for the session. Tested in Task 1.
3. **Swiping the tilted Hoy card.** SuggestionCard sets an inline `transform` for the swipe. The tilt must use the CSS `rotate` property, not `transform`, or the swipe erases it. Checked in Task 6.
4. **Every token pair in both themes passes 4.5:1.** That covers text on background, on card, on note and on display, button text on the button, and muted text. Tested in Task 2.
5. **Switching themes in Más** changes the whole app and the `theme-color` meta at once, without a reload. Tested in Task 1 and checked in Task 4.

---

## File Structure

- `src/lib/theme.js` (new): `THEMES`, `THEME_COLORS`, `readTheme`, `saveTheme`, `applyTheme`.
- `src/lib/tests/theme.test.js` (new).
- `src/lib/tests/contrast.test.js` (new): parses `src/index.css` token blocks.
- `index.html`: inline pre-render theme script, metas.
- `vite.config.js`: manifest colors.
- `src/main.jsx`: font imports.
- `src/index.css`: tokens per theme, base, and all screen styles.
- `src/components/Logo.jsx` (new).
- `src/components/ThemeSwitch.jsx` (new); `src/screens/More.jsx` uses it.
- `src/lib/freshness.js`: adds `soonItems`; `src/screens/Today.jsx` shows the strip.
- `scripts/icons/` (new): `icon.svg`, `icon-maskable.svg`, `render.sh`. Outputs go to `public/*.png`.

---

### Task 1: Theme core

**Files:**
- Create: `src/lib/theme.js`, `src/lib/tests/theme.test.js`
- Modify: `index.html`, `vite.config.js`

**Interfaces:**
- Produces:
  - `THEMES = ['light', 'dark']`
  - `THEME_COLORS = { light: '#fbfbfa', dark: '#2b2e33' }`
  - `readTheme(storage) -> 'light'|'dark'`
  - `saveTheme(storage, theme) -> void`, which never throws
  - `applyTheme(theme, doc = document) -> void`: sets `doc.documentElement.dataset.theme`, sets `doc.documentElement.style.colorScheme` to `'light'|'dark'`, and sets the `content` of `meta[name="theme-color"]` to `THEME_COLORS[theme]`.
  - `STORAGE_KEY = 'heladera-theme'`

- [ ] **Step 1: Write the failing tests** in `src/lib/tests/theme.test.js`, using a fake storage object and a fake `doc`:
  - `readTheme returns light when nothing is saved`: `readTheme(fakeStorage({}))` is `'light'`.
  - `readTheme returns the saved theme`: `{ 'heladera-theme': 'dark' }` gives `'dark'`.
  - `readTheme ignores unknown values`: `'blue'` gives `'light'`.
  - `readTheme survives storage that throws`: a storage whose `getItem` throws gives `'light'`. So does `readTheme(undefined)`.
  - `saveTheme survives storage that throws`: it does not throw.
  - `applyTheme sets data-theme, color-scheme and the meta color`: after `applyTheme('dark', doc)`, `dataset.theme === 'dark'`, `style.colorScheme === 'dark'`, and the meta `content === '#2b2e33'`.

- [ ] **Step 2: Run** `node --test src/lib/tests/theme.test.js`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/theme.js`** with the interface above. Use the same comment style as the other `src/lib` files.

- [ ] **Step 4: Run** `node --test src/lib/tests/theme.test.js`. Expected: PASS.

- [ ] **Step 5: Change `index.html`:**
  - `color-scheme` meta content: `light dark`.
  - `theme-color` meta: `#fbfbfa`.
  - `apple-mobile-web-app-status-bar-style`: `default`.
  - Add a small inline `<script>` in `<head>`. It reads `localStorage['heladera-theme']` inside `try/catch` and sets `document.documentElement.dataset.theme` to `'dark'` only when the value is `'dark'`, else `'light'`. If dark, it also updates the theme-color meta. A comment says it runs before React so there is no flash.

- [ ] **Step 6: Change `vite.config.js`:** set the manifest `background_color` and `theme_color` to `'#fbfbfa'`.

- [ ] **Step 7: Run** `npm test` and `npm run build`. Expected: all tests pass, and the build succeeds.

- [ ] **Step 8: Commit** with `feat: theme core (light/dark, saved per device)`.

### Task 2: Tokens, fonts and base for both themes

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/main.jsx`, `src/index.css` (the `:root` block, base, buttons, inputs, tab bar, toast, sheet, segmented, chips)
- Create: `src/lib/tests/contrast.test.js`

**Interfaces:**
- Consumes: `data-theme` on `<html>` (Task 1).
- Produces these CSS custom properties, defined under `:root, [data-theme='light']` and under `[data-theme='dark']`. Later tasks use only these.
  - Surfaces: `--bg`, `--surface`, `--border`, `--text`, `--muted`.
  - Buttons: `--primary` (tomato button), `--primary-text`, `--danger` (tomato text on the surface).
  - States: `--warn` (soon), `--freezer` (blue text), `--ok` (green).
  - Notes: `--note` and `--note-ink` (light: sticky `#fff4b8` / `#3a3420`; dark: display `#111316` / `#eef1f4`).
  - Handle: `--handle`, `--handle-shade`.
  - Tab bar: `--tab-bg`, `--tab-active-bg`, `--tab-active-text`.
  - Fonts: `--font-ui`, `--font-note` (light: Caveat; dark: same as `--font-ui`), `--font-readout` (dark: Chakra Petch; light: same as `--font-ui`).
  - Existing `--tap`, `--tab-bar-height` and `--radius` stay.
  - The exact hex values come from the spec §4 tables.

- [ ] **Step 1: Write the failing test** in `src/lib/tests/contrast.test.js`:
  - It reads `src/index.css`.
  - It extracts `--name: #hex` pairs from the light block (`[data-theme='light']`) and from the dark block (`[data-theme='dark']`).
  - It computes the WCAG contrast ratio. Each of these pairs must be at least 4.5, in both themes:
    - `text/bg`, `text/surface`, `muted/bg`, `muted/surface`
    - `primary-text/primary`
    - `danger/surface`, `warn/surface`, `freezer/surface`, `ok/surface`
    - `note-ink/note`
    - `tab-active-text/tab-active-bg`
  - In light, `warn` is a text color that passes on white, derived from the amber; the yellow is only the note fill.
  - Test name: `every token pair passes 4.5:1 in <theme>`. A failure message names the pair and its ratio.

- [ ] **Step 2: Run** `node --test src/lib/tests/contrast.test.js`. Expected: FAIL, because the current CSS has no theme blocks.

- [ ] **Step 3: Swap the fonts.**
  - Run `npm uninstall @fontsource-variable/nunito`.
  - Run `npm install @fontsource-variable/rethink-sans @fontsource-variable/caveat @fontsource/chakra-petch`.
  - In `main.jsx`, import `@fontsource-variable/rethink-sans`, `@fontsource-variable/caveat`, `@fontsource/chakra-petch/500.css` and `@fontsource/chakra-petch/600.css`. Update the comment above them.

- [ ] **Step 4: Rewrite the tokens and base styles in `src/index.css`.** Both theme blocks, plus:
  - `body` uses `var(--font-ui)`.
  - **Light:** the handle is a fixed `body::after` bar on the right edge (14px wide, `--handle` with `--handle-shade` inset), vertically around the middle third of the screen, under the tab bar. It has `pointer-events: none`.
  - **Dark:** the handle is a flush 10px recessed bar. The body background adds brushed vertical lines with `repeating-linear-gradient` in `#30343a` / `#272a2e`. That is a texture, not a wash.
  - `.screen` gets enough right padding that content clears the handle: `padding-right: calc(1rem + 28px)`.
  - The tab bar uses `--tab-bg`. The active tab is a pill (`--tab-active-bg` / `--tab-active-text`). Icons stay.
  - Buttons, inputs, `.segmented`, `.chip*`, `.toast` and `.sheet` use only tokens. `.chip-soon` and `.chip-over` use `--warn` and `--danger`.
  - Remove the old comment saying "The app is always dark".
  - Replace every hard-coded color elsewhere in the file with a token. Check with `grep -n "#[0-9a-fA-F]\{3,6\}" src/index.css`: the only hits should be inside the two theme blocks and the brushed-lines rule.

- [ ] **Step 5: Run** `npm test`, then `npm run build`. Expected: PASS, and the build succeeds.

- [ ] **Step 6: Screenshot check.**
  - Run `npm run dev`. Open `/#/fridge` at 390×844, once with `localStorage['heladera-theme']` = `'light'` and once with `'dark'`. If login blocks the screen, open the Login screen instead.
  - Save both shots in the task report folder.
  - Expected: white door with the handle, and dark brushed steel. Text is readable and nothing sits under the handle.

- [ ] **Step 7: Commit** with `feat: puerta and pantalla tokens, fonts and base styles`.

### Task 3: Logo and app icons

**Files:**
- Create: `src/components/Logo.jsx`, `scripts/icons/icon.svg`, `scripts/icons/icon-maskable.svg`, `scripts/icons/render.sh`
- Modify: `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`, `public/favicon.png`, `src/screens/Login.jsx` (it uses the logo), `src/index.css` (`.logo`)

**Interfaces:**
- Produces: `<Logo />` (default export, no props). It renders an inline SVG mark plus the wordmark "heladera".
  - It has `className="logo"` and `role="img"` with `aria-label="Heladera"`. The wordmark is part of the label, so it is not read twice.
  - It draws both variants and CSS shows one per theme (`[data-theme='dark'] .logo-light { display: none }` and the reverse):
    - **Light:** the white fridge outline in `--text`, the handle in `#9aa0a6` and a tomato magnet `#c03a2b`. Paths as in `Puerta.dc.html` (the 30×40 viewBox).
    - **Dark:** the grey fridge, a `#7cc4ff` display, a `#ff6b57` magnet. Paths as in `Noche.dc.html`.
  - Wordmark: Rethink Sans 800, `letter-spacing: -0.03em`.

- [ ] **Step 1: Create `Logo.jsx`** and the `.logo*` CSS. Use it at the top of `Login.jsx` in place of the current logo, and remove the old logo element and its CSS.

- [ ] **Step 2: Create `scripts/icons/icon.svg`** (512×512).
  - The light fridge mark, centered on a `#fbfbfa` square.
  - The mark fills about 70% of the height.
  - Stroke width scaled so it reads at 32px.

- [ ] **Step 3: Create `scripts/icons/icon-maskable.svg`.** It is the same mark inside the central 60% safe zone, with a full-bleed `#fbfbfa` background.

- [ ] **Step 4: Write `scripts/icons/render.sh`.**
  - It renders each SVG with headless Edge (`"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu --hide-scrollbars --window-size=W,H --screenshot=OUT file:///…svg`). It writes `icon-512.png` (512), `icon-192.png` (192), `icon-maskable-512.png` (512), `apple-touch-icon.png` (180) and `favicon.png` (32) into `public/`.
  - A header comment says it runs once by hand and is not part of the build.
  - Run it.

- [ ] **Step 5: Check the PNGs.** Open each with the Read tool. Expected: the fridge with the tomato magnet, centered, not cropped, and the background not transparent black.

- [ ] **Step 6: Run** `npm run build`. Expected: success.

- [ ] **Step 7: Commit** with `feat: fridge logo and app icons`.

### Task 4: The switch in Más

**Files:**
- Create: `src/components/ThemeSwitch.jsx`
- Modify: `src/screens/More.jsx`, `src/index.css` (only if `.segmented` needs a spacing tweak)

**Interfaces:**
- Consumes: `readTheme`, `saveTheme`, `applyTheme`, `STORAGE_KEY` (Task 1).
- Produces: `<ThemeSwitch />`, no props. It shows a `.segmented` group with two buttons, "Puerta blanca" (`light`) and "Pantalla" (`dark`), with `aria-pressed` on the chosen one. The group has an `aria-label` of `Estilo`.

- [ ] **Step 1: Implement `ThemeSwitch`.**
  - Initial state is `readTheme(window.localStorage)`, wrapped so a throwing getter yields `undefined`.
  - Tapping a button calls `applyTheme(t)` and then `saveTheme(...)`.

- [ ] **Step 2: Add it to `More.jsx`.** Put it under a new `<h2>Estilo</h2>` section, after "Favoritas" and "Lo que cocinaron" and before the logout button.

- [ ] **Step 3: Run** `npm test` and `npm run build`. Expected: PASS, and success.

- [ ] **Step 4: Browser check.** Run `npm run dev`, open Más and tap "Pantalla". Expected:
  - The whole app turns dark at once.
  - `document.querySelector('meta[name=theme-color]').content` is `#2b2e33`.
  - After a reload it is still dark. Tap "Puerta blanca" and it goes back.
  - If login blocks Más, check through the console with `applyTheme` and record that in the report.

- [ ] **Step 5: Commit** with `feat: puerta blanca / pantalla switch in Más`.

### Task 5: "Vence pronto" on Hoy

**Files:**
- Modify: `src/lib/freshness.js`, `src/lib/tests/freshness.test.js`, `src/screens/Today.jsx`, `src/index.css`

**Interfaces:**
- Consumes: `freshness(item, today)` and `freshnessText(f, place)` (existing).
- Produces: `soonItems(items, today, max = 3) -> Array<{ name, when, status }>`.
  - Items with status `'soon'` or `'over'`, in any place, most urgent first.
  - `name` is `item.product.name`.
  - `when` is the warning text lower-cased for the note: `'mañana'`, `'hoy'`, `'en 2 días'`, `'venció ayer'`. That is `freshnessText(...).warning` with a leading `Vence ` removed, and the rest lower-cased.
  - At most `max` entries.

- [ ] **Step 1: Write failing tests** in `freshness.test.js`:
  - `soonItems lists soon and over items, most urgent first`: an item over by 1 day, one due tomorrow and one fine. Expected `[{name, when: 'venció ayer', status: 'over'}, {name, when: 'mañana', status: 'soon'}]`.
  - `soonItems keeps at most max`: five soon items with `max` 3 give length 3.
  - `soonItems is empty when nothing is close`.

- [ ] **Step 2: Run** `node --test src/lib/tests/freshness.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement `soonItems`.**

- [ ] **Step 4: Run** the same tests. Expected: PASS.

- [ ] **Step 5: Show the strip in `Today.jsx`.**
  - It goes under the `h1` and "Buscar receta", and only when `load.data` has at least one soon item.
  - Markup: `<aside className="soon-note" aria-label="Vence pronto"><h2>Vence pronto</h2><ul>` with one `<li>` per item: `<span>{name}</span> <span className="soon-when">{when}</span>`.
  - There are no links and no buttons. It is read-only.

- [ ] **Step 6: Style `.soon-note` in `index.css`:**
  - **Light:** a sticky note. `--note` background, `--note-ink` text, `--font-note`, about `rotate: -2deg`, and a tape strip via `::before` in `rgba(205,210,214,0.75)`.
  - **Dark:** the display panel. `--note` (`#111316`) background, `1px solid var(--border)`, radius 20px, and `box-shadow: inset 0 0 0 4px #1a1c20`.
    - Each `<li>` gets a lit dot through `::before`: `#ff6b57` with a glow for `over` and `soon` items due today or tomorrow, else `#f5b942`. Put `data-status` on the `<li>` for this.
    - `.soon-when` is in `--font-readout`.

- [ ] **Step 7: Run** `npm test` and `npm run build`. Expected: PASS, and success.

- [ ] **Step 8: Commit** with `feat: vence pronto note on Hoy`.

### Task 6: Door objects on Hoy and Receta

**Files:**
- Modify: `src/index.css` (`.suggestion-card*`, `.today-*`, `.recipe-*`, `.step-number`, `.favorite-btn`)

**Interfaces:**
- Consumes: the Task 2 tokens.
- Produces: no new class names. These styles only.

- [ ] **Step 1: Style the Hoy suggestion card.**
  - **Light:** white paper with a `1px` `--border`, radius 4px, a soft drop shadow (`0 10px 18px -14px` in a text-tinted rgba) and `rotate: -1.2deg`. Use the **`rotate` property, not `transform`**, because SuggestionCard sets an inline `transform` while swiping. Add a tomato magnet: a `::before` circle 30px in `#c03a2b`, centered on the top edge, with a lighter highlight.
  - **Dark:** glass panel: `--surface`, `1px solid var(--border)`, radius 18px, no tilt, no magnet.
  - The freezer reason line uses `--freezer`. In dark it gets a `#7cc4ff` lit dot.

- [ ] **Step 2: Style Receta.**
  - **Light:** the title block is a paper card held by a magnet, like Hoy. The steps list is lined paper: `repeating-linear-gradient` horizontal rules in `--border` at the line height. `.step-number` is a small tomato circle.
  - **Dark:** a glass panel for the title. The steps are plain rows on `--surface`, and `.step-number` uses `--font-readout`.
  - "(falta)" uses `--danger`.

- [ ] **Step 3: Screenshot check.**
  - Open Hoy and a recipe at 390×844 in both themes, and again with `html { font-size: 26px }` set in devtools.
  - Drag the Hoy card a little and confirm the tilt stays during the swipe.
  - Expected: nothing clipped and nothing under the handle. Save the shots to the report.

- [ ] **Step 4: Commit** with `feat: magnets and paper on Hoy and Receta`.

### Task 7: Door objects on Cocina, Compras and the rest

**Files:**
- Modify: `src/index.css` (`.fridge-*`, `.segmented` inside `.fridge-screen`, `.shop-*`, `.add-*`, `.tile*`, `.place-btn`, `.more-*`, `.history-list`, `.basic-chip`, `.form-*`, `.ingredient-*`, `.login*`, `.sheet*`)

**Interfaces:**
- Consumes: the Task 2 tokens.
- Produces: no new class names. The only markup change allowed: if a place tab needs it, add `data-place="fridge|freezer|pantry"` to the Cocina tab buttons and list in `src/screens/Fridge.jsx`.

- [ ] **Step 1: Cocina.**
  - The three tabs look like three doors: tall-ish rounded-top buttons. The pressed door is lifted and shows its place tone. The place tone also tints the list background faintly.
    - **Light:** Heladera white; Freezer blue-grey `#e6edf5` with `--freezer` text; Alacena light wood `#f1e3cf` with `#5a3a20` text.
    - **Dark:** Heladera `--surface`; Freezer `#1d2630`; Alacena `#2a241d`.
    - Check every tone pair passes 4.5:1 and note the ratios in the report.
  - Rows stay clean rows: no tilt and no magnets.

- [ ] **Step 2: Compras.**
  - **Light:** the list is one long paper note: white, with a tape strip at the top via `::before`. The group titles and item names use `--font-note` at about 1.35rem.
    - The ticked item's line-through becomes a marker line: `text-decoration-thickness: 0.18em`, color `#c03a2b`.
    - `.shop-reason` stays in `--font-ui`, muted.
    - Remove `text-transform: uppercase` from `.shop-group`, per the no-all-caps constraint.
  - **Dark:** plain glass rows. Item names stay in `--font-ui`.

- [ ] **Step 3: Everything else** (Cargar lo comprado, Más, the forms, Login, the sheets, toasts) uses tokens only. It gets one door object at most per screen, for example a magnet on the Login logo card in light. Nothing is tilted.

- [ ] **Step 4: Screenshot check.**
  - Open Cocina (all three tabs), Compras with ticked items, Cargar lo comprado, Más and a recipe form.
  - Check each in both themes, and at `font-size: 26px`.
  - Expected: readable, nothing clipped and nothing under the handle. Save the shots to the report.

- [ ] **Step 5: Run** `npm test` and `npm run build`. Expected: PASS, and success.

- [ ] **Step 6: Commit** with `feat: doors for Cocina, paper note for Compras, rest of the app`.

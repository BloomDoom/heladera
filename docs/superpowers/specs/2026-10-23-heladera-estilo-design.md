# Heladera — Estilo: la puerta de la heladera (diseño)

Builds on `2026-10-21-heladera-design.md`. It changes how the app looks and adds a light/dark switch. It changes no behavior and no data.

## 1. Why

The user's words: the app looks like "the AI style! Its so overseen already. I want something unique. I want to see the logo and think of my kitchen! I want to see the colors and feel hungry and full at the same time."

Today the app is near-black with a green accent, the most generic look there is.

The new look comes from the user's real kitchen:
- a white fridge with a grey handle,
- a marble counter,
- a wooden cutting board with a tomato, an onion and a sharp knife.

Success: the user opens the app and thinks of their kitchen. The colors make them hungry.

## 2. Goals, non-goals, anti-goals

**Goals**
- Two themes, both chosen by the user from the mockup:
  - **Light: "Puerta"**, the white fridge door with magnets and notes.
  - **Dark: "Pantalla"**, a modern dark-grey fridge with a display.
- A switch in **Más** to choose between them.
- A new logo and app icon: the fridge with a tomato magnet.
- Every screen restyled: Hoy, Cocina, Compras, Receta, Más, the forms, Login, the sheets and toasts.

**Non-goals (this round)**
- A Settings screen. The user said a settings screen "would be good later". For now the switch lives in Más.
- Following the phone's light/dark setting automatically. The user chose a manual switch.
- Changes to behavior, copy, routes or data.

**Anti-goals**
- The generic AI look: near-black with one neon accent, identical rounded cards with soft grey shadows, gradient washes, all-caps labels, emoji.
- Handwriting where text must be read fast. It is only for short notes.
- Losing what works: big tap targets, readable text, iPhone text-size support.

## 3. What the user decided

- **Mockup:** the artifact "Estilo de la cocina", https://claude.ai/artifact/8NKyjHYvpLZcPnSN21xXDP.
  - Artboard **C · Puerta de la heladera** is the light theme.
  - Artboard **C oscuro · Heladera con pantalla** is the dark theme.
  - Artboards A and B were rejected.
- **The light theme is the white door:**
  - A white background with the grey handle drawn on the right edge.
  - Marker-black text. Tomato red for main buttons and anything urgent.
  - Dish cards are paper cards held by a magnet, slightly crooked.
  - "Vence pronto" is a yellow sticky note in handwriting.
  - The user approved this list of screens:
    - **Compras:** the list is a paper note held with tape, in handwriting. A ticked item gets crossed out with a marker line.
    - **Cocina:** the Heladera / Freezer / Alacena tabs look like three doors. Freezer has a cool blue-grey tone. Alacena has a light wood tone. Items stay as clean rows.
    - **Receta:** a recipe card held by a magnet, with the steps on lined paper.
    - **Magnet colors carry meaning:** red is urgent or tomato, blue is freezer, green is fine.
- **The dark theme is a different fridge.** In the user's words: "more modern and dark grey. more technological, can have a display."
  - Brushed dark-grey steel, with a flat handle sunk into the right edge.
  - A display panel at the top of Hoy with the logo, the date and "Vence pronto" as readouts, each with a small lit dot.
  - Cards are dark glass panels. The main button stays tomato red.
  - There are no magnets, notes or handwriting in this theme.
- **The switch:** it lives in Más. The app opens in the light theme until the user changes it.

## 4. Visual system

The two themes share one structure: the same layout, sizes, main font and logo shape. They differ in tokens and in "door objects" (magnets, notes, tape in light; the display and lit dots in dark).

**Fonts** (they replace Nunito and stay bundled with the app, so they work offline):
- **Rethink Sans**: all UI text in both themes. Weights 400, 600 and 800.
- **Caveat**: light theme only, for short handwritten notes (Vence pronto, the shopping list's items and title). Weights 600 and 700.
- **Chakra Petch**: dark theme only, for short display readouts (dates, "mañana", "25 min"). Weights 500 and 600. It is never used for sentences.

**Light tokens** (from the mockup):

| Role | Hex |
|---|---|
| Door background | `#fbfbfa` |
| Card / paper | `#ffffff`, border `#e1e3e5` |
| Text | `#26292c` |
| Muted text | `#5c6268` |
| Handle | `#b9bec4`, shade `#9aa0a6` |
| Tomato (buttons, urgent) | `#c03a2b`; text on white `#962b1f` |
| Freezer blue | `#3d5f8a` |
| Leaf green | `#3e7b3a` |
| Sticky note | `#fff4b8`, ink `#3a3420` |
| Tab bar | `#eef0f1`, active pill `#26292c` with white text |

**Dark tokens** (from the mockup):

| Role | Hex |
|---|---|
| Steel background | `#2b2e33`, brushed lines `#30343a` / `#272a2e` |
| Display panel | `#111316`, border `#3a3e44` |
| Card / glass | `#1f2226`, border `#3a3e44` |
| Text | `#eef1f4` |
| Muted text | `#a9b1ba` |
| Tomato button | `#c93b2e`; tomato text and dot `#ff8a7a` / `#ff6b57` |
| Amber (soon) | `#f5b942`, text `#f5c96a` |
| Freezer blue | dot `#7cc4ff`, text `#8ccdff` |
| Tab bar | `#1b1d20`, active pill `#eef1f4` with dark text |

**Logo.** A small fridge outline with a tomato magnet, plus the wordmark "heladera" in Rethink Sans 800.
- The dark variant is the grey fridge with a blue display.
- The app icon (home screen, favicon, maskable) uses the light variant.

## 5. Constraints

The main design's constraints still hold:
- Rioplatense Spanish in the UI.
- No new runtime dependencies. Font packages are the only exception, see §7.
- Touch targets of at least 48px.
- Text contrast of at least 4.5:1 on its own background, in both themes.
- iOS Dynamic Type keeps working: sizes in `rem`, `-apple-system-body` on `html`.
- Safe areas are respected.
- Works offline as a PWA.

## 6. Left to the builder

- How each screen applies the door objects, following §3 and the mockup.
  - Not every element needs a magnet. One or two per screen is enough.
  - Tilt is small (about 1–2°) and never on rows or inputs.
- The tab bar icons: keep them or restyle them in line with the themes.
- The exact wording of the switch in Más.
- How the handle and the brushed lines are drawn: CSS or inline SVG, never images that cost download weight.
- Motion: none needed. If any is used, it respects `prefers-reduced-motion`.

## 7. Builder's calls (mine, not the user's; check them)

1. **Where the choice is saved:** on the device, in `localStorage`, not in Supabase. Each phone keeps its own theme. If reading it fails, the app uses light.
2. **How the theme is applied:**
   - A `data-theme="light|dark"` attribute on `<html>`, set before React renders, so there is no flash.
   - CSS tokens per theme.
   - `color-scheme` follows the theme.
   - The `theme-color` meta follows the theme, so the iPhone status bar matches.
3. **Manifest colors:** the manifest's `background_color` and `theme_color` become the light door color `#fbfbfa`.
4. **Fonts:**
   - `@fontsource-variable/nunito` is replaced by Fontsource packages for Rethink Sans, Caveat and Chakra Petch. Variable versions are used where they exist.
   - Only the Latin subset is imported, so the app stays small.
5. **App icons:**
   - The PNGs in `public/` (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, `favicon`) are redrawn from the new logo.
   - They are rendered once and committed. No new build step.
6. **The Más switch:** a two-option segmented control, "Puerta blanca" / "Pantalla". It uses the existing `.segmented` pattern and applies right away.
7. **Screens beyond Hoy:** the mockup only covers Hoy. The other screens follow the descriptions in §3.
8. **Colors not in the tables:**
   - Error, toast and success colors come from the listed tomato, amber, blue and green.
   - Each one keeps 4.5:1 contrast in its theme.
9. **The handle:**
   - It is drawn once, globally.
   - Every screen gets enough right padding that content never sits under it. The mockup uses 44px.
10. **iPhone status bar:**
    - `apple-mobile-web-app-status-bar-style` changes from `black` to `default`, so the light theme gets dark status text.
    - iOS home-screen apps may ignore a `theme-color` that changes at runtime. If so, the status bar stays light in the dark theme.
    - This is checked on the phone and reported. It is not worked around.

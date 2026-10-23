// Light ("Puerta blanca") or dark ("Pantalla"). Each phone keeps its own
// choice in localStorage; the app opens light until someone changes it.

export const THEMES = ['light', 'dark']
export const STORAGE_KEY = 'heladera-theme'

// The phone's status bar color for each theme (same as the background).
export const THEME_COLORS = { light: '#fbfbfa', dark: '#2b2e33' }

// Storage can be missing or throw (private mode): then it's light.
export function readTheme(storage) {
  try {
    const saved = storage?.getItem(STORAGE_KEY)
    return THEMES.includes(saved) ? saved : 'light'
  } catch {
    return 'light'
  }
}

export function saveTheme(storage, theme) {
  try {
    storage?.setItem(STORAGE_KEY, theme)
  } catch {
    // Not saved: the theme still applies until the app is closed.
  }
}

export function applyTheme(theme, doc = document) {
  const root = doc.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  const meta = doc.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = THEME_COLORS[theme]
}

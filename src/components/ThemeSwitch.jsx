import { useState } from 'react'
import { currentTheme, saveTheme, applyTheme } from '../lib/theme.js'

const OPTIONS = [
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Oscuro' },
]

// Reading localStorage itself can throw (blocked site data): then there is none.
function storage() {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

// "Claro" or "Oscuro": changes the whole app at once and is
// remembered on this phone.
export default function ThemeSwitch() {
  const [theme, setTheme] = useState(() => currentTheme())

  function choose(next) {
    setTheme(next)
    applyTheme(next)
    saveTheme(storage(), next)
  }

  return (
    <div className="segmented theme-switch" role="group" aria-label="Estilo">
      {OPTIONS.map((o) => (
        <button key={o.key} aria-pressed={theme === o.key} onClick={() => choose(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// The app's mark: our fridge with a tomato magnet, and the name.
// Both versions are drawn; the CSS shows the one that fits the theme:
// the white door in light, the dark fridge with a display in dark.
export default function Logo() {
  return (
    <span className="logo" role="img" aria-label="Heladera">
      <svg className="logo-mark logo-light" viewBox="0 0 30 40" aria-hidden="true">
        <rect x="2" y="2" width="26" height="36" rx="5" fill="#ffffff" stroke="currentColor" strokeWidth="2.4" />
        <path d="M2 14H28" stroke="currentColor" strokeWidth="2.4" />
        <path d="M22 6V10M22 18V28" stroke="#9aa0a6" strokeWidth="3" strokeLinecap="round" />
        <circle cx="10" cy="24" r="4" fill="#c03a2b" />
      </svg>
      <svg className="logo-mark logo-dark" viewBox="0 0 30 40" aria-hidden="true">
        <rect x="2" y="2" width="26" height="36" rx="5" fill="#2b2e33" stroke="currentColor" strokeWidth="2.2" />
        <rect x="7" y="8" width="12" height="8" rx="2" fill="#7cc4ff" />
        <path d="M23 8V30" stroke="#9aa0a6" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="12" cy="26" r="3.5" fill="#ff6b57" />
      </svg>
      <span className="logo-name" aria-hidden="true">heladera</span>
    </span>
  )
}

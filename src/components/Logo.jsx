// The app's mark and the name. Both versions are drawn; the CSS shows the
// one that fits the theme: in Claro, our white fridge with a tomato magnet
// and a note held by a green magnet (also the app icon, scripts/icons);
// in Oscuro, the grey fridge with a display, without magnets.
export default function Logo() {
  return (
    <span className="logo" role="img" aria-label="Heladera">
      <svg className="logo-mark logo-light" viewBox="22 6 56 90" aria-hidden="true">
        <rect x="24" y="8" width="52" height="86" rx="9" fill="#ffffff" stroke="currentColor" strokeWidth="4" />
        <path d="M24 37H76" stroke="currentColor" strokeWidth="4" />
        <path d="M68 15V29M68 44V66" stroke="#9aa0a6" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="37" cy="23" r="7" fill="#c03a2b" />
        <circle cx="34.5" cy="20.5" r="2" fill="#e06a5c" />
        <path d="M33 15.5Q37 18 41 15.5" fill="none" stroke="#3e7b3a" strokeWidth="2.4" strokeLinecap="round" />
        <g transform="rotate(-7 44 57)">
          <rect x="31" y="45" width="26" height="24" fill="#fff4b8" />
          <path d="M35 55H52M35 61H48" stroke="#a89a55" strokeWidth="2.2" strokeLinecap="round" />
        </g>
        <circle cx="43" cy="46" r="4" fill="#3e7b3a" />
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

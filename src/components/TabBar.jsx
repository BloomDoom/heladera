import { NavLink } from 'react-router-dom'

// Simple line icons (from the Lucide icon set), drawn inline so we
// don't need an icon library.
const icons = {
  // a plate with fork and knife
  today: <><circle cx="12" cy="12" r="6" /><path d="M2 3v6a2 2 0 0 0 2 2M4 3v18M22 3v18M22 3c-1.5 1-2 3-2 6s.5 4 2 4" /></>,
  // a fridge
  fridge: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M5 10h14M9 5v2M9 13v3" /></>,
  // a shopping cart
  shopping: <><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>,
  // three dots
  more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
}

export const tabs = [
  { to: '/', label: 'Hoy', icon: 'today' },
  { to: '/fridge', label: 'Cocina', icon: 'fridge' },
  { to: '/shopping', label: 'Compras', icon: 'shopping' },
  { to: '/more', label: 'Más', icon: 'more' },
]

export default function TabBar() {
  return (
    <nav className="tab-bar">
      {tabs.map((tab) => (
        // "end" makes "/" only active on the Hoy screen itself.
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="tab">
          <svg viewBox="0 0 24 24" aria-hidden="true">{icons[tab.icon]}</svg>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

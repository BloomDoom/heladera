import { signOut } from '../lib/supabase.js'

// The household, who's in it, and logging out.
export default function More({ household }) {
  return (
    <main className="screen">
      <h1>Más</h1>
      <h2>{household.name}</h2>
      <p className="muted">{household.members.map((m) => m.display_name).join(' y ')}</p>
      <button className="btn-secondary" onClick={signOut}>
        Cerrar sesión
      </button>
    </main>
  )
}

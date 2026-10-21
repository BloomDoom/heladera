import { supabase } from '../lib/supabase.js'

// A login with no household (e.g. a zona-fit login): there's nothing to
// show, so explain it and let them log out.
export default function NoHousehold() {
  return (
    <main className="screen center">
      <p>Tu usuario todavía no tiene un hogar en la Heladera.</p>
      <p className="muted">Pedile a quien armó la app que te agregue.</p>
      <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </button>
    </main>
  )
}

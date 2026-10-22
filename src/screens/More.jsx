import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from '../lib/supabase.js'
import { useLoad } from '../lib/useLoad.js'
import { loadBasics, loadHistory, setAssumed } from '../lib/today.js'
import { loadFavorites } from '../lib/recipes.js'
import { formatDate } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import AssumedEditor from '../components/AssumedEditor.jsx'

// Basics, history and favorites, loaded in parallel.
async function loadMore() {
  const [basics, history, favorites] = await Promise.all([loadBasics(), loadHistory(), loadFavorites()])
  return { ...basics, history, favorites }
}

// The household, who's in it, what's always at home, what was cooked, and logging out.
export default function More({ household }) {
  const showToast = useToast()
  const load = useLoad(loadMore, [])
  // null until the first edit: until then the loaded overrides are shown.
  const [local, setLocal] = useState(null)
  const latest = useRef(null) // same as `local`, but updated at once, even between renders
  const overrides = local ?? load.data?.overrides ?? []

  function put(productId, entry) {
    const base = latest.current ?? load.data.overrides
    latest.current = [...base.filter((o) => o.product_id !== productId), ...(entry ? [entry] : [])]
    setLocal(latest.current)
  }

  // Changes only this product, and on failure puts back only this product,
  // so another change still in flight is not undone.
  async function change(product, assumed) {
    const base = latest.current ?? load.data.overrides
    const previous = base.find((o) => o.product_id === product.id)
    put(product.id, { product_id: product.id, assumed })
    try {
      await setAssumed(household.id, product.id, assumed)
    } catch (error) {
      put(product.id, previous)
      showToast(saveErrorMessage(error))
    }
  }

  return (
    <main className="screen more-screen">
      <h1>Más</h1>
      <h2>{household.name}</h2>
      <p className="muted">{household.members.map((m) => m.display_name).join(' y ')}</p>
      <LoadState {...load} />
      {load.data && (
        <>
          <h2>Siempre hay en casa</h2>
          <AssumedEditor products={load.data.products} overrides={overrides} onChange={change} />
          <h2>Favoritas</h2>
          {load.data.favorites.length === 0 ? (
            <p className="empty">Todavía no marcaron favoritas. Tocá la estrella en una receta.</p>
          ) : (
            <ul className="history-list">
              {load.data.favorites.map((row) => (
                <li key={row.recipe_id}>
                  <Link to={`/recipe/${row.recipe.id}`}>{row.recipe.title}</Link>
                </li>
              ))}
            </ul>
          )}
          <h2>Lo que cocinaron</h2>
          {load.data.history.length === 0 ? (
            <p className="empty">Todavía no cocinaron nada con la app.</p>
          ) : (
            <ul className="history-list">
              {load.data.history.map((row) => (
                <li key={row.id}>
                  <Link to={`/recipe/${row.recipe.id}`}>
                    {formatDate(row.cooked_on)} · {row.recipe.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button className="btn-secondary more-logout" onClick={signOut}>
        Cerrar sesión
      </button>
    </main>
  )
}

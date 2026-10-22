import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from '../lib/supabase.js'
import { useLoad } from '../lib/useLoad.js'
import { loadBasics, loadHistory, setAssumed } from '../lib/today.js'
import { formatDate } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import AssumedEditor from '../components/AssumedEditor.jsx'

// Basics and history, loaded in parallel.
async function loadMore() {
  const [basics, history] = await Promise.all([loadBasics(), loadHistory()])
  return { ...basics, history }
}

// The household, who's in it, what's always at home, what was cooked, and logging out.
export default function More({ household }) {
  const showToast = useToast()
  const load = useLoad(loadMore, [])
  const [overrides, setOverrides] = useState([])

  // Work on a copy, so a chip changes at once and goes back if saving fails.
  useEffect(() => {
    if (load.data) setOverrides(load.data.overrides)
  }, [load.data])

  async function change(product, assumed) {
    const previous = overrides
    setOverrides([...overrides.filter((o) => o.product_id !== product.id), { product_id: product.id, assumed }])
    try {
      await setAssumed(household.id, product.id, assumed)
    } catch (error) {
      setOverrides(previous)
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

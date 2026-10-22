import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadSuggestionsData, rejectRecipe } from '../lib/today.js'
import { rankSuggestions } from '../lib/suggest.js'
import { todayISO } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import SuggestionCard from '../components/SuggestionCard.jsx'

const STALE_MS = 30 * 60 * 1000 // away longer than this: the suggestions are old

// "¿Qué comemos hoy?": the screen the app opens on. Proposes one dish at a time.
export default function Today({ household }) {
  const navigate = useNavigate()
  const showToast = useToast()
  // "Today" is read once per load, so loading and ranking agree on the date.
  const load = useLoad(async () => {
    const today = todayISO()
    return { today, ...(await loadSuggestionsData(today)) }
  }, [])
  const [skipped, setSkipped] = useState([]) // skipped during this visit

  // When the app comes back (iPhone PWAs stay alive for days), reload if the
  // day changed or it was away for a while, and show the skipped dishes again.
  const loadedToday = useRef(null)
  loadedToday.current = load.data?.today
  const reloadRef = useRef(load.reload)
  reloadRef.current = load.reload
  useEffect(() => {
    let hiddenAt = null
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt
      hiddenAt = null
      if (loadedToday.current === undefined) return
      if (todayISO() !== loadedToday.current || away > STALE_MS) {
        setSkipped([])
        reloadRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const suggestions = useMemo(() => (load.data ? rankSuggestions(load.data) : []), [load.data])
  const current = suggestions.find((s) => !skipped.includes(s.recipeId))

  async function skip(recipeId) {
    setSkipped((ids) => (ids.includes(recipeId) ? ids : [...ids, recipeId]))
    try {
      await rejectRecipe(household.id, recipeId, todayISO())
    } catch (error) {
      // The card stays gone: it was skipped for this visit anyway.
      showToast(saveErrorMessage(error))
    }
  }

  return (
    <main className="screen">
      <h1>¿Qué comemos hoy?</h1>
      <LoadState {...load} />
      {load.data && current && (
        <SuggestionCard
          key={current.recipeId}
          suggestion={current}
          onSkip={() => skip(current.recipeId)}
          onOpen={() => navigate(`/recipe/${current.recipeId}`)}
        />
      )}
      {load.data && !current && suggestions.length > 0 && (
        <div className="empty">
          <p>No hay más platos con lo que hay. Probá de nuevo más tarde o cargá lo que compraste.</p>
          <button className="btn-secondary" onClick={() => setSkipped([])}>
            Ver de nuevo
          </button>
          <Link to="/fridge/add" className="link-button">Cargar lo comprado</Link>
        </div>
      )}
      {load.data && suggestions.length === 0 && (
        <>
          <p className="empty">
            {load.data.items.length === 0
              ? 'Cargá lo que hay en la heladera para ver qué cocinar.'
              : 'Con lo que hay no sale ningún plato. Cargá lo que compraste.'}
          </p>
          <button className="btn-primary today-add" onClick={() => navigate('/fridge/add')}>
            Cargar lo comprado
          </button>
        </>
      )}
    </main>
  )
}

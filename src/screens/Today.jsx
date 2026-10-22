import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadSuggestionsData, rejectRecipe } from '../lib/today.js'
import { rankSuggestions } from '../lib/suggest.js'
import { todayISO } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import SuggestionCard from '../components/SuggestionCard.jsx'

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

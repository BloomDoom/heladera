import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { addRecipeToList, loadWeek, removeRecipeItems } from '../lib/shopping.js'
import { listedMessage, rankWeek } from '../lib/shoppingList.js'
import { loadRecipeSearch } from '../lib/today.js'
import { searchByMissing, missingLine } from '../lib/recipeSearch.js'
import { plural, todayISO } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import BackButton from '../components/BackButton.jsx'
import SuggestionCard from '../components/SuggestionCard.jsx'

const MAX_PICKS = 4

// "Platos de la semana": dishes a few products away. Picking one lists what it lacks.
export default function WeekDishes() {
  const navigate = useNavigate()
  const showToast = useToast()
  const load = useLoad(async () => {
    const today = todayISO()
    return { today, ...(await loadWeek(today)) }
  }, [])
  const [skipped, setSkipped] = useState([]) // skipped or picked during this visit
  const [picks, setPicks] = useState(0)
  const [retry, setRetry] = useState(0) // remounts the card after a failed pick
  const busy = useRef(false) // a pick is being saved

  const deck = useMemo(() => (load.data ? rankWeek(load.data) : []), [load.data])
  const current = deck.find((c) => !skipped.includes(c.recipe_id))

  // The search covers the whole recipe book, which only loads once someone
  // starts typing: most visits only swipe.
  const [query, setQuery] = useState('')
  const [book, setBook] = useState({ status: 'idle' }) // idle | loading | ready | error
  const searching = query.trim() !== ''
  function loadBook() {
    if (book.status === 'loading' || book.status === 'ready') return
    setBook({ status: 'loading' })
    loadRecipeSearch().then(
      (data) => setBook({ status: 'ready', ...data }),
      () => setBook({ status: 'error' }),
    )
  }
  // What each dish lacks: the week's candidates know up to 3 names; the
  // ones that can be made already lack nothing; the rest lack more.
  const missingById = useMemo(() => {
    const map = new Map()
    if (book.status === 'ready') for (const id of book.makeableIds) map.set(id, [])
    for (const c of load.data?.candidates ?? []) map.set(c.recipe_id, c.missing_names)
    return map
  }, [book, load.data])
  const results =
    book.status === 'ready' && searching ? searchByMissing(book.recipes, query, missingById) : []

  function drop(recipeId) {
    setSkipped((ids) => (ids.includes(recipeId) ? ids : [...ids, recipeId]))
  }

  // A dish from the search goes the same way as one picked on the card.
  function pickFound(recipe) {
    setQuery('')
    pick({ recipe_id: recipe.id, title: recipe.title, missing_names: recipe.missing ?? [] })
  }

  async function pick(candidate) {
    if (busy.current) return
    busy.current = true
    try {
      const ids = await addRecipeToList(candidate.recipe_id, load.data.today)
      drop(candidate.recipe_id)
      if (ids.length === 0) {
        showToast(`No falta nada más para ${candidate.title}`)
      } else {
        // The names are only known when every missing product was added.
        const message =
          ids.length === candidate.missing_names.length
            ? listedMessage(candidate.missing_names)
            : `A la lista: ${plural(ids.length, 'producto', 'productos')}`
        showToast(message, async () => {
          try {
            await removeRecipeItems(candidate.recipe_id, ids)
          } catch (error) {
            showToast(saveErrorMessage(error))
          }
        })
      }
      const next = picks + 1
      setPicks(next)
      if (next >= MAX_PICKS) navigate('/shopping', { replace: true })
    } catch (error) {
      setRetry((n) => n + 1)
      showToast(saveErrorMessage(error))
    } finally {
      busy.current = false
    }
  }

  const done = () => navigate('/shopping', { replace: true })

  return (
    <main className="screen">
      <BackButton fallback="/shopping" />
      <h1>Platos de la semana</h1>
      <LoadState {...load} />
      {load.data && (
        <p className="muted week-counter">{`Elegidos: ${picks} de ${MAX_PICKS}`}</p>
      )}
      {load.data && (
        <input
          type="search"
          className="week-search"
          aria-label="Buscar un plato"
          placeholder="Buscar un plato"
          value={query}
          onFocus={loadBook}
          onChange={(e) => {
            loadBook()
            setQuery(e.target.value)
          }}
        />
      )}
      {searching && book.status === 'loading' && <p className="muted">Buscando…</p>}
      {searching && book.status === 'error' && (
        <p className="error">No se pudo cargar el recetario. Revisá la conexión y probá de nuevo.</p>
      )}
      {searching && book.status === 'ready' && results.length === 0 && (
        <p className="empty">No encontramos ningún plato con ese nombre.</p>
      )}
      {results.length > 0 && (
        <ul className="history-list search-results">
          {results.map((recipe) => (
            <li key={recipe.id}>
              <button type="button" onClick={() => pickFound(recipe)}>
                <span className="search-title">{recipe.title}</span>
                <span className="search-meta">
                  <span className={recipe.missing?.length === 0 ? 'chip chip-ok' : 'muted'}>
                    {missingLine(recipe.missing)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {load.data && !searching && current && (
        <SuggestionCard
          key={`${current.recipe_id}-${retry}`}
          suggestion={{
            recipeId: current.recipe_id,
            title: current.title,
            minutes: current.minutes,
            reasons: [`Falta: ${current.missing_names.join(', ')}`],
          }}
          openLabel="Lo elijo"
          onSkip={() => drop(current.recipe_id)}
          onOpen={() => pick(current)}
        />
      )}
      {load.data && !searching && !current && <p className="empty">No hay más platos para elegir.</p>}
      {load.data && (
        <button className="btn-secondary week-done" onClick={done}>Listo</button>
      )}
    </main>
  )
}

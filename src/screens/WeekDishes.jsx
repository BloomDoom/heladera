import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { addRecipeToList, listedMessage, loadWeek, removeFromList } from '../lib/shopping.js'
import { rankWeek } from '../lib/shoppingList.js'
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

  function drop(recipeId) {
    setSkipped((ids) => (ids.includes(recipeId) ? ids : [...ids, recipeId]))
  }

  async function pick(candidate) {
    if (busy.current) return
    busy.current = true
    try {
      const ids = await addRecipeToList(candidate.recipe_id, load.data.today)
      drop(candidate.recipe_id)
      if (ids.length === 0) {
        showToast(`Ya tienen todo para ${candidate.title}`)
      } else {
        // The names are only known when every missing product was added.
        const message =
          ids.length === candidate.missing_names.length
            ? listedMessage(candidate.missing_names)
            : `A la lista: ${plural(ids.length, 'producto', 'productos')}`
        showToast(message, async () => {
          try {
            await Promise.all(ids.map((id) => removeFromList(id)))
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
      {load.data && current && (
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
      {load.data && !current && <p className="empty">No hay más platos para elegir.</p>}
      {load.data && (
        <button className="btn-secondary week-done" onClick={done}>Listo</button>
      )}
    </main>
  )
}

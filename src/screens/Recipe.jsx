import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadRecipePage, markCooked, undoCooked } from '../lib/today.js'
import { setFavorite, deleteOwnRecipe } from '../lib/recipes.js'
import { finishItem, restoreItem } from '../lib/fridge.js'
import { removeFromList } from '../lib/shopping.js'
import { todayISO } from '../lib/format.js'
import { recipeSteps } from '../lib/steps.js'
import { readOwnSteps } from '../lib/ownRecipe.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import BackButton from '../components/BackButton.jsx'
import FinishedSheet from '../components/FinishedSheet.jsx'

// A recipe, and the "Lo cocinamos" button that records it as cooked.
export default function Recipe({ household }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  const load = useLoad(() => loadRecipePage(id), [id])
  const [cookedId, setCookedId] = useState(null) // set once the dish is recorded
  const [saving, setSaving] = useState(false)
  const sending = useRef(false) // blocks a second tap before React re-renders
  const finishing = useRef(false) // same, for "Listo" / "Nada se acabó"

  // null until the first tap: until then the loaded value is shown.
  const [localFavorite, setLocalFavorite] = useState(null)
  const togglingFavorite = useRef(false) // blocks a tap while the last one is saving

  // Own recipes: the delete button is armed by a first tap, for 4 seconds.
  const [armed, setArmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const armTimer = useRef(null)
  const removing = useRef(false)
  useEffect(() => () => clearTimeout(armTimer.current), [])

  const { recipe, items, assumedIds } = load.data ?? {}
  const favorite = localFavorite ?? load.data?.favorite ?? false

  // Optimistic: flips the star at once and puts it back if saving fails.
  async function toggleFavorite() {
    if (togglingFavorite.current) return
    togglingFavorite.current = true
    const next = !favorite
    setLocalFavorite(next)
    try {
      await setFavorite(household.id, recipe.id, next)
      if (next) showToast('Guardada en favoritas')
    } catch (error) {
      // Already a favorite from another device: that is what was asked for.
      if (next && error?.code === '23505') {
        showToast('Guardada en favoritas')
      } else {
        setLocalFavorite(!next)
        showToast(saveErrorMessage(error))
      }
    } finally {
      togglingFavorite.current = false
    }
  }

  // Deleting also removes the history and the favorite, so there is no Undo:
  // it asks for a second tap instead.
  async function removeRecipe() {
    if (removing.current) return
    if (!armed) {
      setArmed(true)
      clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    removing.current = true
    clearTimeout(armTimer.current)
    setDeleting(true)
    try {
      await deleteOwnRecipe(recipe.id)
    } catch (error) {
      showToast(saveErrorMessage(error))
      removing.current = false
      setDeleting(false)
      setArmed(false)
      return
    }
    navigate('/', { replace: true })
    showToast('Receta borrada')
  }

  // The recipe's products that are in the fridge, in recipe order, once each.
  function fridgeItemsOfRecipe() {
    const seen = new Set()
    const list = []
    for (const ing of recipe.ingredients) {
      const item = items.find((i) => i.product_id === ing.product_id)
      if (item && !seen.has(item.product_id)) {
        seen.add(item.product_id)
        list.push(item)
      }
    }
    return list
  }

  async function cook() {
    if (sending.current) return
    sending.current = true
    setSaving(true)
    let row
    try {
      row = await markCooked(household.id, recipe.id, todayISO())
    } catch (error) {
      showToast(saveErrorMessage(error))
      sending.current = false
      setSaving(false)
      return
    }
    // Stays blocked from here on: the dish is recorded, only the sheet is left.
    if (fridgeItemsOfRecipe().length === 0) {
      await done(row.id, [])
      return
    }
    setCookedId(row.id)
    setSaving(false)
  }

  // Finishes the chosen items, leaves the screen and offers Undo.
  async function done(recordedId, chosen) {
    if (finishing.current) return
    finishing.current = true
    setSaving(true)
    const finished = []
    const listedIds = [] // finished items that went onto the shopping list
    let failed = false
    for (const item of chosen) {
      try {
        const listed = await finishItem(item.product_id, todayISO())
        finished.push(item)
        if (listed) listedIds.push(item.product_id)
      } catch (error) {
        failed = true
        console.error(saveErrorMessage(error), error)
      }
    }
    navigate('/', { replace: true })
    // One toast, with Undo even when some items could not be finished.
    const message = failed
      ? 'Anotado, pero no se pudo sacar todo. Revisalo en Heladera.'
      : `Anotado: ${recipe.title}`
    showToast(message, async () => {
      // Every step runs on its own, so one failure doesn't strand the rest.
      const results = await Promise.allSettled([
        undoCooked(recordedId),
        ...finished.map((item) => restoreItem(household.id, item)),
        ...listedIds.map((id) => removeFromList(id)),
      ])
      const rejected = results.find((r) => r.status === 'rejected')
      if (rejected) showToast(saveErrorMessage(rejected.reason))
    })
  }

  const steps = recipe ? (recipe.household_id != null ? readOwnSteps(recipe.steps) : recipeSteps(recipe.steps)) : []
  const main = recipe ? recipe.ingredients.filter((i) => i.is_main) : []
  const minor = recipe ? recipe.ingredients.filter((i) => !i.is_main) : []
  const isMissing = (ing) =>
    ing.product_id != null &&
    !items.some((i) => i.product_id === ing.product_id) &&
    !assumedIds.has(ing.product_id)

  function ingredientList(list) {
    return (
      <ul className="recipe-ingredients">
        {list.map((ing, index) => (
          <li key={index}>
            {ing.line}
            {isMissing(ing) && <span className="recipe-missing"> (falta)</span>}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main className="screen recipe-screen">
      <BackButton fallback="/" />
      <LoadState {...load} />
      {recipe && (
        <>
          <div className="recipe-title">
            <h1>{recipe.title}</h1>
            <button
              className="favorite-btn"
              aria-pressed={favorite}
              aria-label="Favorita"
              onClick={toggleFavorite}
            >
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path
                  d="M12 2.5l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.7l-6.1 3.4 1.4-6.8L2.2 9.6l6.9-.8z"
                  fill={favorite ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          {(recipe.minutes > 0 || recipe.servings > 0) && (
            <p className="muted recipe-meta">
              {[
                recipe.minutes > 0 && `${recipe.minutes} min`,
                recipe.servings > 0 && `${recipe.servings} ${recipe.servings === 1 ? 'porción' : 'porciones'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <h2>Ingredientes</h2>
          {ingredientList(main)}
          {minor.length > 0 && (
            <>
              <h3>Para condimentar</h3>
              {ingredientList(minor)}
            </>
          )}
          {steps.length > 0 && (
            <>
              <h2>Preparación</h2>
              <ol className="recipe-steps">
                {steps.map((step, index) => (
                  <li key={index}>
                    <span className="step-number" aria-hidden="true">{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
          {recipe.source && (
            <p className="muted recipe-source">
              Receta de{' '}
              {recipe.source_url ? (
                <a href={recipe.source_url} target="_blank" rel="noopener">
                  {recipe.source}
                </a>
              ) : (
                recipe.source
              )}
            </p>
          )}
          {recipe.household_id != null && (
            <div className="own-actions">
              <Link className="btn-secondary btn-link" to={`/recipe/${recipe.id}/edit`}>
                Editar
              </Link>
              <button className="btn-secondary btn-danger" disabled={deleting} onClick={removeRecipe}>
                {armed ? 'Tocá de nuevo para borrar' : 'Borrar receta'}
              </button>
            </div>
          )}
          <div className="add-bar">
            <button className="btn-primary" disabled={saving || cookedId !== null} onClick={cook}>
              Lo cocinamos
            </button>
          </div>
          {cookedId !== null && (
            <FinishedSheet items={fridgeItemsOfRecipe()} busy={saving} onDone={(chosen) => done(cookedId, chosen)} />
          )}
        </>
      )}
    </main>
  )
}

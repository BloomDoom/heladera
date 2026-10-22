import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadRecipePage, markCooked, undoCooked } from '../lib/today.js'
import { finishItem, restoreItem } from '../lib/fridge.js'
import { todayISO } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import BackButton from '../components/BackButton.jsx'
import FinishedSheet from '../components/FinishedSheet.jsx'

// Paragraphs are separated by blank lines; a single line break is just wrapping.
function stepParagraphs(steps) {
  return (steps ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\n/g, ' '))
    .filter((p) => p !== '')
}

// A recipe, and the "Lo cocinamos" button that records it as cooked.
export default function Recipe({ household }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  const load = useLoad(() => loadRecipePage(id), [id])
  const [cookedId, setCookedId] = useState(null) // set once the dish is recorded
  const [saving, setSaving] = useState(false)
  const sending = useRef(false) // blocks a second tap before React re-renders

  const { recipe, items, assumedIds } = load.data ?? {}

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
    setSaving(true)
    const finished = []
    let failed = false
    for (const item of chosen) {
      try {
        await finishItem(item.product_id)
        finished.push(item)
      } catch (error) {
        failed = true
        showToast(saveErrorMessage(error))
      }
    }
    navigate('/', { replace: true })
    if (failed) return // the error toast stays; the dish is recorded anyway
    showToast(`Anotado: ${recipe.title}`, async () => {
      try {
        await undoCooked(recordedId)
        for (const item of finished) await restoreItem(household.id, item)
      } catch (error) {
        showToast(saveErrorMessage(error))
      }
    })
  }

  const paragraphs = recipe ? stepParagraphs(recipe.steps) : []
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
          <h1>{recipe.title}</h1>
          {(recipe.minutes || recipe.servings) && (
            <p className="muted recipe-meta">
              {[
                recipe.minutes && `${recipe.minutes} min`,
                recipe.servings && `${recipe.servings} ${recipe.servings === 1 ? 'porción' : 'porciones'}`,
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
          {paragraphs.length > 0 && (
            <>
              <h2>Preparación</h2>
              <div className="recipe-steps">
                {paragraphs.map((p, index) => (
                  <p key={index}>{p}</p>
                ))}
              </div>
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

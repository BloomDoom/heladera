import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadBasics, loadRecipe } from '../lib/today.js'
import { saveOwnRecipe } from '../lib/recipes.js'
import { createProduct } from '../lib/fridge.js'
import { validateOwnRecipe, readOwnSteps, wholeNumber } from '../lib/ownRecipe.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import BackButton from '../components/BackButton.jsx'
import NewProductForm from '../components/NewProductForm.jsx'
import IngredientPicker from '../components/IngredientPicker.jsx'

let nextKey = 0
const newKey = () => ++nextKey

const blankIngredient = () => ({ key: newKey(), product_id: null, product_name: '', line: '', is_main: true })

// The products always load; the recipe only when editing.
async function loadFormData(id) {
  const [basics, recipe] = await Promise.all([loadBasics(), id ? loadRecipe(id) : null])
  return { products: basics.products, recipe }
}

// Write a new recipe of your own, or edit one.
export default function RecipeForm({ household }) {
  const { id } = useParams()
  const load = useLoad(() => loadFormData(id), [id])
  const recipe = load.data?.recipe
  const editable = !id || (recipe && recipe.household_id === household.id)

  return (
    <main className="screen form-screen">
      <BackButton fallback={id ? `/recipe/${id}` : '/more'} />
      <h1>{id ? 'Editar receta' : 'Nueva receta'}</h1>
      <LoadState {...load} />
      {load.data && !editable && (
        <>
          <p>Esta receta no se puede editar.</p>
          <Link className="btn-secondary btn-link" to={`/recipe/${id}`}>Volver a la receta</Link>
        </>
      )}
      {/* Mounted only after loading, so a late load never overwrites what was typed. */}
      {load.data && editable && (
        <Editor household={household} recipe={recipe} initialProducts={load.data.products} />
      )}
    </main>
  )
}

function Editor({ household, recipe, initialProducts }) {
  const navigate = useNavigate()
  const showToast = useToast()
  const [products, setProducts] = useState(initialProducts)
  const [title, setTitle] = useState(recipe?.title ?? '')
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '')
  const [servings, setServings] = useState(recipe?.servings ? String(recipe.servings) : '')
  const [ingredients, setIngredients] = useState(() =>
    recipe
      ? recipe.ingredients.map((i) => ({
          key: newKey(),
          product_id: i.product_id,
          product_name: i.product?.name ?? '',
          // The product name is the default line: leave it blank so it follows the product.
          line: i.line === i.product?.name ? '' : i.line,
          is_main: i.is_main,
        }))
      : [blankIngredient()],
  )
  const [steps, setSteps] = useState(() => {
    const list = recipe ? readOwnSteps(recipe.steps) : []
    return (list.length ? list : ['']).map((text) => ({ key: newKey(), text }))
  })
  const [creatingFor, setCreatingFor] = useState(null) // { key, text } while "new product" is open
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const sending = useRef(false) // blocks a second tap before React re-renders

  const patchIngredient = (key, patch) =>
    setIngredients((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  // A blank line inside one step would read back as two steps.
  const changeStep = (key, text) =>
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, text: text.replace(/\n(\s*\n)+/g, '\n') } : s)))

  // Throws if saving fails: NewProductForm shows the error and stays open.
  async function create(fields) {
    const product = await createProduct(household.id, fields)
    setProducts((list) => [...list, product])
    patchIngredient(creatingFor.key, { product_id: product.id, product_name: product.name })
    setCreatingFor(null)
  }

  function pickExisting(product) {
    patchIngredient(creatingFor.key, { product_id: product.id, product_name: product.name })
    setCreatingFor(null)
  }

  async function submit() {
    if (sending.current) return
    const mins = wholeNumber(minutes)
    const portions = wholeNumber(servings)
    const stepTexts = steps.map((s) => s.text)
    const problem =
      Number.isNaN(mins) || Number.isNaN(portions)
        ? 'Minutos y porciones tienen que ser números enteros mayores a 0.'
        : validateOwnRecipe({ title, ingredients, steps: stepTexts })
    setError(problem)
    if (problem) return
    sending.current = true
    setSaving(true)
    let savedId
    try {
      savedId = await saveOwnRecipe(recipe?.id ?? null, {
        title,
        minutes: mins,
        servings: portions,
        steps: stepTexts,
        ingredients,
      })
    } catch (e) {
      showToast(saveErrorMessage(e))
      sending.current = false
      setSaving(false)
      return
    }
    showToast('Receta guardada')
    // After an edit, go back to the recipe already in the history.
    if (recipe && window.history.state?.idx > 0) navigate(-1)
    else navigate(`/recipe/${savedId}`, { replace: true })
  }

  if (creatingFor) {
    return (
      <NewProductForm
        products={products}
        initialName={creatingFor.text}
        onCreate={create}
        onPickExisting={pickExisting}
        onCancel={() => setCreatingFor(null)}
      />
    )
  }

  return (
    <>
      <label>
        Nombre
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Minutos (opcional)
        <input type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </label>
      <label>
        Porciones (opcional)
        <input type="text" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
      </label>

      <h2>Ingredientes</h2>
      <ul className="form-list">
        {ingredients.map((ing) => (
          <IngredientPicker
            key={ing.key}
            ingredient={ing}
            products={products}
            onChange={(patch) => patchIngredient(ing.key, patch)}
            onRemove={() => setIngredients((list) => list.filter((i) => i.key !== ing.key))}
            onCreate={(text) => setCreatingFor({ key: ing.key, text })}
          />
        ))}
      </ul>
      <button type="button" className="btn-secondary" onClick={() => setIngredients((l) => [...l, blankIngredient()])}>
        Agregar ingrediente
      </button>

      <h2>Pasos</h2>
      <ul className="form-list">
        {steps.map((step, index) => (
          <li key={step.key} className="step-row">
            <label>
              Paso {index + 1}
              <textarea rows="3" value={step.text} onChange={(e) => changeStep(step.key, e.target.value)} />
            </label>
            <button
              type="button"
              className="link-button"
              onClick={() => setSteps((list) => list.filter((s) => s.key !== step.key))}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secondary" onClick={() => setSteps((l) => [...l, { key: newKey(), text: '' }])}>
        Agregar paso
      </button>

      <div className="add-bar">
        {error && (
          <p className="error form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary" disabled={saving} onClick={submit}>
          Guardar
        </button>
      </div>
    </>
  )
}

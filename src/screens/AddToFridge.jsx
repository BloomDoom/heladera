import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadAddData, addToFridge, createProduct } from '../lib/fridge.js'
import { searchProducts, frequentProducts, groupByShop, PLACES, nextPlace, placeChoices } from '../lib/products.js'
import { todayISO, plural } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import BackButton from '../components/BackButton.jsx'
import NewProductForm from '../components/NewProductForm.jsx'

// "Sin ticket": pick what you bought and put it in the fridge.
export default function AddToFridge({ household }) {
  const navigate = useNavigate()
  const showToast = useToast()
  const load = useLoad(() => loadAddData(todayISO()), [])
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [chosen, setChosen] = useState({}) // id -> place, only what the person changed
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const sending = useRef(false) // blocks a second tap before React re-renders

  // Work on a copy, so a product created here shows up at once.
  useEffect(() => {
    if (load.data) setProducts(load.data.products)
  }, [load.data])

  function toggle(id) {
    setSelected((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setChosen((c) => {
      const rest = { ...c }
      delete rest[id]
      return rest
    })
  }

  function placeOf(product) {
    return chosen[product.id] ?? product.storage ?? 'fridge'
  }

  function select(id) {
    setSelected((set) => new Set(set).add(id))
  }

  // Throws if saving fails: the form shows the error and stays open.
  async function create(fields) {
    const product = await createProduct(household.id, fields)
    setProducts((list) => [...list, product])
    select(product.id)
    setCreating(false)
    setQuery('')
  }

  function pickExisting(product) {
    select(product.id)
    setCreating(false)
    setQuery('')
  }

  async function submit() {
    if (sending.current || selected.size === 0) return
    sending.current = true
    setSaving(true)
    try {
      await addToFridge([...selected], todayISO(), placeChoices(selected, chosen, new Map(products.map((p) => [p.id, p]))))
    } catch (error) {
      showToast(saveErrorMessage(error))
      sending.current = false
      setSaving(false)
      return
    }
    showToast(selected.size === 1 ? 'Listo, ya está en la cocina' : 'Listo, ya están en la cocina')
    navigate('/fridge', { replace: true })
  }

  const presentIds = load.data?.presentIds ?? new Set()
  const searching = query.trim() !== ''

  function tiles(list) {
    return (
      <ul className="tile-grid">
        {list.map((p) => (
          <li key={p.id}>
            <button className="tile" aria-pressed={selected.has(p.id)} onClick={() => toggle(p.id)}>
              <span>{p.name}</span>
              {presentIds.has(p.id) && <span className="tile-present">ya está</span>}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main className={`screen add-screen${selected.size > 0 ? ' add-screen--has-places' : ''}`}>
      <BackButton fallback="/fridge" />
      <h1>Cargar lo comprado</h1>
      <LoadState {...load} />
      {load.data && creating && (
        <NewProductForm
          products={products}
          initialName={query.trim()}
          onCreate={create}
          onPickExisting={pickExisting}
          onCancel={() => setCreating(false)}
        />
      )}
      {load.data && !creating && (
        <>
          <input
            type="search"
            aria-label="Buscar producto"
            placeholder="Buscar producto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching ? (
            <>
              {tiles(searchProducts(products, query))}
              <button className="btn-secondary add-create" onClick={() => setCreating(true)}>
                Crear "{query.trim()}"
              </button>
            </>
          ) : (
            <>
              <h2>Lo que comprás seguido</h2>
              {tiles(frequentProducts(products, load.data.purchases))}
              {groupByShop(products).map(({ shop, products: list }) => (
                <section key={shop.key}>
                  <h2>{shop.label}</h2>
                  {tiles(list)}
                </section>
              ))}
            </>
          )}
          <div className="add-bar">
            {selected.size > 0 && (
              <section className="add-places">
                <h2>Van a:</h2>
                <ul>
                  {products
                    .filter((p) => selected.has(p.id))
                    .map((p) => {
                      const label = PLACES.find((pl) => pl.key === placeOf(p))?.label
                      return (
                        <li key={p.id}>
                          <span>{p.name}</span>
                          <button
                            type="button"
                            className="place-btn"
                            aria-label={`${p.name}: ${label}. Cambiar lugar`}
                            onClick={() => setChosen((c) => ({ ...c, [p.id]: nextPlace(placeOf(p)) }))}
                          >
                            {label}
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </section>
            )}
            <button className="btn-primary" disabled={selected.size === 0 || saving} onClick={submit}>
              {selected.size === 0 ? 'Agregar' : `Agregar ${plural(selected.size, 'producto', 'productos')}`}
            </button>
          </div>
        </>
      )}
    </main>
  )
}

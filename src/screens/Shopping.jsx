import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { todayISO, plural } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { createProduct } from '../lib/fridge.js'
import {
  loadShopping,
  addToList,
  removeFromList,
  restoreListRow,
  setChecked,
  checkHabit,
  snooze,
  unsnooze,
  storeChecked,
  subscribeShopping,
} from '../lib/shopping.js'
import { habits, dueHabits, buildList } from '../lib/shoppingList.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import NewProductForm from '../components/NewProductForm.jsx'
import ShoppingAdd from '../components/ShoppingAdd.jsx'
import ShoppingRow from '../components/ShoppingRow.jsx'

// The shared shopping list. Changes show at once and are rolled back if saving fails.
export default function Shopping({ household }) {
  const showToast = useToast()
  const load = useLoad(async () => {
    const today = todayISO()
    return { today, ...(await loadShopping(today)) }
  }, [])
  const today = load.data?.today

  // Local copy of what can change on this screen; reset on every (re)load.
  const [rows, setRows] = useState([])
  const [snoozes, setSnoozes] = useState([])
  const [products, setProducts] = useState([])
  const [creatingFor, setCreatingFor] = useState(null)
  const [storing, setStoring] = useState(false)
  useEffect(() => {
    if (!load.data) return
    setRows(load.data.rows)
    setSnoozes(load.data.snoozes)
    setProducts(load.data.products)
  }, [load.data])

  // A remote change while one of our saves is in flight only marks a reload
  // as pending; it happens once the saves settle.
  const inflight = useRef(0)
  const pending = useRef(false)
  const reloadRef = useRef(load.reload)
  reloadRef.current = load.reload
  function reloadSoon() {
    if (inflight.current > 0) pending.current = true
    else reloadRef.current()
  }
  async function save(fn) {
    inflight.current += 1
    try {
      return await fn()
    } finally {
      inflight.current -= 1
      if (inflight.current === 0 && pending.current) {
        pending.current = false
        reloadRef.current()
      }
    }
  }

  const householdId = household.id
  useEffect(() => subscribeShopping(householdId, reloadSoon), [householdId])
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') reloadSoon()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const habitsMap = useMemo(() => (load.data ? habits(load.data.purchases) : new Map()), [load.data])
  const { groups, cart } = useMemo(() => {
    if (!load.data) return { groups: [], cart: [] }
    const due = dueHabits({
      habits: habitsMap,
      presentIds: load.data.presentIds,
      listedIds: new Set(rows.map((r) => r.product_id)),
      snoozes,
      today,
    })
    return buildList({ rows, due, products, habitsMap })
  }, [load.data, habitsMap, rows, snoozes, products, today])

  const putRow = (row) => setRows((list) => [...list.filter((r) => r.product_id !== row.product_id), row])
  const dropRow = (id) => setRows((list) => list.filter((r) => r.product_id !== id))
  const rowFor = (product, extra) => ({
    product_id: product.id,
    recipe_id: null,
    added_on: today,
    product: { id: product.id, name: product.name, category: product.category },
    ...extra,
  })

  // Runs `change` now and `write` in the background; `undo` puts the screen back if saving fails.
  async function optimistic(change, undo, write) {
    change()
    try {
      await save(write)
    } catch (error) {
      undo()
      showToast(saveErrorMessage(error))
    }
  }

  function toggle(entry) {
    const id = entry.product_id
    if (!entry.stored) {
      const product = products.find((p) => p.id === id)
      return optimistic(
        () => putRow(rowFor(product, { reason: 'habitual', checked: true })),
        () => dropRow(id),
        () => checkHabit(householdId, id, today),
      )
    }
    const next = !entry.checked
    const flip = (value) =>
      setRows((list) => list.map((r) => (r.product_id === id ? { ...r, checked: value } : r)))
    return optimistic(() => flip(next), () => flip(!next), () => setChecked(id, next))
  }

  function remove(entry) {
    const id = entry.product_id
    const message = `${entry.name} fuera de la lista`
    if (!entry.stored) {
      const snoozeRow = { product_id: id, snoozed_on: today }
      const hide = () => setSnoozes((list) => [...list.filter((s) => s.product_id !== id), snoozeRow])
      const show = () => setSnoozes((list) => list.filter((s) => s.product_id !== id))
      return optimistic(hide, show, async () => {
        await snooze(householdId, id, today)
        showToast(message, () => optimistic(show, hide, () => unsnooze(id)))
      })
    }
    const row = rows.find((r) => r.product_id === id)
    return optimistic(
      () => dropRow(id),
      () => putRow(row),
      async () => {
        await removeFromList(id)
        showToast(message, () =>
          optimistic(() => putRow(row), () => dropRow(id), () => restoreListRow(householdId, row)),
        )
      },
    )
  }

  function add(product) {
    if (rows.some((r) => r.product_id === product.id)) return
    return optimistic(
      () => putRow(rowFor(product, { reason: 'a_mano', checked: false })),
      () => dropRow(product.id),
      () => addToList(householdId, product.id, 'a_mano', today),
    )
  }

  // Throws if saving fails: NewProductForm shows the error and stays open.
  async function create(fields) {
    const product = await createProduct(householdId, fields)
    setProducts((list) => [...list, product])
    setCreatingFor(null)
    add(product)
  }

  function pickExisting(product) {
    setCreatingFor(null)
    add(product)
  }

  async function store() {
    if (storing) return
    setStoring(true)
    try {
      const n = await save(() => storeChecked(today))
      showToast(`${n} ${plural(n, 'producto', 'productos')} a la heladera`)
      reloadRef.current()
    } catch (error) {
      showToast(saveErrorMessage(error))
    } finally {
      setStoring(false)
    }
  }

  if (creatingFor) {
    return (
      <NewProductForm
        products={products}
        initialName={creatingFor}
        onCreate={create}
        onPickExisting={pickExisting}
        onCancel={() => setCreatingFor(null)}
      />
    )
  }

  const empty = load.data && groups.length === 0 && cart.length === 0
  return (
    <main className="screen">
      <h1>Compras</h1>
      <LoadState {...load} />
      {load.data && (
        <>
          <ShoppingAdd products={products} onPick={add} onCreate={setCreatingFor} />
          {empty && (
            <p className="empty">
              La lista está vacía. Lo que se acaba en la heladera aparece acá solo.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="shop-group">{g.label}</h2>
              <ul className="shop-list">
                {g.entries.map((e) => (
                  <ShoppingRow key={e.product_id} entry={e} onToggle={toggle} onRemove={remove} />
                ))}
              </ul>
            </section>
          ))}
          {cart.length > 0 && (
            <section>
              <h2 className="shop-group">En el carrito ({cart.length})</h2>
              <ul className="shop-list">
                {cart.map((e) => (
                  <ShoppingRow key={e.product_id} entry={e} onToggle={toggle} />
                ))}
              </ul>
              <button className="btn-primary" onClick={store} disabled={storing}>
                Guardar {cart.length} en la heladera
              </button>
            </section>
          )}
          <Link to="/shopping/week" className="link-button shop-week">
            Elegir platos de la semana
          </Link>
        </>
      )}
    </main>
  )
}

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
  // A reload that fails keeps the last good data on screen, with a toast.
  const [good, setGood] = useState(null)
  const data = load.data ?? good
  const today = data?.today

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
    setGood(load.data)
  }, [load.data])
  useEffect(() => {
    if (load.error && good) showToast(saveErrorMessage(load.error))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.error])

  // A remote change while one of our saves is in flight only marks a reload
  // as pending; it happens once the saves settle.
  const inflight = useRef(0)
  const pending = useRef(false)
  const reloadRef = useRef(load.reload)
  reloadRef.current = load.reload
  const timer = useRef(null)
  // Waits a little: a burst of events (often this phone's own writes) reloads once.
  function reloadSoon() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (inflight.current > 0) pending.current = true
      else reloadRef.current()
    }, 300)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const loadingRef = useRef(load.loading)
  loadingRef.current = load.loading
  const chains = useRef(new Map()) // product id -> last write, so writes for one product keep their order
  async function save(fn, key) {
    inflight.current += 1
    // A load already running may bring data older than this change: load again after.
    if (loadingRef.current) pending.current = true
    const prev = key == null ? null : chains.current.get(key)
    const run = (async () => {
      if (prev) await prev.catch(() => {})
      return fn()
    })()
    if (key != null) chains.current.set(key, run)
    try {
      return await run
    } finally {
      if (key != null && chains.current.get(key) === run) chains.current.delete(key)
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

  const habitsMap = useMemo(() => (data ? habits(data.purchases) : new Map()), [data])
  const { groups, cart } = useMemo(() => {
    if (!data) return { groups: [], cart: [] }
    const due = dueHabits({
      habits: habitsMap,
      presentIds: data.presentIds,
      listedIds: new Set(rows.map((r) => r.product_id)),
      snoozes,
      today,
    })
    return buildList({ rows, due, products, habitsMap })
  }, [data, habitsMap, rows, snoozes, products, today])

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
  async function optimistic(change, undo, write, key) {
    change()
    try {
      await save(write, key)
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
        id,
      )
    }
    const next = !entry.checked
    const flip = (value) =>
      setRows((list) => list.map((r) => (r.product_id === id ? { ...r, checked: value } : r)))
    return optimistic(() => flip(next), () => flip(!next), () => setChecked(id, next), id)
  }

  function remove(entry) {
    const id = entry.product_id
    const message = `${entry.name} fuera de la lista`
    if (!entry.stored) {
      const snoozeRow = { product_id: id, snoozed_on: today }
      const hide = () => setSnoozes((list) => [...list.filter((s) => s.product_id !== id), snoozeRow])
      const show = () => setSnoozes((list) => list.filter((s) => s.product_id !== id))
      return optimistic(
        hide,
        show,
        async () => {
          await snooze(householdId, id, today)
          showToast(message, () => optimistic(show, hide, () => unsnooze(id), id))
        },
        id,
      )
    }
    const row = rows.find((r) => r.product_id === id)
    // A habitual product would come straight back as a suggestion: snooze it too.
    const habitual = habitsMap.has(id)
    const snoozeRow = { product_id: id, snoozed_on: today }
    const hide = () => setSnoozes((list) => [...list.filter((s) => s.product_id !== id), snoozeRow])
    const show = () => setSnoozes((list) => list.filter((s) => s.product_id !== id))
    return optimistic(
      () => {
        dropRow(id)
        if (habitual) hide()
      },
      () => {
        putRow(row)
        if (habitual) show()
      },
      async () => {
        if (habitual) await snooze(householdId, id, today)
        await removeFromList(id)
        showToast(message, () =>
          optimistic(
            () => {
              putRow(row)
              if (habitual) show()
            },
            () => {
              dropRow(id)
              if (habitual) hide()
            },
            async () => {
              if (habitual) await unsnooze(id)
              await restoreListRow(householdId, row)
            },
            id,
          ),
        )
      },
      id,
    )
  }

  function add(product) {
    if (rows.some((r) => r.product_id === product.id)) {
      showToast(`${product.name} ya está en la lista`)
      return
    }
    return optimistic(
      () => putRow(rowFor(product, { reason: 'a_mano', checked: false })),
      () => dropRow(product.id),
      () => addToList(householdId, product.id, 'a_mano', today),
      product.id,
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
    pending.current = true // one reload when the save settles
    try {
      // Ticks still saving must land first, or they would be left out.
      const n = await save(async () => {
        await Promise.allSettled([...chains.current.values()])
        return storeChecked(today)
      })
      showToast(`${n} ${plural(n, 'producto', 'productos')} a la heladera`)
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

  const empty = data && groups.length === 0 && cart.length === 0
  return (
    <main className="screen">
      <h1>Compras</h1>
      <LoadState {...load} error={good ? null : load.error} />
      {data && (
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

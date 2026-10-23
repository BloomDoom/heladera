import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadFridge, finishItem, restoreItem, setExpiry, moveItem } from '../lib/fridge.js'
import { removeFromList } from '../lib/shopping.js'
import { PLACES } from '../lib/products.js'
import { compareItems, comparePantry } from '../lib/freshness.js'
import { todayISO } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import FridgeItem, { MOVE_LABELS } from '../components/FridgeItem.jsx'

let selectedPlace = 'fridge' // survives navigation while the app is open

// What's in the kitchen, one tab per place (fridge, freezer, pantry), most urgent first.
export default function Fridge({ household }) {
  const navigate = useNavigate()
  const showToast = useToast()
  const load = useLoad(loadFridge, [])
  const [items, setItems] = useState([])
  const [openId, setOpenId] = useState(null) // only one row open at a time
  const [place, setPlace] = useState(selectedPlace)
  const today = todayISO()

  // Work on a copy, so a row can disappear at once and come back if saving fails.
  useEffect(() => {
    if (load.data) setItems(load.data)
  }, [load.data])

  function choose(key) {
    selectedPlace = key
    setPlace(key)
    setOpenId(null)
  }

  const counts = Object.fromEntries(PLACES.map((p) => [p.key, items.filter((i) => i.place === p.key).length]))
  const compare = place === 'pantry' ? comparePantry : compareItems
  const sorted = items.filter((i) => i.place === place).sort((a, b) => compare(a, b, today))
  const label = PLACES.find((p) => p.key === place).label.toLowerCase()

  function put(item) {
    setItems((list) => [...list.filter((i) => i.product_id !== item.product_id), item])
  }

  async function finish(item) {
    setItems((list) => list.filter((i) => i.product_id !== item.product_id))
    setOpenId(null)
    let listed
    try {
      listed = await finishItem(item.product_id, today)
    } catch (error) {
      put(item)
      showToast(saveErrorMessage(error))
      return
    }
    const message = listed ? `${item.product.name}: se acabó. Va a la lista.` : `${item.product.name}: se acabó`
    showToast(message, async () => {
      put(item)
      try {
        await restoreItem(household.id, item)
        if (listed) await removeFromList(item.product_id)
      } catch (error) {
        setItems((list) => list.filter((i) => i.product_id !== item.product_id))
        showToast(saveErrorMessage(error))
      }
    })
  }

  async function move(item, to) {
    put({ ...item, place: to, added_on: today, expires_on: null })
    setOpenId(null)
    try {
      await moveItem(item.product_id, to, today)
    } catch (error) {
      put(item)
      showToast(saveErrorMessage(error))
      return
    }
    showToast(`${item.product.name}: ${MOVE_LABELS[to].toast}`, async () => {
      put(item)
      try {
        await restoreItem(household.id, item)
      } catch (error) {
        setItems((list) => list.filter((i) => i.product_id !== item.product_id))
        showToast(saveErrorMessage(error))
      }
    })
  }

  async function changeExpiry(item, iso) {
    put({ ...item, expires_on: iso })
    try {
      await setExpiry(item.product_id, iso)
    } catch (error) {
      put(item)
      showToast(saveErrorMessage(error))
    }
  }

  return (
    <main className="screen fridge-screen">
      <h1>Cocina</h1>
      <LoadState {...load} />
      {load.data && (
        <>
          <div className="segmented">
            {PLACES.map((p) => (
              <button key={p.key} data-place={p.key} aria-pressed={place === p.key} onClick={() => choose(p.key)}>
                {`${p.label} ${counts[p.key]}`}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => navigate('/fridge/add')}>Agregar</button>
          {sorted.length === 0 ? (
            <>
              <p className="empty fridge-empty">
                {`No hay nada en ${label === 'freezer' ? 'el freezer' : `la ${label}`}.`}
              </p>
              <p className="muted">Tocá Agregar para cargar lo que compraste.</p>
            </>
          ) : (
            <ul className="fridge-list" data-place={place}>
              {sorted.map((item) => (
                <FridgeItem
                  key={item.product_id}
                  item={item}
                  today={today}
                  open={openId === item.product_id}
                  onToggle={() => setOpenId(openId === item.product_id ? null : item.product_id)}
                  onFinish={() => finish(item)}
                  onExpiry={(iso) => changeExpiry(item, iso)}
                  onMove={(to) => move(item, to)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}

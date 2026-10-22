import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadFridge, finishItem, restoreItem, setExpiry } from '../lib/fridge.js'
import { compareItems } from '../lib/freshness.js'
import { todayISO } from '../lib/format.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from '../components/Toast.jsx'
import LoadState from '../components/LoadState.jsx'
import FridgeItem from '../components/FridgeItem.jsx'

// What's in the fridge (and the pantry), most urgent first.
export default function Fridge({ household }) {
  const navigate = useNavigate()
  const showToast = useToast()
  const load = useLoad(loadFridge, [])
  const [items, setItems] = useState([])
  const [openId, setOpenId] = useState(null) // only one row open at a time
  const today = todayISO()

  // Work on a copy, so a row can disappear at once and come back if saving fails.
  useEffect(() => {
    if (load.data) setItems(load.data)
  }, [load.data])

  const sorted = [...items].sort((a, b) => compareItems(a, b, today))

  function put(item) {
    setItems((list) => [...list.filter((i) => i.product_id !== item.product_id), item])
  }

  async function finish(item) {
    setItems((list) => list.filter((i) => i.product_id !== item.product_id))
    setOpenId(null)
    try {
      await finishItem(item.product_id)
    } catch (error) {
      put(item)
      showToast(saveErrorMessage(error))
      return
    }
    showToast(`${item.product.name}: se acabó`, async () => {
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
    <main className="screen">
      <h1>Heladera</h1>
      <LoadState {...load} />
      {load.data && (
        <>
          <button className="btn-primary" onClick={() => navigate('/fridge/add')}>Agregar</button>
          {sorted.length === 0 ? (
            <p className="empty fridge-empty">
              La heladera está vacía. Tocá Agregar para cargar lo que compraste.
            </p>
          ) : (
            <ul className="fridge-list">
              {sorted.map((item) => (
                <FridgeItem
                  key={item.product_id}
                  item={item}
                  today={today}
                  open={openId === item.product_id}
                  onToggle={() => setOpenId(openId === item.product_id ? null : item.product_id)}
                  onFinish={() => finish(item)}
                  onExpiry={(iso) => changeExpiry(item, iso)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}

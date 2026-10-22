import { useState } from 'react'
import { CATEGORIES, findByName } from '../lib/products.js'
import { saveErrorMessage } from '../lib/errors.js'
import { useToast } from './Toast.jsx'

// Form to create a product the dictionary doesn't have yet.
// `onCreate(fields)` saves it; `onPickExisting(product)` selects a product
// that already has that name instead.
export default function NewProductForm({ products, initialName, onCreate, onPickExisting, onCancel }) {
  const showToast = useToast()
  const [name, setName] = useState(initialName)
  // Always a key from CATEGORIES: groupByShop drops products with unknown ones.
  const [category, setCategory] = useState(CATEGORIES[0].key)
  const [storage, setStorage] = useState(CATEGORIES[0].storage)
  const [days, setDays] = useState(String(CATEGORIES[0].shelf_days))
  const [daysEdited, setDaysEdited] = useState(false)
  const [existing, setExisting] = useState(null)
  const [saving, setSaving] = useState(false)

  function changeCategory(key) {
    const c = CATEGORIES.find((x) => x.key === key)
    setCategory(key)
    setStorage(c.storage)
    if (!daysEdited) setDays(String(c.shelf_days))
  }

  const trimmed = name.trim()
  const daysNumber = Number(days)
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 3650

  async function submit(e) {
    e.preventDefault()
    if (saving || !trimmed || !daysValid) return
    const found = findByName(products, trimmed)
    if (found) {
      setExisting(found)
      return
    }
    setSaving(true)
    try {
      await onCreate({ name: trimmed, category, storage, shelf_days: daysNumber })
    } catch (error) {
      showToast(saveErrorMessage(error))
      setSaving(false)
    }
  }

  return (
    <form className="new-product" onSubmit={submit}>
      <h2>Producto nuevo</h2>
      <label>
        Nombre
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setExisting(null)
          }}
          required
        />
      </label>
      {existing && (
        <p className="error" role="alert">
          Ya existe: {existing.name}{' '}
          <button type="button" className="link-button" onClick={() => onPickExisting(existing)}>
            Elegir ese
          </button>
        </p>
      )}
      <label>
        Categoría
        <select value={category} onChange={(e) => changeCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </label>
      <label>
        Dura más o menos (días)
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="3650"
          value={days}
          onChange={(e) => {
            setDays(e.target.value)
            setDaysEdited(true)
          }}
          required
        />
      </label>
      <label>
        Se guarda en
        <select value={storage} onChange={(e) => setStorage(e.target.value)}>
          <option value="fridge">Heladera</option>
          <option value="pantry">Alacena</option>
        </select>
      </label>
      <button className="btn-primary" type="submit" disabled={saving || !trimmed || !daysValid}>
        Guardar producto
      </button>
      <button className="btn-secondary new-product-cancel" type="button" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  )
}

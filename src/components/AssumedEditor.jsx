import { useState } from 'react'
import { useToast } from './Toast.jsx'
import { effectiveAssumed, searchProducts } from '../lib/products.js'

// "Siempre hay en casa": chips with the basics and a search to add more.
// `onChange(product, assumed)` does the saving.
export default function AssumedEditor({ products, overrides, onChange }) {
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const basics = effectiveAssumed(products, overrides)
  const basicIds = new Set(basics.map((p) => p.id))
  const results = query.trim() === '' ? [] : searchProducts(products, query, { includeHidden: true }).filter((p) => !basicIds.has(p.id))

  function add(product) {
    onChange(product, true)
    setQuery('')
  }

  function remove(product) {
    onChange(product, false)
    showToast(`Sacaste ${product.name}`, () => onChange(product, true))
  }

  return (
    <>
      <p className="muted">Para elegir platos, la app cuenta con que esto nunca falta.</p>
      {basics.length === 0 && <p className="muted">No hay nada marcado.</p>}
      <ul className="basics-chips">
        {basics.map((p) => (
          <li key={p.id} className="basic-chip">
            <span>{p.name}</span>
            <button aria-label={`Sacar ${p.name}`} onClick={() => remove(p)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <input
        type="search"
        aria-label="Agregar algo que siempre hay"
        placeholder="Agregar algo que siempre hay"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== '' && results.length === 0 && <p className="muted">No encontramos nada.</p>}
      {results.length > 0 && (
        <ul className="basics-results">
          {results.map((p) => (
            <li key={p.id}>
              <button onClick={() => add(p)}>{p.name}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

import { useState } from 'react'
import { findByName, searchProducts } from '../lib/products.js'

// "Agregar a la lista…": search a product and add it, or offer to create it.
// `onPick(product)` adds it; `onCreate(text)` opens "new product".
export default function ShoppingAdd({ products, onPick, onCreate }) {
  const [query, setQuery] = useState('')
  const text = query.trim()
  const results = text ? searchProducts(products, text).slice(0, 5) : []

  return (
    <div className="shop-add">
      <label>
        Agregar a la lista…
        <input
          type="search"
          placeholder="Agregar a la lista…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {text && (
        <ul className="ingredient-results">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  onPick(p)
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
          {!findByName(products, text) && (
            <li>
              <button
                type="button"
                className="ingredient-create"
                onClick={() => {
                  setQuery('')
                  onCreate(text)
                }}
              >
                Crear "{text}"
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

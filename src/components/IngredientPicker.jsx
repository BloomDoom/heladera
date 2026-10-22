import { useState } from 'react'
import { searchProducts } from '../lib/products.js'

// One ingredient row of the recipe form: which product, whether it is a main
// ingredient, and how the recipe words it. `onChange(patch)` merges fields;
// `onCreate(text)` asks the form to open "new product".
export default function IngredientPicker({ ingredient, products, onChange, onRemove, onCreate }) {
  const [query, setQuery] = useState('')
  const picked = ingredient.product_id != null
  const text = query.trim()
  const results = text ? searchProducts(products, text).slice(0, 5) : []

  function pick(product) {
    onChange({ product_id: product.id, product_name: product.name })
    setQuery('')
  }

  return (
    <li className="ingredient-row">
      {picked ? (
        <p className="ingredient-product">
          <strong>{ingredient.product_name}</strong>
          <button
            type="button"
            className="link-button"
            onClick={() => onChange({ product_id: null, product_name: '' })}
          >
            Cambiar
          </button>
        </p>
      ) : (
        <>
          <label>
            Producto
            <input
              type="search"
              placeholder="Buscar producto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {text && (
            <ul className="ingredient-results">
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)}>
                    {p.name}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="ingredient-create" onClick={() => onCreate(text)}>
                  Crear "{text}"
                </button>
              </li>
            </ul>
          )}
        </>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={ingredient.is_main}
        className="ingredient-switch"
        onClick={() => onChange({ is_main: !ingredient.is_main })}
      >
        {ingredient.is_main ? 'Principal' : 'Para condimentar'}
      </button>
      <label>
        Cómo lo dice la receta
        <input
          placeholder={picked ? ingredient.product_name : 'Ej: 2 cebollas'}
          value={ingredient.line}
          onChange={(e) => onChange({ line: e.target.value })}
        />
      </label>
      <button type="button" className="link-button" onClick={onRemove}>
        Quitar
      </button>
    </li>
  )
}

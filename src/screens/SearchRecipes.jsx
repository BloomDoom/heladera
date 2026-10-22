import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLoad } from '../lib/useLoad.js'
import { loadRecipeSearch } from '../lib/today.js'
import { searchRecipes } from '../lib/recipeSearch.js'
import LoadState from '../components/LoadState.jsx'
import BackButton from '../components/BackButton.jsx'

// "Buscar receta": find a dish by name, besides swiping on Hoy.
export default function SearchRecipes() {
  const load = useLoad(loadRecipeSearch, [])
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''
  const results = load.data ? searchRecipes(load.data.recipes, query, load.data.makeableIds) : []

  return (
    <main className="screen">
      <BackButton fallback="/" />
      <h1>Buscar receta</h1>
      <input
        type="search"
        aria-label="Buscar receta"
        placeholder="Nombre del plato"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <LoadState {...load} />
      {load.data && searching && results.length === 0 && (
        <p className="empty">No encontramos ningún plato con ese nombre.</p>
      )}
      {results.length > 0 && (
        <ul className="history-list search-results">
          {results.map((recipe) => (
            <li key={recipe.id}>
              <Link to={`/recipe/${recipe.id}`}>
                <span className="search-title">{recipe.title}</span>
                <span className="search-meta">
                  {load.data.makeableIds.has(recipe.id) && (
                    <span className="chip chip-ok">Se puede hacer</span>
                  )}
                  {recipe.minutes > 0 && <span className="muted">{recipe.minutes} min</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

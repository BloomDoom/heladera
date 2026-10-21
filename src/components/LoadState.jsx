import { loadErrorMessage } from '../lib/errors.js'

// Shows "Cargando…" or an error with a "Probar de nuevo" button.
// Pass it what useLoad() returns: <LoadState {...result} />
export default function LoadState({ data, loading, error, reload }) {
  if (error) {
    return (
      <div className="load-error" role="alert">
        <p>{loadErrorMessage(error)}</p>
        <button className="btn-secondary" onClick={reload}>Probar de nuevo</button>
      </div>
    )
  }
  // Only on the first load: when refreshing, the old data stays on screen.
  if (loading && data == null) return <p className="muted">Cargando…</p>
  return null
}

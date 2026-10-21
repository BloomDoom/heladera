import { useEffect, useState } from 'react'

// Supabase returns { data, error } instead of throwing. This turns an
// error into a normal exception, so we can use try/catch everywhere:
//   const groups = await unwrap(supabase.from('groups').select())
export async function unwrap(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

// Loads data when a screen opens (and again when `deps` change).
// Returns { data, loading, error, reload }.
//   const { data, loading, error, reload } = useLoad(() => loadGroup(id), [id])
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let cancelled = false // ignore old results if the screen changed meanwhile
    setState((s) => ({ ...s, loading: true, error: null }))
    loader()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((error) => !cancelled && setState({ data: null, loading: false, error }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadCount])

  return { ...state, reload: () => setReloadCount((n) => n + 1) }
}

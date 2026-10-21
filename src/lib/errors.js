// Turns technical errors into plain Spanish for the screen.
// The real error is still printed in the browser console for you.

function isConnectionProblem(error) {
  // Safari says "Load failed", Chrome says "Failed to fetch".
  const message = error?.message || ''
  return !navigator.onLine || message.includes('Load failed') || message.includes('Failed to fetch')
}

export function saveErrorMessage(error) {
  console.error(error)
  return isConnectionProblem(error)
    ? 'No hay internet. Los cambios no se guardaron. Probá de nuevo.'
    : 'Algo salió mal. Los cambios no se guardaron. Probá de nuevo.'
}

export function loadErrorMessage(error) {
  console.error(error)
  return isConnectionProblem(error)
    ? 'No hay internet. Conectate al Wi-Fi y probá de nuevo.'
    : 'Algo salió mal y no se pudo cargar. Probá de nuevo.'
}

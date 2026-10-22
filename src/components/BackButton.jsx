import { useNavigate } from 'react-router-dom'

// Returns a function that goes back to the previous screen.
// React Router numbers the history entries (idx); 0 means the app was
// opened straight on this screen, so there's nothing to go back to and
// we go to `fallback` instead.
export function useGoBack(fallback) {
  const navigate = useNavigate()
  return () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(fallback)
  }
}

// "‹ Volver" for screens that can be reached from several places
// (e.g. a member from Chicas or from Pagos).
export default function BackButton({ fallback }) {
  const goBack = useGoBack(fallback)
  return <button className="back-link" onClick={goBack}>‹ Volver</button>
}

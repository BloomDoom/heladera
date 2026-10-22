import { createContext, useCallback, useContext, useRef, useState } from 'react'

// A small message at the bottom of the screen ("Guardado", "Chica dada
// de baja · Deshacer"). We use Undo instead of "¿Estás segura?" dialogs.
//
// Any screen can show one:
//   const showToast = useToast()
//   showToast('Guardado')
//   showToast('Horario quitado', () => putItBack())   // with Undo

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const showToast = useCallback((message, onUndo) => {
    clearTimeout(timer.current)
    setToast({ message, onUndo })
    // Leave more time when there's an Undo button to press.
    timer.current = setTimeout(() => setToast(null), onUndo ? 7000 : 3000)
  }, [])

  function undo() {
    clearTimeout(timer.current)
    setToast(null)
    toast.onUndo()
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.onUndo && <button onClick={undo}>Deshacer</button>}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

import { useEffect, useState } from 'react'

// true while the phone has internet, false when it doesn't.
// The browser fires "online"/"offline" events when this changes.
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

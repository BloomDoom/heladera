import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { isConfigured, signOut, supabase } from './lib/supabase.js'
import { useOnline } from './lib/useOnline.js'
import { useLoad } from './lib/useLoad.js'
import { loadHousehold } from './lib/household.js'
import LoadState from './components/LoadState.jsx'
import TabBar from './components/TabBar.jsx'
import Login from './screens/Login.jsx'
import NoHousehold from './screens/NoHousehold.jsx'
import Today from './screens/Today.jsx'
import Recipe from './screens/Recipe.jsx'
import Fridge from './screens/Fridge.jsx'
import AddToFridge from './screens/AddToFridge.jsx'
import Shopping from './screens/Shopping.jsx'
import More from './screens/More.jsx'

export default function App() {
  // undefined = still checking, null = logged out, object = logged in
  const [session, setSession] = useState(undefined)
  const online = useOnline()
  const { pathname } = useLocation()

  // Start every new screen at the top (the browser would keep the old scroll position).
  // Braces matter: newer browsers make scrollTo return a Promise, and React
  // would try to call whatever the effect returns when the screen changes.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // Runs on every log in or out (or when the login is renewed).
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <main className="screen center">
        <p>La app todavía no está conectada a la base de datos.</p>
        <p className="muted">Developer: copy .env.example to .env and fill in the Supabase values.</p>
      </main>
    )
  }

  if (session === undefined) {
    return <main className="screen center"><p className="muted">Cargando…</p></main>
  }

  return (
    <>
      {!online && (
        <div className="offline-banner" role="alert">
          No hay internet. Conectate al Wi-Fi para ver y guardar tus datos.
        </div>
      )}
      {session === null ? <Login /> : <LoggedIn userId={session.user.id} />}
    </>
  )
}

// Everything in the app belongs to a household, so first find the user's.
function LoggedIn({ userId }) {
  const household = useLoad(loadHousehold, [userId])

  if (household.loading || household.error) {
    return (
      <main className="screen center">
        <LoadState {...household} />
        {/* If it keeps failing, there must be a way out of this screen. */}
        {household.error && (
          <button className="btn-secondary logout-after-error" onClick={signOut}>
            Cerrar sesión
          </button>
        )}
      </main>
    )
  }
  if (!household.data) return <NoHousehold />

  return (
    <>
      <Routes>
        <Route path="/" element={<Today household={household.data} />} />
        <Route path="/recipe/:id" element={<Recipe household={household.data} />} />
        <Route path="/fridge" element={<Fridge household={household.data} />} />
        <Route path="/fridge/add" element={<AddToFridge household={household.data} />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/more" element={<More household={household.data} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  )
}

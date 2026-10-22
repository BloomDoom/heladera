import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
// The Nunito font files come from npm and are bundled with the app,
// so the font works offline (Google Fonts would need internet).
import '@fontsource-variable/nunito'
import './index.css'

// HashRouter keeps the page in the URL after a "#" (…/#/fridge).
// GitHub Pages only knows about index.html, so normal URLs like
// …/fridge would give a 404 if the page is reloaded.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)

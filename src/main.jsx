import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
// The font files come from npm and are bundled with the app, so they work
// offline (Google Fonts would need internet). Rethink Sans is for everything;
// Caveat is the handwriting on the white door's notes; Chakra Petch is the
// dark fridge's display.
import '@fontsource-variable/rethink-sans'
import '@fontsource-variable/caveat'
import '@fontsource/chakra-petch/latin-500.css'
import '@fontsource/chakra-petch/latin-600.css'
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

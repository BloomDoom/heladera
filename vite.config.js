import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// On GitHub Pages the app lives at /<repo-name>/, not at /.
// The deploy workflow sets BASE_PATH; locally it's just "/".
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    // Creates the service worker (keeps the app's files on the phone so it
    // opens fast) and the web manifest (makes "Add to Home Screen" work).
    VitePWA({
      registerType: 'autoUpdate', // new versions install themselves
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Heladera',
        short_name: 'Heladera',
        description: '¿Qué comemos hoy?',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        background_color: '#0d0d10',
        theme_color: '#0d0d10',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Android may crop icons into a circle; this version has extra margin.
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app itself is cached. Data from Supabase always comes
        // fresh from the internet, so the fridge and the list are never out of date.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})

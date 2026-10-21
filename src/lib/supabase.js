import { createClient } from '@supabase/supabase-js'

// Values come from the .env file locally, and from GitHub Secrets when
// the site is built for GitHub Pages. They're the same as zona-fit's:
// both apps share one Supabase project.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

export const isConfigured = Boolean(url && key)

// supabase-js stores the login on the phone and renews it automatically,
// so you stay logged in until you press "Cerrar sesión".
// All tables live in the "heladera" schema, not in zona-fit's "public".
export const supabase = isConfigured
  ? createClient(url, key, { db: { schema: 'heladera' } })
  : null

import { supabase } from './supabase.js'
import { unwrap } from './useLoad.js'

// The logged-in user's household (hogar) with its members, or null if
// the user has none. Row Level Security only returns the user's own
// household, so there's no need to filter here.
export async function loadHousehold() {
  return unwrap(
    supabase
      .from('households')
      .select('id, name, members:household_members(user_id, display_name)')
      .maybeSingle(),
  )
}

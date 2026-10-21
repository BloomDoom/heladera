// zona-fit and Heladera share one Supabase project, and on GitHub Pages
// they also share one origin (<user>.github.io). So:
//   * the login is stored under its own key: with the default key,
//     logging in here would replace the zona-fit login in the same browser;
//   * logging out only ends this app on this device: the default ("global")
//     ends every session of that login, zona-fit's included.
export const clientOptions = {
  db: { schema: 'heladera' }, // all tables live here, not in zona-fit's "public"
  auth: { storageKey: 'heladera-auth' },
}

export const signOutOptions = { scope: 'local' }

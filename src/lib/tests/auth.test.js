import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientOptions, signOutOptions } from '../auth.js'

// zona-fit and Heladera share one Supabase project and one origin
// (<user>.github.io). With the default storage key, logging in to one app
// would replace the other app's login in the same browser.
test('login is stored under its own key, not zona-fit\'s', () => {
  assert.equal(clientOptions.auth.storageKey, 'heladera-auth')
  assert.equal(clientOptions.db.schema, 'heladera')
})

// The default "global" sign out ends the user's sessions everywhere,
// including zona-fit on Nadia's phone.
test('logging out only ends this app on this device', () => {
  assert.deepEqual(signOutOptions, { scope: 'local' })
})

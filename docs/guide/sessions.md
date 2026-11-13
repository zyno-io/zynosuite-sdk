# Persistent sessions and logout

CRM is the authentication authority. The SDK persists only fully authenticated, unrestricted app grants. An authenticated grant with `expiresAt: null` has no local timeout: restarting an app does not end it. Server deletion or invalidation remains authoritative. Recovery, enrollment and other proof sessions stay volatile and honor their finite expiry.

Use the asynchronous browser persistent store for restart persistence. It requires atomic Web Locks coordination and cross-tab notifications; unavailable coordination produces an explicit storage error instead of silently advertising persistent login. Native applications provide an atomic store with the same contract. Session records are isolated by API origin, app, publishable-key fingerprint and registered origin.

Call `auth.restore()` when the application starts. `auth.signIn({ email, password })` persists an unrestricted CRM grant and validates app authorization. Changing users requires explicit logout first; `ALREADY_AUTHENTICATED` prevents an accidental account switch. After a grant is saved, a transient app-authorization failure resolves sign-in with the session and leaves the state `unverified`; check the state before showing authenticated app content and retry restore when connectivity returns. Authoritative authentication, access or configuration failures still reject.

Read `auth.state` for the current snapshot and use `auth.subscribe()` for changes. The returned function removes the listener:

```ts
renderAuth(client.auth.state);
const unsubscribe = client.auth.subscribe(state => renderAuth(state));
await client.auth.restore();
// On application teardown:
unsubscribe();
```

| State                 | Meaning and application response                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `signed-out`          | No active login is available; offer sign-in                                                                    |
| `unverified`          | This client has not validated app authorization; restore on startup, focus or connectivity recovery            |
| `authenticated`       | CRM session and app authorization were validated; authenticated content can be requested                       |
| `denied`              | Retain the CRM credential, show the access denial, and restore after permission changes                        |
| `configuration-error` | Retain the credential; correct app/key/origin configuration before restoring                                   |
| `storage-unavailable` | Safe persistent storage is unavailable; public content works, while authentication needs an atomic store       |
| `pending-revocation`  | Local logout has taken effect; resolve or explicitly forget the pending server revocation before another login |

Subscribers should update UI state. Do not start an unbounded restore loop from every `unverified` notification; use a bounded application lifecycle or connectivity action. Store changes from another client invalidate cached authorization and require validation before authenticated content is shown.

Network failure, rate limiting and application access denial preserve the credential. Only the stable `REAUTHENTICATION_REQUIRED` response for the exact credential sent by a request, or explicit logout, clears that active credential. A failed password attempt returning `INVALID_CREDENTIALS` does not clear an existing login.

Logout clears active UI state immediately and attempts server revocation. If the request fails, the secret remains only in one protected pending-revocation slot; it cannot restore an active login. Public content stays available. New persistent login is blocked until the pending capability is revoked or explicitly forgotten. Call `auth.retryPendingLogout()` when connectivity returns. `auth.forgetPendingLogout()` explicitly discards the local capability while leaving server revocation unconfirmed. It can also discard a corrupt stored record that cannot be decoded; prefer recovering storage first, since an unreadable capability cannot be revoked by the client.

A successful `auth.replacePassword()` revokes the calling server session and leaves this client signed out. Sign in again using the new password.

Never log grant secrets, place them in URLs, or copy them into analytics. Applications should display safe error codes and messages rather than transport headers or stored authentication records.

If storing a new grant fails, `SESSION_PERSISTENCE_FAILED` reports the problem and the SDK attempts server revocation. If both storage and the server are unavailable, one pending credential can remain in memory for revocation retry. Persistence across a restart cannot be promised when the persistent store itself failed.

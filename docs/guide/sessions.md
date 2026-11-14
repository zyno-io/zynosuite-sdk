# Login and logout

Users sign in as contacts in the ZynoSuite CRM. The CRM decides whether the email and password are right. Whether that contact may use your app is a separate permission your administrator controls. The SDK handles both checks and saves the login on the device. You build the screens.

## Saved logins

A successful sign-in is saved and has no time limit on the device. Closing the tab or restarting the app does not end it. It ends when the user logs out, or when the server ends it, for example after a password change or when an administrator revokes it.

A dropped connection, a rate limit, an access problem or a wrong app setting never deletes a saved login.

In a browser the login is kept in the browser's storage, in step across tabs, separately for each app, key and site address. Native apps supply their own storage; see [Browser, native and server](runtimes.md).

## At startup

Call `auth.restore()` once when the app starts. It checks the saved login with the server and updates `auth.state`. Use `auth.subscribe()` to hear about changes.

```ts
import type { AuthState } from '@zyno-io/zynosuite-sdk';
import { client } from './zyno.js';

function render(state: AuthState): void {
    if (state.status === 'authenticated') {
        console.log(`Signed in as ${state.me.contact.displayName ?? 'member'}`);
    } else {
        console.log(`Login state: ${state.status}`);
    }
}

render(client.auth.state);
const unsubscribe = client.auth.subscribe(render);

client.auth.restore().catch(() => {
    // Offline or a temporary server problem. The saved login is kept.
});
```

Call `unsubscribe()` when the screen goes away.

**Show signed-in UI only when the status is `authenticated`.** A saved login that has not been checked yet is not proof of anything.

## Login states

- `signed-out`: no saved login. Offer sign-in.
- `unverified`: there may be a saved login, but it has not been checked. Show a neutral or loading state and call `restore()`.
- `authenticated`: the login is checked and the user may use this app. `state.me` has the contact.
- `denied`: the login is fine, but this contact may not use the app. Say so. The login is kept; call `restore()` after the administrator fixes access.
- `configuration-error`: the app key, publishable key or site address is not accepted. The login is kept; fix the settings, then call `restore()`.
- `storage-unavailable`: the device cannot save a login safely. Keep showing public content and hide sign-in.
- `pending-revocation`: the user logged out here, but the server has not confirmed it. Show signed-out UI and finish the logout (below) before a new sign-in.

The state returns to `unverified` when another tab or app instance changes the saved login. Call `restore()` at sensible moments: at startup, when the app returns to the foreground and when the network comes back. Do not call it in a loop whenever you see `unverified`; if the network is down, that loop never ends.

## Sign in

```ts
await client.auth.signIn({ email, password });
```

- Wrong details throw `INVALID_CREDENTIALS`.
- If someone is already signed in, `signIn` throws `ALREADY_AUTHENTICATED`. To switch users, log out first.
- `signIn` can succeed and leave the state `unverified`. The login was accepted and saved, but the follow-up check of the user's profile and app access hit a network problem. Call `restore()` when the connection is back; do not ask for the password again.

So after `signIn` returns, read `auth.state` (or wait for your `subscribe` callback) before showing signed-in UI.

`client.me()` returns the signed-in contact's ID and name.

## Other flows

`auth.configuration()` reports which options the administrator has enabled (`policy.options`) and the password rules (`passwordRequirements`).

Two flows end with the user signed in and the login saved, exactly like `signIn`:

- **Email code login.** `challenge({ purpose: 'login', email })`, then `verify(...)` with the code.
- **Create an account.** `challenge({ purpose: 'register', email })`, `verify(...)`, then `register(...)`.

The others do not sign the user in. When they finish, send the user to your sign-in form:

- **Forgot password.** `recover({ email })` sends an email with a link.
- **Link from a recovery email.** `exchange({ token, purpose: 'recovery' })`, then `replacePassword({ newPassword })`.
- **Link from an invitation.** `exchange({ token, purpose: 'enrollment' })`, then `completeEnrollment({ password })`.
- **Link confirming a new login email.** `exchange({ token, purpose: 'login-email' })`, then `completeLoginEmail()`.

The in-between steps (a code that was sent, a link that was opened) are short-lived and kept in memory only. If the user takes too long or reloads the page, the next step fails. The code is not always the same (`PROOF_SESSION_EXPIRED` or `AUTHENTICATION_REQUIRED`, for example), so treat any failure here as "start this flow again".

`replacePassword` also changes the password of a signed-in user. A successful change ends that login and the state becomes `signed-out`; sign in again with the new password.

## Log out

```ts
export async function signOut(): Promise<void> {
    try {
        await client.auth.logout();
    } catch {
        // The app already shows the user as signed out.
        // The server could not be told; see below.
    }
}
```

Logging out hides the signed-in state on this device immediately, then asks the server to end the login.

If the server cannot be reached, the state stays `pending-revocation`. The SDK keeps what it needs to tell the server later; that cannot be used to sign back in. Meanwhile public content still works, and a new sign-in is refused with `PENDING_REVOCATION`.

You have two ways to finish:

```ts
// Try the server again, for example when the network returns.
window.addEventListener('online', () => {
    if (client.auth.state.status === 'pending-revocation') {
        client.auth.retryPendingLogout().catch(() => {});
    }
});

// Or give up on telling the server.
await client.auth.forgetPendingLogout();
```

Prefer retrying. `forgetPendingLogout()` clears this device so the user can sign in again, but it cannot confirm that the server ended the old login. Use it when the user asks for it, or when the saved record is damaged (`SESSION_STORAGE_CORRUPT`) and cannot be read.

## When storage fails

If the device cannot save a new login, `signIn` throws `SESSION_PERSISTENCE_FAILED` and the SDK asks the server to end the login it just created. Check `auth.state` afterwards:

- `storage-unavailable`: the server ended the new login. Sign-in can be tried again once storage works.
- `pending-revocation`: the server could not be reached either. Finish the logout as above before another sign-in.

On a device whose storage is failing, the SDK may only be able to remember an unfinished logout in memory, so it can be lost on restart.

## Next

- [Errors and retries](errors.md): the codes behind these states, and what is safe to log.
- [Browser, native and server](runtimes.md): storage for native apps.
- [Saved user data](owned.md): what a signed-in user can do.

# Errors and retries

When a request fails, or the SDK rejects a value before sending it, it throws a `ZynoSuiteError` with a stable `code`. Decide what to do from the code. Do not parse messages, and do not treat every 403 or 409 alike.

```ts
import { ZynoSuiteError } from '@zyno-io/zynosuite-sdk';
import { client } from './zyno.js';

export async function articleTitle(slug: string): Promise<string | null> {
    try {
        const article = await client.content.getBySlug('article', slug);
        return article.data.title;
    } catch (error) {
        if (error instanceof ZynoSuiteError && error.code === 'CONTENT_NOT_FOUND') return null;
        throw error;
    }
}
```

A `ZynoSuiteError` has:

- `code`: the stable name, such as `CONTENT_NOT_FOUND`.
- `status`: the HTTP status, or `0` when there was no response.
- `retryAfterSeconds`: set when the server said how long to wait.

It never contains request bodies, headers, keys or the user's login, so `code` and `status` are safe to log. Do not log bodies, headers, media URLs or session storage yourself.

Not everything thrown is a `ZynoSuiteError`. If you wrote your own session store, an error it throws reaches you as it is. Keep the `instanceof` check.

## Connection problems

- `NETWORK_ERROR`: no response (offline, DNS or CORS). Retry later.
- `REQUEST_TIMEOUT`: no answer within the time limit. Retry later.
- `REQUEST_ABORTED`: your own `AbortSignal` cancelled the call.
- `RATE_LIMITED`: too many requests. Wait for `retryAfterSeconds`.

None of these means the login ended. The saved login is kept.

## Login and access

- `INVALID_CREDENTIALS`: wrong email or password.
- `AUTHENTICATION_REQUIRED`: the call needs a login and there is none. Offer sign-in.
- `REAUTHENTICATION_REQUIRED`: the server ended this login. The SDK has cleared it; ask the user to sign in again.
- `ALREADY_AUTHENTICATED`: someone is already signed in. Log out before signing another user in.
- `SDK_APP_ACCESS_DENIED`, `CONTENT_ACCESS_DENIED`: the login is fine, but this user may not use that. The login is kept.
- `INVALID_APP_CONTEXT`: the app key, publishable key or site address was not accepted. The login is kept; fix your configuration.
- `PENDING_REVOCATION`: an earlier logout has not reached the server. Call `auth.retryPendingLogout()`, or `auth.forgetPendingLogout()`.
- `PROOF_SESSION_EXPIRED`: an email code or link step took too long. Start that flow again.
- `SESSION_STORAGE_UNAVAILABLE`: the device cannot save a login safely. Public content still works.
- `SESSION_STORAGE_CORRUPT`: the saved login cannot be read. Repair storage, or call `auth.forgetPendingLogout()` to discard it.
- `SESSION_PERSISTENCE_FAILED`: a new login could not be saved. Check `auth.state`: if it is `pending-revocation`, finish that logout first; then fix storage and sign in again.
- `AUTHENTICATED_SSR_UNSUPPORTED`: a signed-in call was made on a server. Move it to the browser.

Only two things remove a saved login: the user logging out, and `REAUTHENTICATION_REQUIRED` in answer to a request made with that same login. [Login and logout](sessions.md) has the full picture.

## Content and saving

- `CONTENT_NOT_FOUND`: no such entry, or it is not published or not approved. Show "not found".
- `CURSOR_RESET_REQUIRED`: the server can no longer use this cursor, for example because what the app or user may see has changed. Restart the list from the first page. Ordinary edits to the list do not cause this.
- `POPULATION_NOT_SUPPORTED`: you asked for linked entries to be included. Remove `populate` and fetch them separately.
- `MODEL_VALIDATION_FAILED`: a value you tried to save does not fit the schema. Fix the field names, required fields or choices.
- `WRITE_CONFLICT`: the record changed since you read it. Reload it and let the user decide.
- `SCHEMA_CHANGED`: the type changed in a way your app's types do not match. Regenerate types and release an update.
- `SYNC_RESET_REQUIRED`: the user's access changed during or between syncs. Delete the local copy for that user and sync from the start.
- `LEGACY_MUTATIONS_ENABLED`: the app still uses the older write method. Ask your administrator to complete the switch.
- `UPLOAD_FAILED`: file storage rejected the upload. Call `upload` again.

This list is not complete. A code the server sends that is not listed here is passed through unchanged, and a response with no code becomes `HTTP_` plus the status, such as `HTTP_503`.

## What the SDK retries for you

**Reads (GET requests)** are retried automatically, up to two extra attempts by default (`maxReadRetries`, 0 to 5):

- after a network failure or timeout, with a short growing pause
- after a 429, 502, 503 or 504. If the server says how long to wait, the SDK waits that long, as long as it is no more than `maxRetryDelayMs` (10 seconds by default). A longer wait is left to you: the error is thrown with `retryAfterSeconds`.
- with no wait time from the server, a 502, 503 or 504 gets the short growing pause, and a 429 is thrown straight away as `RATE_LIMITED`.

**Writes, sign-in, logout and uploads are never retried automatically.** If a save times out, the server may or may not have applied it. Read the record again before trying anything else.

Each request stops after `timeoutMs` (30 seconds by default). Methods that make a network request accept `{ signal }` as their last argument if you want to cancel sooner. `auth.subscribe()`, `auth.forgetPendingLogout()` and `client.dispose()` make no request and take no signal.

```ts
const controller = new AbortController();
const page = await client.content.list('article', {}, { signal: controller.signal });
```

## Next

- [Login and logout](sessions.md): login states behind the access errors.
- [Saved user data](owned.md): conflicts, schema changes and sync resets in context.

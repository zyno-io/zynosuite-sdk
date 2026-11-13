# Browser, native and server

The same client runs in three kinds of environment. They differ in how the SDK learns your app's registered address and where a login is saved.

- **Browser** (`runtime: 'browser'`): uses the page's own address and built-in login storage. Can read everything.
- **Native app** (`runtime: 'native'`): you pass `origin` and a `store`. Can read everything.
- **Server** (`runtime: 'server'`): you pass `origin`. No logins; public content only.

If you leave `runtime` out, the SDK picks `'browser'` when it finds a browser page and `'server'` otherwise. Native apps must set it.

## Browser

The browser attaches the page's real address to every request, and that address must be the one registered for your app. You cannot override it. The registered address is always an HTTPS origin, in production and in alpha, so a page served from plain `http://localhost` fails with `INVALID_ORIGIN`. Develop on an HTTPS URL your administrator has registered.

Logins are saved in the browser's local storage, and the SDK uses the browser's Web Locks feature so that several tabs cannot overwrite each other's changes. If either is missing or blocked, as in some private modes and older browsers, public content still works. The login state is `storage-unavailable` and sign-in throws `SESSION_STORAGE_UNAVAILABLE`. The SDK does not fall back to something less safe.

## Native apps

A native app has no page address, so pass the HTTPS address your administrator registered for it. It also has no browser storage, so pass a `store` that saves the login in the platform's secure storage.

```ts
import { createClient, type SessionStore } from '@zyno-io/zynosuite-sdk';
import { schema } from './zyno.generated.js';

export function createNativeClient(store: SessionStore) {
    return createClient({
        appKey: 'example-app',
        publishableKey: 'example-publishable-key',
        runtime: 'native',
        origin: 'https://example.app',
        schema,
        store
    });
}
```

### What a store must do

You write the `SessionStore` for your platform. The SDK does not supply secure storage or locking for native apps. The exact `read` and `withLock` signatures, and the `StoredSession` record they carry, are in the generated API reference. A correct store meets four requirements:

- **Durable.** A write that has returned is still there after the app restarts. Use the platform's encrypted storage.
- **One callback at a time.** `withLock(namespace, action)` runs the whole `action`, including its reads, its writes and the server calls in between, before any other client in your app can start its own for that namespace. "Any other client" includes other screens, background tasks and app extensions. Separate get, set and remove calls with no lock around them are not safe: a sign-in and a logout could overwrite each other.
- **Checks what it reads.** Do not hand back whatever was stored. Confirm that the saved value parses and has the shape of a `StoredSession` before returning it.
- **Tells damaged data apart from a store it cannot reach.** These are two different failures:
    - _Damaged data._ The store returned a value, but it is not valid JSON or does not have the shape of a `StoredSession`. Throw `new ZynoSuiteError('SESSION_STORAGE_CORRUPT')`. Only this code makes the record eligible for the explicit discard with `forgetPendingLogout()`; see [Login and logout](sessions.md).
    - _Store unavailable._ The value could not be read or written right now: the device is locked, the keychain refused access or an I/O call failed. Let that error through as it is. Never report it as corrupt and never delete the saved login because of it. The login is still there, and the app can try again once storage is reachable.

`read` returns `null` when nothing is saved, and writing `null` inside the lock deletes the record. An optional `subscribe(namespace, listener)` lets the SDK notice changes made by another client instance.

The package exports `MemorySessionStore` for tests and prototypes. It is **not durable**: the user is signed out whenever the app restarts, and an unfinished logout is forgotten too.

## Server rendering

On a server the SDK reads public content and nothing else. Passing a `store` or calling a signed-in method throws `AUTHENTICATED_SSR_UNSUPPORTED`.

```ts
import { createClient } from '@zyno-io/zynosuite-sdk';
import { schema } from './zyno.generated.js';

const client = createClient({
    appKey: 'example-app',
    publishableKey: 'example-publishable-key',
    runtime: 'server',
    origin: 'https://example.app',
    schema
});

export async function renderArticleTitle(slug: string): Promise<string> {
    const article = await client.content.getBySlug('article', slug);
    return article.data.title ?? 'Untitled';
}
```

Keep in mind:

- **No user logins on the server.** Pages for signed-in users should load their data in the browser after the page arrives.
- **All visitors share your server's request allowance.** ZynoSuite sees every request as coming from your server. Cache rendered public pages for a short time and handle `RATE_LIMITED`.
- **Do not put media URLs in server-rendered HTML.** They expire within minutes, long before a cached page does. Resolve them in the browser; see [Media](media.md).
- **Escape what you render,** as you would for any text from a database.

## Next

- [Login and logout](sessions.md): how the saved login behaves.
- [Media](media.md): short-lived media URLs.

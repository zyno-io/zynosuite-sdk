# Quickstart

This page builds one small browser page that reads a public article, signs a user in and saves a record for that user.

You need:

- A browser project that compiles TypeScript modules, with an `index.html` and a `src` folder. A new Vite "vanilla TypeScript" project has the right shape. No framework is needed.
- An HTTPS address to serve the page from, registered for your app. The ZynoSuite API accepts browser requests only from a registered HTTPS origin, so Vite's default `http://localhost` server fails with `INVALID_ORIGIN`. Develop on HTTPS, at a development URL your administrator has approved and registered.
- From your ZynoSuite administrator: your **app key**, your **publishable key**, the schema file saved as `app-schema.json`, and which environment they set the app up in (production or alpha). [App setup](app-setup.md) explains each item.

The examples use the sample schema in this repository (`examples/app-schema.json`): a public `article` type with `title` and `body`, and a per-user `favorite` type with `name` and `state`. Your own names will differ.

## 1. Install and generate types

```bash
npm install @zyno-io/zynosuite-sdk
npx zynosuite-models app-schema.json src/zyno.generated.ts
```

Commit `src/zyno.generated.ts`, and rerun the second command whenever your administrator sends a new schema file.

`npm install` needs a version that has been published to npm. For unreleased source, a maintainer builds an archive in the SDK repository with `yarn pack --out zynosuite-sdk.tgz`. Then, in your own project, run `npm install /path/to/zynosuite-sdk.tgz`.

## 2. Add the markup

Put this in the `<body>` of `index.html`:

```html
<h1 id="title">Loading…</h1>
<p id="status"></p>
<form id="login" hidden>
    <input name="email" type="email" placeholder="Email" required />
    <input name="password" type="password" placeholder="Password" required />
    <button>Sign in</button>
</form>
<button id="save" hidden>Save a favorite</button>
<script type="module" src="/src/main.ts"></script>
```

## 3. Create the client and read an article

```ts
// src/zyno.ts
import { createClient } from '@zyno-io/zynosuite-sdk';
import { schema } from './zyno.generated.js';

export const client = createClient({
    appKey: 'example-app',
    publishableKey: 'example-publishable-key',
    runtime: 'browser',
    environment: 'production',
    schema
});
```

`environment` defaults to `'production'`. If your administrator set the app up in alpha, use `environment: 'alpha'`; the keys and the registered address belong to one environment and do not work in the other.

The rest of the code goes in `src/main.ts`, in order.

```ts
// src/main.ts
import { ZynoSuiteError, type AuthState } from '@zyno-io/zynosuite-sdk';
import { client } from './zyno.js';

const title = document.querySelector<HTMLElement>('#title')!;
const status = document.querySelector<HTMLElement>('#status')!;
const login = document.querySelector<HTMLFormElement>('#login')!;
const save = document.querySelector<HTMLButtonElement>('#save')!;

client.content
    .getBySlug('article', 'getting-started')
    .then(article => {
        title.textContent = article.data.title ?? 'Untitled';
    })
    .catch(() => {
        title.textContent = 'Article not available';
    });
```

You get back `{ meta, data }`. `data` holds your fields; `meta` holds details such as `id`, `slug` and `publishedAt`. Fields are typed `string | null` because an article published before a field existed will not have it.

Public reads work before login and never send the user's saved login. `textContent` is safe for plain text; if a field holds rich text or HTML, sanitize it before inserting it into the page.

## 4. Follow the login state

The SDK keeps one login state. Draw the page from it, and treat it as the only source of truth: show signed-in UI only when the status is `authenticated`.

```ts
function render(state: AuthState): void {
    const signedIn = state.status === 'authenticated';
    status.textContent = signedIn ? `Signed in as ${state.me.contact.displayName ?? 'member'}` : `Login state: ${state.status}`;
    save.hidden = !signedIn;
    login.hidden = state.status !== 'signed-out';
}

render(client.auth.state);
client.auth.subscribe(render);

// A login is saved in the browser. Check it with the server at startup.
client.auth.restore().catch(() => {
    // Offline or a temporary server problem. The saved login is kept; call restore() again later.
});
```

With no saved login, `restore()` settles on `signed-out` and the form appears. [Login and logout](sessions.md) covers the other states.

## 5. Sign in

Users sign in with their ZynoSuite CRM contact email and password.

```ts
login.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(login);
    try {
        await client.auth.signIn({ email: String(form.get('email')), password: String(form.get('password')) });
    } catch (error) {
        const wrong = error instanceof ZynoSuiteError && error.code === 'INVALID_CREDENTIALS';
        status.textContent = wrong ? 'Wrong email or password.' : 'Sign-in failed. Try again.';
    }
});
```

There is nothing to do on success: `render` runs with the new state. That is normally `authenticated`.

Occasionally `signIn` succeeds and the state is `unverified`. The login was accepted and saved, but the follow-up check of the user's profile hit a network problem. The page above then hides both the form and the save button, which is correct. Call `restore()` when the connection is back; do not ask for the password again.

## 6. Save something for the user

Records of a per-user type belong to whoever is signed in. The button is only visible when the state is `authenticated`.

```ts
save.addEventListener('click', async () => {
    const created = await client.owned.create('favorite', { name: 'Morning reads', state: 'active' });
    const page = await client.owned.list('favorite');
    status.textContent = `Saved "${created.data.name}". The first page of your favorites has ${page.items.length} record(s).`;
});
```

`list` returns one page, so `page.items.length` counts the records on that page, not all of the user's favorites. [Saved user data](owned.md) covers paging.

TypeScript rejects a missing `name` or a `state` other than `'active'` or `'archived'`, because the schema file says so.

## Next steps

- [Reading content](content.md): lists, paging and members-only content.
- [Saved user data](owned.md): editing, deleting and syncing records.
- [Login and logout](sessions.md): every login state, and logout.
- [Errors and retries](errors.md): the error codes you will meet.

Building a native app or rendering on a server? Read [Browser, native and server](runtimes.md) first.

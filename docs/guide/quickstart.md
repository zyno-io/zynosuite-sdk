# Quickstart

Install the ESM package in a TypeScript application with a Fetch implementation. Repository development and CI use Node 26; that is a tooling choice, not an SDK consumer requirement. Browser and native applications need standard Fetch and the runtime features described in the runtime guide.

```bash
npm install @zyno-io/zynosuite-sdk
```

Ask your app administrator for public app configuration and the sanitized schema manifest, then generate `zyno.generated.ts` using the [app setup](app-setup.md) workflow. Never include a staff token in the application.

```ts
import { createClient } from '@zyno-io/zynosuite-sdk';
import { schema } from './zyno.generated.js';

const client = createClient({
    environment: 'production',
    appKey: 'example-app',
    publishableKey: 'your-publishable-key',
    runtime: 'browser',
    schema
});

const article = await client.content.getBySlug('article', 'getting-started');
document.title = article.data.title ?? 'Untitled';

const restored = await client.auth.restore();
```

The client infers model keys and field types from `schema`. Public content is usable before login and never sends a stored session. Browser clients use the coordinated persistent session store by default; authenticated grants with a null expiry can survive restarts until the server invalidates them.

Render strings using your framework's normal escaping. Rich text requires an application-approved renderer/sanitizer. Fetch content fresh instead of persisting public responses or signed media URLs indefinitely.

The source examples cover browser use (`examples/browser.ts`), native store injection (`examples/native.ts`) and anonymous SSR (`examples/public-ssr.ts`). They are typechecked against the packed package, including its generated model contract.

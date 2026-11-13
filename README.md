# ZynoSuite SDK

TypeScript-first ESM client for explicitly public CMS content, CRM authentication, and app-owned data. Uses standard Fetch in browser/native applications; anonymous SSR is supported.

```ts
import { createClient } from '@zyno-io/zynosuite-sdk';
import { schema } from './zyno.generated.js';

const client = createClient({
    appKey: 'your-app',
    publishableKey: 'your-publishable-key',
    runtime: 'browser',
    schema
});
const article = await client.content.getBySlug('article', 'getting-started');
```

Generate your model file from the staff-exported sanitized app manifest with `zynosuite-models app-schema.json src/zyno.generated.ts`. Staff credentials never belong in the application. Public content is explicitly approved and session-blind; member and owned access use CRM-backed authentication.

Authenticated grants with a null expiry persist until server invalidation. Browser persistence requires Web Locks coordination. Native applications provide an atomic session-store adapter. SSR supports anonymous content only.

Documentation source is in `docs/`; run `yarn docs:build` for the VitePress guides and generated API reference. Run `yarn test` for contract/runtime checks and `yarn examples:check` for packed-consumer examples. This source tree is prepared for review; publication is a separate action.

## Package and source

[Source and pull requests](https://github.com/zyno-io/zynosuite-sdk) · [Documentation](https://zyno-io.github.io/zynosuite-sdk/) · [Release process](RELEASING.md)

```bash
npm install @zyno-io/zynosuite-sdk
```

This repository is independent of Suite's backend checkout. Fixed HTTP contracts are versioned in `openapi.suite.json`; ordinary development uses that snapshot. API-reference Markdown and the built docs are generated in CI and Pages deployment, and are not committed. See [RELEASING.md](RELEASING.md) for checks and the approved-tag npm publishing workflow.

MIT License — Zyno Consulting.

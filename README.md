# ZynoSuite SDK

A TypeScript client for building websites and apps on ZynoSuite. With it your app can:

- show published content to anyone, with no login
- sign customers in with their ZynoSuite CRM account and keep them signed in
- show members-only content to signed-in customers
- let each signed-in user create, edit and sync records of their own, such as favorites
- upload images and display approved media

The package is ESM, has no framework dependency and uses standard `fetch`. It runs in browsers, in native apps (you supply the secure storage) and on a server for public content.

## A first read

Your ZynoSuite administrator gives you an **app key**, a **publishable key** and a schema file (`app-schema.json`) listing the content types and fields your app may use. None of them is a secret.

```bash
npm install @zyno-io/zynosuite-sdk
npx zynosuite-models app-schema.json src/zyno.generated.ts
```

```ts
import { createClient } from '@zyno-io/zynosuite-sdk';
import { schema } from './zyno.generated.js';

const client = createClient({
    appKey: 'example-app',
    publishableKey: 'example-publishable-key',
    runtime: 'browser',
    schema
});

const article = await client.content.getBySlug('article', 'getting-started');
console.log(article.data.title); // string | null
```

`'article'` and `title` are checked by TypeScript against your schema file, so a typo is a compile error.

`npm install` needs a version that has been published to npm. To use unreleased source instead, see [Install from source](#install-from-source).

## Documentation

- [Quickstart](docs/guide/quickstart.md): read content, sign a user in and save a record in a browser.
- [App setup](docs/guide/app-setup.md): what to ask your administrator for.
- [All guides](docs/index.md): content, typed schemas, saved user data, login, native and server use, media and errors.

The documentation site at [zyno-io.github.io/zynosuite-sdk](https://zyno-io.github.io/zynosuite-sdk/) is built from these guides and adds an API reference generated from the package's exports. If it is not available, read the guides in `docs/`.

## Working on this repository

Repository tooling uses Node 26 and Yarn through Corepack. Node 26 does not bundle Corepack, so install it first. None of this is a requirement for apps that use the package.

```bash
npm install --global corepack
corepack enable
yarn install --immutable
yarn check
yarn lint
yarn format:check
```

`yarn check` runs the type check, tests, example checks, documentation build and package verification. ZynoSuite's backend owns the HTTP API; this repository keeps a versioned snapshot of it in `openapi.suite.json` and needs no backend checkout. The API reference and built site are generated in CI and are never committed.

### Install from source

This takes two steps in two different directories.

First, in this SDK checkout, after the setup above, build a package archive:

```bash
yarn pack --out zynosuite-sdk.tgz
```

Then, in the app that will use the SDK, install that archive:

```bash
npm install /path/to/zynosuite-sdk.tgz
```

Do not run the install command in the SDK checkout; that would make the SDK depend on itself.

Publishing is a separate, approved step. See [RELEASING.md](RELEASING.md).

[Source and issues](https://github.com/zyno-io/zynosuite-sdk) · MIT License, Zyno Consulting.

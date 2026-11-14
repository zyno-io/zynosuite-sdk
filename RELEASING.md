# Releasing the package and documentation

This page is for maintainers of [zyno-io/zynosuite-sdk](https://github.com/zyno-io/zynosuite-sdk). ZynoSuite's backend owns the HTTP API. This repository owns the npm package, a versioned snapshot of that API, the guides and the documentation build.

## Check a change

Use Node 26. It does not bundle Corepack, so install it first.

```bash
npm install --global corepack
corepack enable
yarn install --immutable
yarn check
yarn lint
yarn format:check
```

`yarn check` runs, in order: the type check, the tests, a check that generated API code is up to date, the example checks against the packed package, the documentation build, the documentation link check and package verification.

Nothing here needs a backend checkout, a private registry or staff credentials.

## Update the API snapshot

Do this only after a server API change has been approved. Export the OpenAPI file from Suite, then regenerate:

```bash
yarn openapi:generate /path/to/suite/openapi.yaml --complete
```

This rewrites `openapi.suite.json` and `src/generated/`. Review and commit them together. Never edit generated files by hand.

## What is committed

- Committed: the guides in `docs/guide/`, `docs/index.md` and the generator scripts.
- Not committed: `docs/api/` (the API reference) and `docs/.vitepress/dist/` (the built site). `yarn docs:build` creates both, and both are git-ignored.

## One-time repository setup

1. Set GitHub Pages to deploy from GitHub Actions.
2. Create a GitHub Actions environment named `release`. Add required reviewers if a release should need approval.
3. On npm, configure trusted publishing for `@zyno-io/zynosuite-sdk` with repository `zyno-io/zynosuite-sdk`, workflow `package.yml` and environment `release`.

A package's very first publication may need an npm owner to create it before a trusted publisher can be attached. Do not add a long-lived npm token to the repository or the workflow.

## Publish a version

A release happens only from a version tag, and only when Sean approves it.

1. Confirm that the target Suite API serves the `/sdk/v1` endpoints this version calls.
2. Change `version` in `package.json` in a pull request. Get it reviewed and merged to `main`.
3. With approval, tag that merge commit `v` plus the version (for example `v1.2.3`) and push the tag.

The tag starts the `package.yml` workflow, which:

1. checks that the tag matches `package.json` and that the commit is on `main`
2. runs the full checks again and scans dependencies
3. packs the package once
4. publishes that exact archive to npm through trusted publishing (no stored token)
5. attaches the same archive to a GitHub release

A published npm version cannot be changed. If the workflow runs again for a version already on npm, it skips the publish step and still attaches the archive to the GitHub release. To fix a bad release, publish a new version.

To hand someone an unreleased build, run this in the SDK checkout and send them the archive:

```bash
yarn pack --out zynosuite-sdk.tgz
```

They run this in their own app, not in an SDK checkout:

```bash
npm install /path/to/zynosuite-sdk.tgz
```

## Deploy the documentation

Documentation is separate from the npm release. The `docs.yml` workflow runs on every push to `main`:

1. generates `docs/api/` from the package source
2. builds the VitePress site
3. uploads `docs/.vitepress/dist` to GitHub Pages

The site's address is [zyno-io.github.io/zynosuite-sdk](https://zyno-io.github.io/zynosuite-sdk/), with the base path `/zynosuite-sdk/`. To rebuild it without a new commit, run the workflow manually from the Actions tab.

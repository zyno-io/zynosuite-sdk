# Package and documentation releases

The source of truth is [zyno-io/zynosuite-sdk](https://github.com/zyno-io/zynosuite-sdk). Suite owns the HTTP API; this repository owns the public npm package, its versioned contract snapshot, guides, and documentation build.

## Validate a change

```bash
corepack enable
yarn install --immutable
yarn check
yarn lint
yarn format:check
```

`yarn check` verifies types, runtime/contract tests, reproducible generated contracts, the actual installed model-generator command, packed consumer examples, browser dependency boundaries, package contents, and the documentation build. Generated API Markdown and the built VitePress site are ignored outputs, produced from a clean checkout during checks and documentation deployment. Only authored guides and generator code are committed.

For a contract update, export Suite OpenAPI and regenerate the complete reviewed operation graph:

```bash
yarn openapi:generate /path/to/suite/openapi.yaml --complete
```

Review `openapi.suite.json` and `src/generated/` together. No sibling checkout, private registry, staff credential, or Suite build is needed for ordinary SDK development or CI.

## One-time repository setup

1. Set GitHub Pages to deploy from GitHub Actions.
2. Create the GitHub Actions environment `release`, with reviewers if release approval is required.
3. Configure npm trusted publishing for `@zyno-io/zynosuite-sdk`, repository `zyno-io/zynosuite-sdk`, workflow `package.yml`, environment `release`. The initial npm publication may require an owner bootstrap before a trusted publisher can be configured. Do not commit or add a long-lived npm token to the workflow.

## Publish an approved version

Confirm the target Suite API provides the corresponding `/sdk/v1` contracts before the initial SDK release.

Update `package.json` in a reviewed pull request. After that commit is merged to `main`, create its matching `v<version>` tag only when Sean approves the release. The tag workflow verifies the tag/version and main-branch ancestry, repeats checks, publishes the tested archive through npm OIDC, and attaches it to a GitHub release. Existing npm versions are immutable; a retry skips an already published version.

Documentation is built from `main` and deployed by the separate Pages workflow. It generates `docs/api/` before building and uploads `docs/.vitepress/dist`. The site uses `/zynosuite-sdk/` as its base and is served at [zyno-io.github.io/zynosuite-sdk](https://zyno-io.github.io/zynosuite-sdk/). Manual dispatch is available for documentation recovery.

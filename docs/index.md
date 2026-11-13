# ZynoSuite TypeScript SDK

Use the same Fetch-based client in browser and native apps. Read explicitly public CMS content before login, authenticate through CRM, and work with the signed-in user's app-owned records.

The package is ESM and TypeScript-first. Fixed HTTP contracts come from Suite OpenAPI; a staff-exported app schema generates field types and runtime mappings. Your application never needs staff credentials.

Start with the [quickstart](guide/quickstart.md) and [app setup](guide/app-setup.md). The [API reference](api/index.md) is generated from the package's public exports.

V1 includes public and member browsing, owned records and flat owned sync. Encrypted fields, arbitrary filtering, offline mutation replay, public/member delta sync, device automation and authenticated SSR are outside this release's contract.

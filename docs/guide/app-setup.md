# App setup

An administrator creates an SDK app and approves its access policies. App configuration and schema export happen through staff tooling, outside the application bundle.

Public content requires an exact publishable-key ID/origin binding on the app, an eligible standalone root type, and an explicit public field allowlist. Public access starts disabled. Only unowned, non-system root types qualify. An approved component includes its entire nested subtree; opaque JSON cannot be public.

The administrator pins approval to the active definition. A later definition change pauses public delivery until reapproval. Media rendition profiles require separate approval. An empty field allowlist exposes only permitted publication metadata.

Member content and owned records require a CRM-backed app authorization policy and their separate content policies. Public content does not require a CRM session. An app policy grants access to a tenant-owned type; it does not transfer ownership of that type to the app.

Before adopting v1 owned writes on an existing app, an administrator sets `legacyMutationsEnabled: false`. New apps already use this setting. The server rejects v1 writes while legacy mutations remain enabled, preventing older clients from bypassing revision checks. Plan that cutover with any installed legacy clients.

Export the sanitized schema manifest through the staff endpoint `GET /sdk/apps/:appId/schema-manifest`, then save it as a development artifact. Generate models locally:

```bash
node node_modules/@zyno-io/zynosuite-sdk/scripts/generate-models.mjs app-schema.json src/zyno.generated.ts
```

Review generated alias and schema changes in source control. The manifest is a developer contract, not an authorization capability. It excludes defaults, condition expressions and fields outside the app's approved audience views. Do not place staff JWTs, secret keys or raw administrative schema exports in browser code.

Use a publishable key in the application. It is public configuration, not proof of a human or a secret client. Public policy means world-readable; CORS does not prevent scraping. Native applications configure an exact registered HTTPS origin.

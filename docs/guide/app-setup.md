# App setup

Before your code can read anything, a ZynoSuite administrator registers your app and decides what it may access.

## What the administrator gives you

- **App key.** The name of your app in ZynoSuite, such as `example-app`.
- **Publishable key.** A key tied to your app and to the web addresses allowed to use it.
- **Schema file.** A JSON list of the content types and fields your app may use.
- **Registered site.** Your site's exact origin, such as `https://www.example.com`, added to the app.
- **Environment.** Whether the app was set up in production or alpha. Ask which; the keys and registered site work only in that one.

An origin is the scheme, host and port of an address, with no path: `https://www.example.com`, or `https://dev.example.com:5173`. It must be HTTPS, in production and in alpha alike. `https://example.com` and `https://www.example.com` are different origins, and so are two ports on the same host. The address you develop on counts too: plain `http://localhost` is rejected with `INVALID_ORIGIN`, so ask your administrator to register an HTTPS development URL.

None of these is a secret. They ship inside your app, where anyone can read them. They tell ZynoSuite which app is calling; they do not prove who the user is, and they do not keep content private.

Never put staff logins, staff tokens or secret keys in your app. The SDK does not need them.

## What the administrator turns on

Access is off until someone approves it. There are three kinds:

- **Public.** Anyone on the internet can read it. The administrator approves each type and each field within it.
- **Members-only.** Signed-in CRM contacts can read it. Needs a login policy for the app, plus the types members may read.
- **User-owned.** Only the signed-in user can read and save it. Needs a login policy, plus the types users may save.

Worth knowing when you talk to them:

- **Public means world-readable.** Tying the key to your site's address stops other websites from calling the API in a browser. It does not stop someone from copying approved content.
- **Approval is tied to the type's current shape.** If a public type's fields change later, public delivery of that type can stop until the administrator approves it again.
- **Media is approved separately.** Each image or video size your app may display publicly needs its own approval. See [Media](media.md).
- **Login belongs to the CRM.** Users sign in as CRM contacts. Whether a contact may use your app is a separate permission.
- **Older apps need one switch for saving.** If your app existed before this SDK, the administrator must turn off its older write method (`legacyMutationsEnabled: false`). Until then, saves fail with `LEGACY_MUTATIONS_ENABLED`. Plan the switch around older app versions still in use.

## Get the schema file and generate types

The administrator exports the schema file with staff tooling (the staff endpoint `GET /sdk/apps/:appId/schema-manifest`) and sends it to you. Save it as `app-schema.json`. It lists only the fields your app is approved to use, and it grants no access by itself; the server checks every request.

```bash
npx zynosuite-models app-schema.json src/zyno.generated.ts
```

`zynosuite-models` is installed with the SDK. The output path defaults to `zyno.generated.ts` in the current folder.

Commit both files. When the schema changes, ask for a new export, rerun the command and review the diff. [Typed schemas](schemas.md) explains the generated file.

## Create the client

Pass the two keys and the generated `schema` to `createClient`, as in the [Quickstart](quickstart.md). The client calls the production API unless you pass `environment: 'alpha'`, so set that if your app was configured in alpha. In a browser the SDK uses the page's real address, so the page must be served from the registered HTTPS origin exactly. Native apps and servers pass the registered address themselves; see [Browser, native and server](runtimes.md).

If the app key, publishable key or address does not match what is registered, requests fail with `INVALID_APP_CONTEXT`. The error does not say which of the three was wrong; check them all with your administrator.

## Next

- [Reading content](content.md) for public and members-only reads.

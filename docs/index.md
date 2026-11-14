# ZynoSuite TypeScript SDK

Build a website or app on ZynoSuite content with one typed client. It works in browsers and native apps, and on a server for public pages.

Your administrator decides which content types and fields your app may use and exports that list as a schema file. You generate TypeScript types from it, so type and field names are checked when you compile. Your app never holds staff credentials.

## Start here

1. [Quickstart](guide/quickstart.md): read an article, sign in and save a favorite in a browser.
2. [App setup](guide/app-setup.md): what your administrator provides and what you create.

## Then read what you need

- [Reading content](guide/content.md): public and members-only content, lists and paging.
- [Typed schemas](guide/schemas.md): the generated file, nullable fields and schema changes.
- [Saved user data](guide/owned.md): create, edit, delete and sync a user's own records.
- [Login and logout](guide/sessions.md): saved logins, login states and logout.
- [Browser, native and server](guide/runtimes.md): storage for native apps and public-only server rendering.
- [Media](guide/media.md): image uploads and short-lived media URLs.
- [Errors and retries](guide/errors.md): error codes and what to do about each.

The [API reference](api/index.md) lists every export. It is generated from the package source when the site is built.

## Not supported

Plan around these:

- encrypted fields
- filtering, sorting or searching content by your own criteria
- queuing writes while offline and replaying them later
- device registration and push notifications
- server-side rendering for signed-in users
- change-only sync for public and members-only content (sync covers a user's own records)

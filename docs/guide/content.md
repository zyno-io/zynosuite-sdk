# Reading content

The client reads three kinds of content:

- `client.content`: published content approved as public. Anyone can read it; no login.
- `client.memberContent`: published content approved for members. Needs a signed-in CRM contact.
- `client.owned`: the signed-in user's own records. See [Saved user data](owned.md).

The first two are read-only and share the same three methods.

## Get one entry

```ts
const bySlug = await client.content.getBySlug('article', 'getting-started');
const byId = await client.content.get('article', bySlug.meta.id);

console.log(bySlug.data.title); // string | null
console.log(bySlug.meta.slug, bySlug.meta.publishedAt);
```

Every entry is `{ meta, data }`. Your fields are in `data`. `meta` holds what ZynoSuite tracks, such as `id`, `slug`, `publishedAt` and `sortOrder`, so a field of yours named `id` never collides with the entry's ID.

You only ever see the published version, never drafts.

If the entry does not exist, is not published or is not approved for your app, the call throws `CONTENT_NOT_FOUND`. The code is the same in all three cases, so a visitor cannot probe for hidden content.

## List entries

```ts
let cursor: string | undefined;

do {
    const page = await client.content.list('article', { limit: 20, cursor });
    for (const item of page.items) {
        console.log(item.meta.slug, item.data.title);
    }
    cursor = page.nextCursor ?? undefined;
} while (cursor);
```

`nextCursor` is `null` on the last page.

Lists come in one fixed order: sort order ascending, then most recently published first. You cannot filter, sort or search, so fetch the list and arrange it in your app if you need something else.

A cursor points into the live list, not a frozen copy, so an entry can move if editors publish while a user pages. If a call throws `CURSOR_RESET_REQUIRED`, the server can no longer use that cursor: drop it and start again from the first page.

## Members-only content

`client.memberContent` has the same `list`, `get` and `getBySlug` methods. It never falls back to public content. Without a saved login the call throws `AUTHENTICATION_REQUIRED`.

The sample schema has no members-only types. If your administrator approves a type called `lesson` for members, it appears under `member` in your regenerated file and you can write:

```ts
const lessons = await client.memberContent.list('lesson', { limit: 10 });
```

Public requests never send the saved login. A signed-in user and an anonymous visitor get exactly the same public content.

## Values that may surprise you

- **Any field can be `null`.** An entry published before a field was added does not have it.
- **Choice fields read as plain strings.** An old entry can hold a choice that has since been removed.
- **Links to other entries are not filled in.** In public content a link reads as `null` (or an empty list). In members-only content you get the linked entry's ID. Asking the server to include linked entries (`populate`) fails with `POPULATION_NOT_SUPPORTED`; fetch the linked entry with a second call.
- **Media fields hold an upload ID, not a URL.** See [Media](media.md).

## Showing and caching content

Escape plain text as usual, and sanitize rich text or HTML before rendering it.

The SDK keeps no copy of content between calls. If you add your own cache, keep it short-lived so unpublished content disappears promptly, and never cache members-only content where another user could see it.

## Next

- [Typed schemas](schemas.md): how field names and types are generated.
- [Media](media.md): displaying images and video from media fields.
- [Errors and retries](errors.md).

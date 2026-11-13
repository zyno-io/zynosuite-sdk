# Saved user data

`client.owned` reads and writes records that belong to the signed-in user: favorites, notes, settings and the like. The server ties every record to that user and checks it on each request. Every call here needs a login; see [Login and logout](sessions.md).

The examples use the sample `favorite` type, which has a required `name` and an optional `state` (`'active'` or `'archived'`).

## Create and read

```ts
const created = await client.owned.create('favorite', { name: 'Morning reads', state: 'active' });

const favorite = await client.owned.get('favorite', created.meta.id);
console.log(favorite.data.name); // "Morning reads"
console.log(favorite.meta.writeRevision); // a number that goes up with each save
```

`create` takes an optional third argument for `slug`, `sortOrder` or `parentEntryId` (to nest the record under another of the user's records). `client.owned.list('favorite')` returns a page of records, with `nextCursor` for the next page.

## Edit: save the whole record

There is no partial update. `replace` stores every field you send and **clears every optional field in your generated schema that you leave out**.

One narrow exception protects older app versions. If an administrator has since added an optional simple field that your installed app's schema does not include, your app cannot send it, and the server keeps its stored value. See [Typed schemas](schemas.md).

```ts
export async function renameFavorite(id: string, name: string) {
    const current = await client.owned.get('favorite', id);

    return client.owned.replace(
        'favorite',
        id,
        { name, state: current.data.state === 'archived' ? 'archived' : 'active' },
        { expectedWriteRevision: current.meta.writeRevision }
    );
}
```

Two rules keep edits safe.

**Build the record field by field.** Do not spread `current.data` or `current.raw` into the save. Read values can be `null`, can hold choices that are no longer allowed and can include data your app does not understand.

**Say which version you edited.** `expectedWriteRevision` is the `writeRevision` you read. If the record changed in the meantime, perhaps on the user's other device, the server changes nothing and answers `WRITE_CONFLICT`.

A conflict means your copy is out of date. Read the record again, show it next to the user's edit and let them choose. Do not just retry with the newer revision number; that silently overwrites the other change.

## Delete

```ts
await client.owned.remove('favorite', id, current.meta.writeRevision);
```

Delete takes the same revision check and can also answer `WRITE_CONFLICT`.

## Add several child records at once

`client.owned.batch(parentKey, parentId, childKey, rows)` creates several records under one parent in a single all-or-nothing request. Both types must be user-owned types in your schema; the sample schema has only `favorite`.

## If a save fails halfway

The SDK never repeats a create, save, delete or batch by itself. After a timeout you cannot tell whether the server applied the change, so read the record again first; a repeated create would make a duplicate.

## Keep a local copy in sync

For offline viewing or a fast start, keep the user's records in your own database and ask the server only for what changed. The SDK fetches the changes; your app owns the database.

A local copy and its checkpoint belong to **one user in one app**. Key your storage by both. The client's storage namespace does not identify the user, so it is not a cache key by itself. Never show one user's cached records to another, and never reuse a checkpoint across users or apps.

`client.owned.sync` yields pages. Each has changed records (`items`), IDs of deleted records (`deletedIds`) and two values to remember: `syncUntil` and `contextVersion`. Next time, pass the last `syncUntil` back as `since`, together with `contextVersion`.

```ts
import type { OwnedEntry } from '@zyno-io/zynosuite-sdk';
import type { owned_favoriteRead } from './zyno.generated.js';
import { client } from './zyno.js';

type Favorite = OwnedEntry<owned_favoriteRead>;
type Checkpoint = { since: string; contextVersion: string };

/** Your database. You write this. */
export interface FavoriteCache {
    loadCheckpoint(): Promise<Checkpoint | null>;
    /** Applies all three parts in one transaction, or none of them. */
    commit(changes: { upserts: Favorite[]; deletedIds: string[]; checkpoint: Checkpoint }): Promise<void>;
    /** Deletes this user's cached favorites for this app, and the checkpoint. */
    clear(): Promise<void>;
}

export async function syncFavorites(cache: FavoriteCache): Promise<void> {
    const start = await cache.loadCheckpoint();
    const upserts: Favorite[] = [];
    const deletedIds: string[] = [];
    let checkpoint = start;

    for await (const page of client.owned.sync('favorite', start ?? {})) {
        upserts.push(...page.items);
        deletedIds.push(...page.deletedIds);
        checkpoint = { since: page.syncUntil, contextVersion: page.contextVersion };
    }

    if (checkpoint) await cache.commit({ upserts, deletedIds, checkpoint });
}
```

What matters here:

- **Finish, then commit.** Store the changes, the deletions and the new checkpoint in one database transaction after the last page. If a run fails partway, keep the old checkpoint and run again.
- **Insert or update by ID.** `since` is inclusive, so a record you already have can be sent again. Store each entry's `raw` as well as `data`; see [Typed schemas](schemas.md).
- **`SYNC_RESET_REQUIRED` means start over.** The user's access changed, so your copy may hold records or fields they can no longer see. Call `cache.clear()`, then sync once more from the beginning. Adding new records on top of the old ones is not enough. A schema change alone does not cause a reset.
- **Sync is flat.** Each type syncs separately, and a link to another record arrives as an ID.

Two limits to design around:

- The server cannot erase a copy on a device that is offline. Lost access takes effect the next time the app is online and syncs.
- Clearing is your job in more cases than a reset. Clear the cache, or at least stop showing it, when the user logs out and when the user loses read access to the type. Do not wait for `SYNC_RESET_REQUIRED`.
- Writes made while offline are not queued or replayed by the SDK.

## Next

- [Typed schemas](schemas.md): write types, `raw` and schema changes.
- [Errors and retries](errors.md): `WRITE_CONFLICT`, `SCHEMA_CHANGED` and others.

# Owned writes and synchronization

Owned records belong to the authenticated app user. The server validates tenant, owner and parent relationships on every operation.

`owned.replace` submits a complete data document for the generated schema. Omitted optional fields are cleared. Construct this document deliberately from editable fields; do not spread a read snapshot into it.

```ts
const current = await client.owned.get('favorite', id);
await client.owned.replace(
    'favorite',
    id,
    { name: 'Saved', state: 'active' },
    {
        expectedWriteRevision: current.meta.writeRevision
    }
);
```

Replacement supplies the client's definition ID and the record's expected write revision. A stale revision returns `WRITE_CONFLICT` without mutation. The server accepts an older definition only when its write shape is equal, or when the active shape adds optional top-level scalar fields without changing earlier fields and rules. In that second case the server carries forward stored values for the newly added fields. Incompatible changes return `SCHEMA_CHANGED`.

Create and atomic child-batch creation use active-schema validation without a definition pin. Delete needs an expected write revision, not a schema pin. Mutations and child batches are never automatically retried after an ambiguous network result.

Owned sync is flat: independently changing relation targets are not embedded. Apply every page and tombstone in a sync sequence atomically before advancing the checkpoint. The server fixes one `syncUntil` boundary for the sequence and uses an inclusive `since` boundary.

Access context changes return `SYNC_RESET_REQUIRED`. Erase the affected application-managed partition and complete a full resync before exposing it again. A reset must remove formerly visible fields and records; overlaying new records is insufficient. Unrelated public policy edits and compatible schema additions do not by themselves reset owned sync.

Revocation clears affected cached access on the next online validation. Downloaded data cannot be remotely erased while an application is offline. The CRM credential remains separate from a content-access reset.

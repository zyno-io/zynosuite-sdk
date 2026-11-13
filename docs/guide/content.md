# Content audiences

| Surface         | Session        | Data                                   |
| --------------- | -------------- | -------------------------------------- |
| `content`       | Never attached | Explicitly approved public publication |
| `memberContent` | Required       | Member-approved publication            |
| `owned`         | Required       | Current owner's records                |

A stored, expired or revoked credential cannot change the anonymous content projection. Member and owned requests never fall back to public access on authentication failure.

Published browsing supports lists, get by ID and get by slug. Lists use the server's fixed publication order: sort order ascending, publication time descending, then ID descending. Republishing can move an entry within its sort-order group. Browse cursors describe a live feed, not a historical snapshot; refresh after content changes. Draft slug, ordering and timestamps are never substituted for publication metadata.

Responses keep system metadata under `meta` and mapped fields under `data`. This allows fields named `id`, `data` or `updatedAt` without shadowing metadata. Unknown historical values fail kind checks or map to null. Missing current fields also map to null.

Public relations never expose private target IDs. They currently map to null or an empty list. Member relations retain authorized references. This implementation rejects every nonempty `populate` request with `POPULATION_NOT_SUPPORTED`; it does not return populated targets. Generated member relation types also reserve a resolved shape for a later reviewed extension, but applications must not rely on population today.

Public and member reads have no persistent SDK cache and are served with `no-store`. Public/member delta sync and arbitrary filtering or sorting are deferred.

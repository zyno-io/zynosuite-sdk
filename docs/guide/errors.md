# Errors and retries

Handle stable error codes, not message text or every response with the same status. An inaccessible public type or record returns the same `CONTENT_NOT_FOUND`; invalid app/key/origin context returns `INVALID_APP_CONTEXT` without revealing the failed lookup.

| Code                                             | Application response                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `REAUTHENTICATION_REQUIRED`                      | Exact sent credential was invalidated; sign in again                                                                      |
| `SDK_APP_ACCESS_DENIED`, `CONTENT_ACCESS_DENIED` | Retain CRM credential; clear affected access and show denial                                                              |
| `INVALID_APP_CONTEXT`                            | Retain credential; correct app/key/origin configuration                                                                   |
| `SCHEMA_CHANGED`                                 | Regenerate/review models or migrate through an authorized workflow                                                        |
| `MODEL_VALIDATION_FAILED`                        | Correct the write payload's aliases, required fields, kinds or current enum choices                                       |
| `LEGACY_MUTATIONS_ENABLED`                       | Ask the administrator to complete the app's v1 write cutover                                                              |
| `WRITE_CONFLICT`                                 | Reload and let the user reconcile before replacing                                                                        |
| `CURSOR_RESET_REQUIRED`                          | Restart the public/member list                                                                                            |
| `SYNC_RESET_REQUIRED`                            | Erase the owned partition and perform a full sync                                                                         |
| `INVALID_CREDENTIALS`                            | Report failed sign-in; preserve an existing valid session                                                                 |
| `ALREADY_AUTHENTICATED`                          | Explicitly log out before switching users                                                                                 |
| `PENDING_REVOCATION`                             | Call `auth.retryPendingLogout()` or explicitly `auth.forgetPendingLogout()` before signing in                             |
| `SESSION_STORAGE_UNAVAILABLE`                    | Supply a supported atomic store; public content remains usable                                                            |
| `SESSION_STORAGE_CORRUPT`                        | Recover the stored record, or explicitly discard it with `auth.forgetPendingLogout()` without confirmed server revocation |
| `SESSION_PERSISTENCE_FAILED`                     | Repair storage and resolve any pending server revocation                                                                  |
| `PROOF_SESSION_EXPIRED`                          | Restart the bounded login, recovery or enrollment proof flow                                                              |

Read retries are bounded and honor `Retry-After` and `retryAfterSeconds`. A 429 means wait for the indicated budget delay. Writes and authentication mutations are not automatically retried after an ambiguous outcome.

A Fetch `TypeError` can mean network or CORS failure. It is not proof that the session ended. Preserve credentials through transient transport failures. Keep raw headers, bodies and secrets out of display-safe errors and logs.

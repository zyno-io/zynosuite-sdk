# Media

Authenticated uploads reserve a known-size object, PUT bytes to the signed storage request, then commit the reservation. Use the declared byte size and allowed media kind. An expired reservation requires a fresh reservation; committing does not make background processing instantaneous. Handle pending and failed processing states explicitly.

Configure `uploadTimeoutMs` on the client for object PUTs: it defaults to five minutes and accepts up to one hour. JSON requests retain their separate `timeoutMs` setting (30 seconds by default). An aborted or timed-out PUT can leave a pending reservation; obtain a fresh reservation after expiry rather than replaying a mutation blindly.

Object-storage requests use a separate raw transport. They contain only the signed request's required headers, never Suite publishable keys, session secrets or cookies. In browsers Fetch supplies `Content-Length`; do not set it or wrap the object PUT in multipart form data.

Public delivery resolves up to 20 upload IDs for one published entry in a batch. Each ID must occur in an approved media-typed field, including approved component subtrees. A matching text/JSON value grants nothing. The upload must be committed/live and the ready rendition kind/profile must be explicitly approved for the app/type. Source originals are never a public fallback. Canonical rendition selections are `thumbnail` / `256`, `imageVariant` / `1024`, `video` / `web`, and `poster` / `poster`; the app policy still controls which pairs are available.

```ts
const resolved = await client.media.resolvePublic('article', entryId, uploadIds, {
    kind: 'imageVariant',
    profile: '1024'
});
for (const item of resolved.items) {
    if (item.status === 'ready' && item.url && item.expiresAt) {
        displayUntil(item.url, item.expiresAt);
    }
}
```

Ready results include both a signed URL and exact `expiresAt`. Public signatures live for 300 seconds. New issuance stops when access is revoked; already issued URLs remain usable until signature expiry, and a transfer already started may continue. Downloaded copies cannot be revoked.

Resolve URLs when displaying media and refresh before expiry, or once after an expired-URL failure. Do not persist signed URLs in long-lived content records. Image and MP4/poster processing are supported; HLS is outside this contract.

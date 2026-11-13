# Media

A media field does not hold a URL. It holds an **upload ID**: a permanent name for the file. When you want to show the file, you ask for a URL, and that URL works for a few minutes. This keeps files private until someone is allowed to see them.

(An ordinary text field can contain any link an editor typed. This page is about media fields.)

So there are two jobs: upload a file to get an ID, and turn an ID into a URL when you display it.

## Upload an image

Uploads from the SDK are **images only**, and need a signed-in user. Pass the image as a `Blob` (a `File` from a file input works) or a `Uint8Array`, with its content type.

```ts
import { client } from './zyno.js';

/** Returns the upload ID to store in a media field. */
export async function uploadPhoto(file: File): Promise<string> {
    const { id } = await client.media.upload(file, file.type);
    return id;
}
```

Save the returned ID in a media field of one of the user's records. Your schema needs such a field; the sample `favorite` type does not have one.

Good to know:

- **The bytes go straight to file storage, not through ZynoSuite.** Your keys and the user's login are never sent there.
- **Uploads have their own time limit.** `uploadTimeoutMs` on `createClient` defaults to five minutes and can be raised to one hour.
- **The SDK does not retry an upload.** If one fails or times out, call `upload` again to start a fresh one.
- **Display sizes are prepared afterwards.** For a short while, asking for a URL can report `processing`.

## Show media from public content

For public content, ask for URLs by entry: the type, the entry's ID, up to 20 upload IDs from that entry's media fields, and the size you want.

This example assumes your administrator has added an image field to `article` and approved the `imageVariant` / `1024` size. The sample schema has no media fields.

```ts
import { client } from './zyno.js';

export async function articleImage(entryId: string, uploadId: string) {
    const result = await client.media.resolvePublic('article', entryId, [uploadId], { kind: 'imageVariant', profile: '1024' });
    return result.items[0];
}
```

Each item has a `status`:

- `ready`: `url` and `expiresAt` are present. Display it now.
- `processing`: the size is still being prepared. Try again shortly.
- `failed`: preparing it failed. Waiting will not help.
- `unavailable`: this file, in this size, is not approved for this entry or does not exist. Waiting will not help.

The SDK does not poll. If you poll, do it only while the status is `processing`, pause a couple of seconds between tries and give up after a few. Show a placeholder for `failed` and `unavailable` straight away.

### Sizes

You ask for an exact `kind` and `profile` pair, and you get that pair or nothing:

- `thumbnail` / `'256'`: small image
- `imageVariant` / `'1024'`: larger image
- `video` / `'web'`: video for playback in browsers
- `poster` / `'poster'`: still image for a video

Video and poster are for video that staff added to content in ZynoSuite; the SDK cannot upload video. Your administrator approves which pairs your app may use for each type. The original file is never served publicly, and a different size is never substituted.

A URL is only given for an upload ID that sits in an approved media field of that published entry. An ID pasted into a text field unlocks nothing.

## URLs expire

A public URL works until its `expiresAt`, a few minutes after it was issued.

- **Get URLs when you display the media**, and keep them in memory only.
- **Refresh before `expiresAt`**, or once if an image fails to load because its URL expired.
- **Do not save URLs.** Not in your database, not in a user's records, not in server-rendered or cached HTML. Save the upload ID.

If access is withdrawn, no new URLs are issued. One already issued keeps working until it expires.

## Show media to a signed-in user

Media in members-only content or in the user's own records uses a different call. It goes through the user's login instead of an entry's public approval, takes one ID and needs no entry:

```ts
const result = await client.media.resolveMember(uploadId, { kind: 'thumbnail', profile: '256' });
if (result.status === 'ready' && result.url) {
    // Display result.url now.
}
```

Here `status` is `ready`, `processing` or `failed`. Treat the URL the same way: use it now and do not save it.

## Next

- [Reading content](content.md): where media fields come from.
- [Browser, native and server](runtimes.md): why media URLs stay out of server-rendered pages.

# Typed schemas

The file you generate from `app-schema.json` gives TypeScript the names and types of your fields. It also tells the SDK at runtime how to translate between those names and what the server stores.

## What gets generated

For the sample schema, `npx zynosuite-models app-schema.json src/zyno.generated.ts` produces these types:

```ts
export type public_articleRead = {
    title: string | null;
    body: string | null;
};
export type owned_favoriteRead = {
    name: string | null;
    state: string | null;
};
export type owned_favoriteWrite = {
    name: string;
    state?: 'active' | 'archived';
};
```

It also exports `schema`, which you pass to `createClient`. You rarely need the type names, because the client works them out from the type key:

```ts
const article = await client.content.get('article', id); // data is public_articleRead
await client.owned.create('favorite', { name: 'Coffee' }); // checked against owned_favoriteWrite
```

Do not edit the generated file. Regenerate it instead.

## Field IDs and field names

In the schema file each field has two names:

```json
{ "id": "favorite-name-id", "alias": "name", "type": "text" }
```

The **ID** is how the server stores the field, and it never changes. The **alias** is the property name you use in code. The SDK converts between them on every read and write.

ZynoSuite also keeps a display **label** for each field, shown in its own admin screens. That is presentation only and is deliberately left out of the schema file, so it never appears in your generated code.

## Why read fields are nullable

Read types add `| null` to every field, and choice fields read as `string`. That reflects real data:

- An entry saved before a field existed has no value for it.
- An entry can hold a choice that was later removed from the list.
- In a user's own records, a stored value that no longer fits the field's current type reads as `null`, so one old record does not break a whole list.

Handle `null` and unknown choices; do not silence the compiler with a cast. Dates and date-times are ISO strings, not `Date` objects.

## Write types are strict

Write types exist only for user-owned types, because those are the only records your app saves.

- A field is required unless the schema marks it optional or conditional.
- Choice fields accept only the current options.
- A property that is not in the schema is rejected.

The SDK checks these before sending and throws `MODEL_VALIDATION_FAILED` when a value does not fit. The server checks again against its current schema.

## When the schema changes

An installed app keeps the schema it was built with. Two kinds of change leave its saves working:

- **Naming and presentation changes.** An administrator renames an alias or edits a label, and the rules for what may be saved stay the same. An installed app notices neither. When you regenerate, an alias rename shows up in the diff and as compile errors where you used the old name. A label-only change shows up nowhere, because labels are not in the schema file.
- **New optional simple fields.** The new field must be optional, sit at the top level of the type, have no condition attached and hold a simple value or a list of choices: text, a number, a yes/no, one choice, several choices, a date or a date and time. Older app versions do not see it, and saving from one keeps its stored value.

A change to the rules or the shape of what may be saved makes saves from an app built on the old schema fail with `SCHEMA_CHANGED`. That includes removing a field, changing a type, making a field required, and adding a nested field, a component, a media field or a link to another entry. Regenerate, fix the compile errors and release an update.

Reading is affected differently:

- **A user's own records** stay readable, and `raw` (below) still carries everything the server holds.
- **Public content** of a changed type can stop being delivered until the administrator approves the new shape. Public reads of that type fail until then; ask them to reapprove it.

Changing a field's type creates a new field with a new ID. Data under the old ID is not converted for you; ask your administrator to migrate it.

Each entry's `meta` has `definitionId` (the version it was saved with) and `activeDefinitionId` (the current version) if you want to spot old entries.

## The untouched copy: `raw`

Entries from `client.owned` carry a third property next to `meta` and `data`:

```ts
const favorite = await client.owned.get('favorite', id);
favorite.data; // your typed fields
favorite.raw; // exactly what the server sent, keyed by field ID
```

`raw` can include fields your installed app does not know about yet. Store it in your local cache if you keep one, so a later app version can read those fields without downloading everything again.

Never send `raw` back in a save, and do not copy values out of it into one. [Saved user data](owned.md) explains how to build a save.

## Next

- [Saved user data](owned.md): creating and editing records with the write types.
- [Reading content](content.md): how read values behave in practice.

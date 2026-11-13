import { client } from './browser.js';

export async function renameFavorite(id: string, name: string) {
    const current = await client.owned.get('favorite', id);
    // Build the full editable document deliberately. Never spread current.raw.data into a write.
    return client.owned.replace(
        'favorite',
        id,
        { name, state: 'active' },
        {
            expectedWriteRevision: current.meta.writeRevision
        }
    );
}

export async function fetchOwnedSnapshot() {
    const pages = [];
    for await (const page of client.owned.sync('favorite')) pages.push(page);
    // The host app applies all raw field-ID records and deletedIds atomically before checkpointing.
    return pages;
}

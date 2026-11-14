import { createClient } from '@zyno-io/zynosuite-sdk';

import { schema } from './zyno.generated.js';

// Replace these public configuration values with the app's staff-approved values.
export const client = createClient({
    environment: 'production',
    appKey: 'example-app',
    publishableKey: 'example-publishable-key',
    schema,
    runtime: 'browser'
});

export async function publicArticle(slug: string) {
    const article = await client.content.getBySlug('article', slug);
    return article.data.title; // string | null; fields from historical publications can be absent.
}
export async function signIn(email: string, password: string) {
    return client.auth.signIn({ email, password });
}
export async function restoreSession() {
    return client.auth.restore();
}

// Contract checks: model keys and fields come from the exported app schema.
async function typeContractOnly() {
    // @ts-expect-error Unapproved type keys do not exist in the public view.
    await client.content.get('staff-only', 'entry');
    const article = await client.content.get('article', 'entry');
    // @ts-expect-error The ID envelope is separate from application data fields.
    void article.data.nonexistent;
    // @ts-expect-error Current enum choices constrain writes.
    await client.owned.create('favorite', { name: 'A', state: 'invalid-choice' });
}
void typeContractOnly;

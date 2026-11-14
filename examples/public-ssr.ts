import { createClient } from '@zyno-io/zynosuite-sdk';

import { schema } from './zyno.generated.js';

/** Create per request; SSR v1 is anonymous text content only. */
export async function renderArticleTitle(slug: string): Promise<string> {
    const client = createClient({
        environment: 'production',
        appKey: 'example-app',
        publishableKey: 'example-publishable-key',
        schema,
        runtime: 'server',
        origin: 'https://example.app'
    });
    const article = await client.content.getBySlug('article', slug);
    return article.data.title ?? 'Untitled';
}

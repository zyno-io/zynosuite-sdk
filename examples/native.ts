import { createClient, type SessionStore } from '@zyno-io/zynosuite-sdk';

import { schema } from './zyno.generated.js';

/** The host supplies an atomic secure-storage adapter implementing SessionStore. */
export function createNativeClient(store: SessionStore) {
    return createClient({
        environment: 'production',
        appKey: 'example-app',
        publishableKey: 'example-publishable-key',
        schema,
        runtime: 'native',
        origin: 'https://example.app',
        store
    });
}

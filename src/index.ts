import type { GeneratedSchema, ModelShape } from './models.js';
import type { SessionStore } from './storage.js';
import type { RequestOptions, TransportOptions } from './transport.js';

import { Auth, withAuthentication } from './auth.js';
import { ContentClient, OwnedClient } from './content.js';
import { ZynoSuiteError } from './errors.js';
import { MediaClient } from './media.js';
import { ModelMapper } from './models.js';
import { BrowserSessionStore } from './storage.js';
import { Transport } from './transport.js';

export { Auth } from './auth.js';
export type { AuthState } from './auth.js';
export { ZynoSuiteError } from './errors.js';
export { ContentClient, OwnedClient } from './content.js';
export type { ContentQuery, OwnedQuery, ContentPage, OwnedEntry, OwnedPage, CreateMetadata, ReplaceMetadata } from './content.js';
export { MediaClient } from './media.js';
export type { PublicRendition, MemberRendition } from './media.js';
export type {
    GeneratedSchema,
    ModelShape,
    AppModels,
    ModelBinding,
    Entry,
    ReadModel,
    WriteModel,
    FieldSchema,
    TypeSchema,
    ModelView,
    JsonValue,
    MediaReference,
    RelationRead
} from './models.js';
export { MemorySessionStore, BrowserSessionStore } from './storage.js';
export type { SessionStore, SessionTransaction, StoredSession } from './storage.js';
export type { RequestOptions, TransportOptions, Runtime } from './transport.js';
export type * from './generated/types.js';

export interface ClientOptions<M extends ModelShape<M>> extends TransportOptions {
    schema: GeneratedSchema<M>;
    store?: SessionStore;
}

/** Create a typed application client from the staff-exported, generated schema manifest. */
export function createClient<M extends ModelShape<M>>(options: ClientOptions<M>) {
    const transport = new Transport(options);
    const mapper = new ModelMapper(options.schema);
    if (transport.runtime === 'server' && options.store) throw new ZynoSuiteError('AUTHENTICATED_SSR_UNSUPPORTED');
    let store = options.store;
    if (!store && transport.runtime === 'browser') {
        try {
            store = new BrowserSessionStore();
        } catch {
            /* Public reads still work when durable storage is unavailable. */
        }
    }
    const auth = new Auth(transport, store);
    return {
        namespace: transport.namespace,
        auth,
        content: new ContentClient('public', transport, auth, mapper),
        memberContent: new ContentClient('member', transport, auth, mapper),
        owned: new OwnedClient(transport, auth, mapper),
        media: new MediaClient<M>(transport, auth),
        me: (request: RequestOptions = {}) => withAuthentication(auth, secret => transport.operation('getSdkMe', { secret, ...request })),
        dispose: () => auth.dispose()
    };
}

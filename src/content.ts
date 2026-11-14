import type { Auth } from './auth.js';
import type { Operations } from './generated/operations.js';
import type { ISdkV1Entry, ISdkV1List, ISdkV1Sync, ISdkOwnedV1Create, ISdkOwnedV1Replace } from './generated/types.js';
import type { Entry, ModelShape, ReadModel, WriteModel } from './models.js';
import type { RequestOptions } from './transport.js';

import { withAuthentication } from './auth.js';
import { copy } from './copy.js';
import { ZynoSuiteError } from './errors.js';
import { ModelMapper } from './models.js';
import { Transport } from './transport.js';

export type ContentQuery = Operations['getSdkPublicBrowseV1List']['query'];
export type OwnedQuery = Operations['getSdkOwnedV1Sync']['query'];
export type ContentPage<T extends object> = Omit<ISdkV1List, 'items'> & { items: Entry<T>[] };
/** raw preserves unrecognized historical field IDs for local snapshots; never spread it into a replacement. */
export interface OwnedEntry<T extends object> extends Entry<T> {
    raw: ISdkV1Entry;
}
export type OwnedPage<T extends object> = Omit<ISdkV1Sync, 'items'> & { items: OwnedEntry<T>[] };
export type CreateMetadata = Omit<ISdkOwnedV1Create, 'data'>;
export type ReplaceMetadata = Omit<ISdkOwnedV1Replace, 'data' | 'clientDefinitionId'>;

function list(value: unknown): ISdkV1List {
    if (!value || typeof value !== 'object') throw new ZynoSuiteError('INVALID_RESPONSE');
    const result = value as ISdkV1List;
    if (
        !Array.isArray(result.items) ||
        (result.nextCursor !== null && typeof result.nextCursor !== 'string') ||
        typeof result.contextVersion !== 'string'
    )
        throw new ZynoSuiteError('INVALID_RESPONSE');
    return result;
}
export class ContentClient<M extends ModelShape<M>, V extends 'public' | 'member'> {
    constructor(
        private readonly view: V,
        private readonly transport: Transport,
        private readonly auth: Auth,
        private readonly mapper: ModelMapper<M>
    ) {}
    async list<K extends keyof M[V] & string>(
        key: K,
        query: ContentQuery = {},
        options: RequestOptions = {}
    ): Promise<ContentPage<ReadModel<M, V, K>>> {
        this.mapper.type(this.view, key);
        const result =
            this.view === 'public'
                ? await this.transport.operation('getSdkPublicBrowseV1List', { path: { key }, query, ...options })
                : await withAuthentication(this.auth, secret =>
                      this.transport.operation('getSdkMemberBrowseV1List', { path: { key }, query, secret, ...options })
                  );
        const page = list(result);
        return { ...page, items: page.items.map(item => this.mapper.read(this.view, key, item)) };
    }
    async get<K extends keyof M[V] & string>(key: K, id: string, options: RequestOptions = {}): Promise<Entry<ReadModel<M, V, K>>> {
        this.mapper.type(this.view, key);
        const raw =
            this.view === 'public'
                ? await this.transport.operation('getSdkPublicBrowseV1Get', { path: { key, id }, ...options })
                : await withAuthentication(this.auth, secret =>
                      this.transport.operation('getSdkMemberBrowseV1Get', { path: { key, id }, secret, ...options })
                  );
        return this.mapper.read(this.view, key, raw);
    }
    async getBySlug<K extends keyof M[V] & string>(key: K, slug: string, options: RequestOptions = {}): Promise<Entry<ReadModel<M, V, K>>> {
        this.mapper.type(this.view, key);
        const raw =
            this.view === 'public'
                ? await this.transport.operation('getSdkPublicBrowseV1Slug', { path: { key, slug }, ...options })
                : await withAuthentication(this.auth, secret =>
                      this.transport.operation('getSdkMemberBrowseV1Slug', { path: { key, slug }, secret, ...options })
                  );
        return this.mapper.read(this.view, key, raw);
    }
}

export class OwnedClient<M extends ModelShape<M>> {
    constructor(
        private readonly transport: Transport,
        private readonly auth: Auth,
        private readonly mapper: ModelMapper<M>
    ) {}
    async list<K extends keyof M['owned'] & string>(
        key: K,
        query: OwnedQuery = {},
        options: RequestOptions = {}
    ): Promise<OwnedPage<ReadModel<M, 'owned', K>>> {
        this.mapper.type('owned', key);
        const raw = await withAuthentication(this.auth, secret =>
            this.transport.operation('getSdkOwnedV1Sync', { path: { key }, query, secret, ...options })
        );
        const page = list(raw) as ISdkV1Sync;
        if (!Array.isArray(page.deletedIds) || page.deletedIds.some(id => typeof id !== 'string') || typeof page.syncUntil !== 'string')
            throw new ZynoSuiteError('INVALID_RESPONSE');
        return { ...page, items: page.items.map(item => this.read(key, item)) };
    }
    async get<K extends keyof M['owned'] & string>(key: K, id: string, options: RequestOptions = {}): Promise<OwnedEntry<ReadModel<M, 'owned', K>>> {
        this.mapper.type('owned', key);
        const raw = await withAuthentication(this.auth, secret =>
            this.transport.operation('getSdkOwnedV1Get', { path: { key, id }, secret, ...options })
        );
        return this.read(key, raw);
    }
    async create<K extends keyof M['owned'] & string>(
        key: K,
        data: WriteModel<M, K>,
        metadata: CreateMetadata = {},
        options: RequestOptions = {}
    ): Promise<OwnedEntry<ReadModel<M, 'owned', K>>> {
        const values = this.mapper.write(key, data);
        const raw = await withAuthentication(this.auth, secret =>
            this.transport.operation('postSdkOwnedV1Create', { path: { key }, body: { ...metadata, data: values }, secret, ...options })
        );
        return this.read(key, raw);
    }
    async replace<K extends keyof M['owned'] & string>(
        key: K,
        id: string,
        data: WriteModel<M, K>,
        metadata: ReplaceMetadata,
        options: RequestOptions = {}
    ): Promise<OwnedEntry<ReadModel<M, 'owned', K>>> {
        const type = this.mapper.type('owned', key);
        const values = this.mapper.write(key, data);
        const raw = await withAuthentication(this.auth, secret =>
            this.transport.operation('putSdkOwnedV1Replace', {
                path: { key, id },
                body: { ...metadata, data: values, clientDefinitionId: type.definitionId },
                secret,
                ...options
            })
        );
        return this.read(key, raw);
    }
    async remove<K extends keyof M['owned'] & string>(
        key: K,
        id: string,
        expectedWriteRevision: number,
        options: RequestOptions = {}
    ): Promise<void> {
        this.mapper.type('owned', key);
        await withAuthentication(this.auth, secret =>
            this.transport.operation('deleteSdkOwnedV1Remove', { path: { key, id }, query: { expectedWriteRevision }, secret, ...options })
        );
    }
    async batch<P extends keyof M['owned'] & string, K extends keyof M['owned'] & string>(
        parentKey: P,
        parentId: string,
        childKey: K,
        rows: WriteModel<M, K>[],
        options: RequestOptions = {}
    ): Promise<OwnedEntry<ReadModel<M, 'owned', K>>[]> {
        this.mapper.type('owned', parentKey);
        const body = { rows: rows.map(data => ({ data: this.mapper.write(childKey, data) })) };
        const raw = await withAuthentication(this.auth, secret =>
            this.transport.operation('postSdkOwnedV1Batch', { path: { key: parentKey, id: parentId, childKey }, body, secret, ...options })
        );
        if (!Array.isArray(raw)) throw new ZynoSuiteError('INVALID_RESPONSE');
        return raw.map(item => this.read(childKey, item));
    }
    /** Persist each page and only advance your checkpoint after the final page. Access/schema resets throw SYNC_RESET_REQUIRED. */
    async *sync<K extends keyof M['owned'] & string>(
        key: K,
        query: Omit<OwnedQuery, 'cursor'> = {},
        options: RequestOptions = {}
    ): AsyncGenerator<OwnedPage<ReadModel<M, 'owned', K>>> {
        let cursor: string | undefined;
        let contextVersion = query.contextVersion;
        let syncUntil: string | undefined;
        const seen = new Set<string>();
        do {
            const page = await this.list(key, { ...query, contextVersion, cursor }, options);
            if ((contextVersion && page.contextVersion !== contextVersion) || (syncUntil && page.syncUntil !== syncUntil))
                throw new ZynoSuiteError('SYNC_RESET_REQUIRED', 409);
            contextVersion = page.contextVersion;
            syncUntil = page.syncUntil;
            if (page.nextCursor && seen.has(page.nextCursor)) throw new ZynoSuiteError('INVALID_RESPONSE');
            if (page.nextCursor) seen.add(page.nextCursor);
            yield page;
            cursor = page.nextCursor ?? undefined;
        } while (cursor);
    }
    private read<K extends keyof M['owned'] & string>(key: K, raw: ISdkV1Entry): OwnedEntry<ReadModel<M, 'owned', K>> {
        const mapped = this.mapper.read('owned', key, raw);
        return { ...mapped, raw: copy(raw) };
    }
}

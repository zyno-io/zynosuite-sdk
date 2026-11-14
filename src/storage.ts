import type { ISdkCustomerSession } from './generated/types.js';

import { copy } from './copy.js';
import { ZynoSuiteError } from './errors.js';

export interface StoredSession {
    /** Pending revocation hides the user immediately while preserving the credential needed to retry logout. */
    state: 'active' | 'pending-revocation';
    secret: string;
    session: ISdkCustomerSession;
}
export interface SessionTransaction {
    read(): Promise<StoredSession | null>;
    write(value: StoredSession | null): Promise<void>;
}
/** Native adapters must serialize the entire callback across all clients sharing a namespace. */
export interface SessionStore {
    read(namespace: string): Promise<StoredSession | null>;
    withLock<T>(namespace: string, action: (transaction: SessionTransaction) => Promise<T>): Promise<T>;
    subscribe?(namespace: string, listener: () => void): () => void;
}
const clone = copy;
const browserListeners = new Map<string, Set<() => void>>();

/** Explicit process-local persistence, suitable for tests and a single native process. */
export class MemorySessionStore implements SessionStore {
    private readonly records = new Map<string, StoredSession>();
    private readonly queues = new Map<string, Promise<void>>();
    private readonly listeners = new Map<string, Set<() => void>>();
    async read(namespace: string): Promise<StoredSession | null> {
        return clone(this.records.get(namespace) ?? null);
    }
    async withLock<T>(namespace: string, action: (transaction: SessionTransaction) => Promise<T>): Promise<T> {
        const previous = this.queues.get(namespace) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const next = previous.then(() => gate);
        this.queues.set(namespace, next);
        await previous;
        try {
            return await action({
                read: () => this.read(namespace),
                write: async value => {
                    if (value) this.records.set(namespace, clone(value));
                    else this.records.delete(namespace);
                    for (const listener of this.listeners.get(namespace) ?? []) queueMicrotask(listener);
                }
            });
        } finally {
            release();
            if (this.queues.get(namespace) === next) this.queues.delete(namespace);
        }
    }
    subscribe(namespace: string, listener: () => void): () => void {
        const listeners = this.listeners.get(namespace) ?? new Set<() => void>();
        this.listeners.set(namespace, listeners);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }
}

function decode(value: string | null): StoredSession | null {
    if (value === null) return null;
    try {
        const record: unknown = JSON.parse(value);
        if (record && typeof record === 'object') {
            const row = record as StoredSession;
            if (
                (row.state === 'active' || row.state === 'pending-revocation') &&
                typeof row.secret === 'string' &&
                row.secret.length > 0 &&
                row.session?.phase === 'authenticated' &&
                row.session.principal &&
                typeof row.session.sessionId === 'string'
            )
                return row;
        }
    } catch {
        /* Corrupt records cannot be advertised as an authenticated session. */
    }
    throw new ZynoSuiteError('SESSION_STORAGE_CORRUPT');
}

/** Durable browser storage requires Web Locks; no unsafe localStorage-only fallback is used. */
export class BrowserSessionStore implements SessionStore {
    private readonly storage: Storage;
    private readonly locks: LockManager;
    constructor() {
        try {
            if (typeof window === 'undefined' || !window.navigator.locks) throw new Error();
            this.storage = window.localStorage;
            this.locks = window.navigator.locks;
        } catch {
            throw new ZynoSuiteError('SESSION_STORAGE_UNAVAILABLE');
        }
    }
    async read(namespace: string): Promise<StoredSession | null> {
        try {
            return decode(this.storage.getItem(namespace));
        } catch (error) {
            if (error instanceof ZynoSuiteError) throw error;
            throw new ZynoSuiteError('SESSION_STORAGE_UNAVAILABLE');
        }
    }
    async withLock<T>(namespace: string, action: (transaction: SessionTransaction) => Promise<T>): Promise<T> {
        return this.locks.request(namespace, async () =>
            action({
                read: () => this.read(namespace),
                write: async value => {
                    try {
                        if (value) this.storage.setItem(namespace, JSON.stringify(value));
                        else this.storage.removeItem(namespace);
                    } catch {
                        throw new ZynoSuiteError('SESSION_STORAGE_UNAVAILABLE');
                    }
                    for (const listener of browserListeners.get(namespace) ?? []) queueMicrotask(listener);
                }
            })
        );
    }
    subscribe(namespace: string, listener: () => void): () => void {
        const listeners = browserListeners.get(namespace) ?? new Set<() => void>();
        listeners.add(listener);
        browserListeners.set(namespace, listeners);
        const event = (change: StorageEvent) => {
            if (change.storageArea === this.storage && (change.key === namespace || change.key === null)) listener();
        };
        window.addEventListener('storage', event);
        return () => {
            listeners.delete(listener);
            window.removeEventListener('storage', event);
        };
    }
}

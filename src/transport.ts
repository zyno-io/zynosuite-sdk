import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { Operations } from './generated/operations.js';

import { ZynoSuiteError, protocolError } from './errors.js';
import { operations } from './generated/operations.js';

export type Runtime = 'browser' | 'native' | 'server';
export interface TransportOptions {
    appKey: string;
    publishableKey: string;
    environment?: 'production' | 'alpha';
    apiBase?: string;
    runtime?: Runtime;
    /** Registered origin for native and public-only server clients; browsers supply their own Origin. */
    origin?: string;
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
    /** Signed object PUT timeout; defaults to five minutes, independently of JSON requests. */
    uploadTimeoutMs?: number;
    maxReadRetries?: number;
    maxRetryDelayMs?: number;
}
export interface RequestOptions {
    signal?: AbortSignal;
}
export type Query = Record<string, string | number | boolean | undefined | null>;
export function segment(value: string): string {
    if (!value || value === '.' || value === '..' || value.length > 1024) throw new ZynoSuiteError('INVALID_PATH_PARAMETER');
    return encodeURIComponent(value);
}

export class Transport {
    readonly runtime: Runtime;
    readonly namespace: string;
    readonly apiBase: string;
    private readonly fetcher: typeof globalThis.fetch;
    private readonly headers: Record<string, string>;
    private readonly timeoutMs: number;
    private readonly uploadTimeoutMs: number;
    private readonly retries: number;
    private readonly maxRetryDelayMs: number;
    constructor(options: TransportOptions) {
        this.runtime = options.runtime ?? (typeof window !== 'undefined' && typeof document !== 'undefined' ? 'browser' : 'server');
        const base = new URL(
            options.apiBase ?? (options.environment === 'alpha' ? 'https://suite.api-alpha.zyno.dev' : 'https://suite.api.zyno.app')
        );
        if (
            base.username ||
            base.password ||
            base.search ||
            base.hash ||
            (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))
        )
            throw new ZynoSuiteError('INVALID_API_BASE');
        this.apiBase = base.href.replace(/\/$/, '');
        const origin = this.runtime === 'browser' ? globalThis.location?.origin : options.origin;
        if (!origin || origin === 'null') throw new ZynoSuiteError('ORIGIN_REQUIRED');
        const parsedOrigin = new URL(origin);
        if (
            parsedOrigin.origin !== origin ||
            (parsedOrigin.protocol !== 'https:' &&
                !(
                    base.protocol === 'http:' &&
                    parsedOrigin.protocol === 'http:' &&
                    ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname)
                ))
        )
            throw new ZynoSuiteError('INVALID_ORIGIN');
        if (!options.appKey || !options.publishableKey || /[\r\n]/.test(options.appKey + options.publishableKey))
            throw new ZynoSuiteError('INVALID_APP_CONFIGURATION');
        this.headers = { 'x-zs-sdk-app-key': options.appKey, 'x-zs-publishable-key': options.publishableKey, accept: 'application/json' };
        if (this.runtime !== 'browser') this.headers.origin = origin;
        const fingerprint = bytesToHex(sha256(new TextEncoder().encode(options.publishableKey)));
        this.namespace = `zs:sdk:v1:${JSON.stringify([this.apiBase, options.environment ?? 'production', options.appKey, fingerprint, origin])}`;
        this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.uploadTimeoutMs = options.uploadTimeoutMs ?? 300_000;
        this.retries = options.maxReadRetries ?? 2;
        this.maxRetryDelayMs = options.maxRetryDelayMs ?? 10_000;
        if (
            !Number.isFinite(this.timeoutMs) ||
            this.timeoutMs <= 0 ||
            this.timeoutMs > 120_000 ||
            !Number.isFinite(this.uploadTimeoutMs) ||
            this.uploadTimeoutMs <= 0 ||
            this.uploadTimeoutMs > 3_600_000 ||
            !Number.isInteger(this.retries) ||
            this.retries < 0 ||
            this.retries > 5 ||
            !Number.isFinite(this.maxRetryDelayMs) ||
            this.maxRetryDelayMs < 0 ||
            this.maxRetryDelayMs > 60_000
        )
            throw new ZynoSuiteError('INVALID_TRANSPORT_OPTIONS');
    }
    async operation<K extends keyof Operations>(
        name: K,
        parameters: {
            body?: Operations[K]['body'];
            path?: Operations[K]['path'];
            query?: Operations[K]['query'];
            secret?: string;
            signal?: AbortSignal;
        } = {}
    ): Promise<Operations[K]['response']> {
        const operation = operations[name];
        let path: string = operation.path;
        for (const [key, value] of Object.entries(parameters.path ?? {})) path = path.replace(`{${key}}`, segment(String(value)));
        if (path.includes('{')) throw new ZynoSuiteError('INVALID_PATH_PARAMETER');
        return this.request(operation.method, path, {
            body: parameters.body,
            query: parameters.query as Query,
            secret: parameters.secret,
            signal: parameters.signal
        }) as Promise<Operations[K]['response']>;
    }
    async request(
        method: string,
        path: string,
        options: { body?: unknown; query?: Query; secret?: string; signal?: AbortSignal } = {}
    ): Promise<unknown> {
        if (!path.startsWith('/sdk/') || path.includes('?') || path.includes('#') || path.includes('\\'))
            throw new ZynoSuiteError('INVALID_REQUEST_PATH');
        for (const part of path.split('/')) {
            let decoded: string;
            try {
                decoded = decodeURIComponent(part);
            } catch {
                throw new ZynoSuiteError('INVALID_REQUEST_PATH');
            }
            if (decoded === '.' || decoded === '..') throw new ZynoSuiteError('INVALID_REQUEST_PATH');
        }
        if (options.secret && this.runtime === 'server') throw new ZynoSuiteError('AUTHENTICATED_SSR_UNSUPPORTED');
        const url = new URL(this.apiBase + path);
        for (const [key, value] of Object.entries(options.query ?? {}))
            if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
        const headers = new Headers(this.headers);
        if (options.secret) headers.set('x-zs-customer-session', options.secret);
        if (options.body !== undefined) headers.set('content-type', 'application/json');
        for (let attempt = 0; ; attempt++) {
            const timeout = new AbortController();
            const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
            const abort = () => timeout.abort();
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) timeout.abort();
            let retryDelay: number | undefined;
            try {
                const response = await this.fetcher(url.href, {
                    method,
                    headers,
                    body: options.body === undefined ? undefined : JSON.stringify(options.body),
                    credentials: 'omit',
                    redirect: 'error',
                    signal: timeout.signal
                });
                let payload: unknown;
                if (response.status !== 204) {
                    try {
                        payload = await response.json();
                    } catch {
                        if (response.ok) throw new ZynoSuiteError('INVALID_RESPONSE', response.status);
                    }
                }
                if (response.ok) return payload;
                const error = protocolError(response.status, payload, response.headers.get('retry-after'));
                const transient = [429, 502, 503, 504].includes(response.status);
                if (method !== 'GET' || attempt >= this.retries || !transient) throw error;
                retryDelay =
                    error.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1000 : response.status === 429 ? undefined : 200 * 2 ** attempt;
                if (retryDelay === undefined || retryDelay > this.maxRetryDelayMs) throw error;
            } catch (error) {
                if (error instanceof ZynoSuiteError) throw error;
                if (options.signal?.aborted) throw new ZynoSuiteError('REQUEST_ABORTED');
                if (method !== 'GET' || attempt >= this.retries)
                    throw new ZynoSuiteError(timeout.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR');
                retryDelay = 200 * 2 ** attempt;
            } finally {
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', abort);
            }
            await this.wait(retryDelay!, options.signal);
        }
    }
    /** Signed storage transport deliberately has no Suite headers, credentials, or redirect following. */
    async upload(url: string, headers: Record<string, string>, bytes: Blob | Uint8Array, signal?: AbortSignal): Promise<void> {
        const target = new URL(url);
        if (target.protocol !== 'https:' || target.username || target.password) throw new ZynoSuiteError('INVALID_UPLOAD_URL');
        const safe = new Headers();
        for (const [key, value] of Object.entries(headers)) {
            const normalized = key.toLowerCase();
            if (['authorization', 'cookie', 'origin', 'host'].includes(normalized) || normalized.startsWith('x-zs-'))
                throw new ZynoSuiteError('UNSAFE_UPLOAD_HEADERS');
            if (normalized === 'content-length' && this.runtime === 'browser') continue;
            safe.set(key, value);
        }
        const timeout = new AbortController();
        const timer = setTimeout(() => timeout.abort(), this.uploadTimeoutMs);
        const abort = () => timeout.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) timeout.abort();
        try {
            const data = bytes instanceof Uint8Array ? Uint8Array.from(bytes) : bytes;
            const response = await this.fetcher(url, {
                method: 'PUT',
                headers: safe,
                body: data,
                credentials: 'omit',
                redirect: 'error',
                signal: timeout.signal
            });
            if (!response.ok) throw new ZynoSuiteError('UPLOAD_FAILED', response.status);
        } catch (error) {
            if (error instanceof ZynoSuiteError) throw error;
            throw new ZynoSuiteError(signal?.aborted ? 'REQUEST_ABORTED' : timeout.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR');
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }
    private async wait(ms: number, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) throw new ZynoSuiteError('REQUEST_ABORTED');
        await new Promise<void>((resolve, reject) => {
            const abort = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                reject(new ZynoSuiteError('REQUEST_ABORTED'));
            };
            const timer = setTimeout(() => {
                signal?.removeEventListener('abort', abort);
                resolve();
            }, ms);
            signal?.addEventListener('abort', abort, { once: true });
        });
    }
}

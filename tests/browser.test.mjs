import assert from 'node:assert/strict';
import test from 'node:test';

import { createClient, BrowserSessionStore, MemorySessionStore } from '../dist/index.js';

const schema = {
    formatVersion: 1,
    appId: 'app',
    schemaDigest: 'manifest',
    views: {
        public: { article: { key: 'article', typeId: 'type', definitionId: 'definition', schemaDigest: 'digest', fields: [] } },
        member: {},
        owned: {}
    }
};
const record = {
    state: 'active',
    secret: 'secret',
    session: {
        phase: 'authenticated',
        principal: { method: 'password' },
        sessionId: 'session',
        sdkAppId: 'app',
        targetCartId: null,
        expiresAt: null,
        idleExpiresAt: null
    }
};
const values = new Map();
const events = new Map();
const locks = new MemorySessionStore();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
globalThis.window = {
    localStorage: storage,
    navigator: { locks: { request: (name, callback) => locks.withLock(name, async () => callback()) } },
    addEventListener: (key, listener) => {
        const listeners = events.get(key) ?? new Set();
        listeners.add(listener);
        events.set(key, listeners);
    },
    removeEventListener: (key, listener) => events.get(key)?.delete(listener)
};
globalThis.location = { origin: 'https://browser.example' };
globalThis.document = {};
const options = { appKey: 'app', publishableKey: 'key', schema, runtime: 'browser', origin: 'https://ignored-native.example', maxReadRetries: 0 };

test('browser Origin is never manually set and unavailable Web Locks do not block public reads', async () => {
    const previous = window.navigator.locks;
    window.navigator.locks = undefined;
    try {
        const client = createClient({
            ...options,
            fetch: async (url, init) => {
                assert.equal(init.headers.get('origin'), null);
                return new Response(
                    JSON.stringify({
                        meta: {
                            id: 'one',
                            definitionId: 'd',
                            activeDefinitionId: 'd',
                            schemaDigest: 'digest',
                            contextVersion: 'context',
                            writeRevision: 1
                        },
                        data: {}
                    })
                );
            }
        });
        assert.equal(client.auth.state.status, 'storage-unavailable');
        await client.content.get('article', 'one');
        await assert.rejects(client.auth.restore(), { code: 'SESSION_STORAGE_UNAVAILABLE' });
        await assert.rejects(client.auth.logout(), { code: 'SESSION_STORAGE_UNAVAILABLE' });
        assert.equal(client.auth.state.status, 'storage-unavailable');
    } finally {
        window.navigator.locks = previous;
    }
});

test('separate browser adapters coordinate atomically and notify same-window clients', async () => {
    const first = new BrowserSessionStore(),
        second = new BrowserSessionStore();
    let changes = 0;
    const unsubscribe = second.subscribe('namespace', () => {
        changes++;
    });
    const sequence = [];
    await Promise.all([
        first.withLock('namespace', async txn => {
            sequence.push('a-start');
            await txn.write(record);
            await Promise.resolve();
            sequence.push('a-end');
        }),
        second.withLock('namespace', async txn => {
            sequence.push('b-start');
            const saved = await txn.read();
            assert.equal(saved.secret, 'secret');
            await txn.write({ ...saved, state: 'pending-revocation' });
            sequence.push('b-end');
        })
    ]);
    assert.deepEqual(sequence, ['a-start', 'a-end', 'b-start', 'b-end']);
    assert.equal(changes, 2);
    unsubscribe();
    const pending = await first.read('namespace');
    assert.equal(pending.state, 'pending-revocation');
});

test('corrupt durable records are reported and retained for explicit recovery', async () => {
    storage.setItem('corrupt', 'invalid JSON');
    const adapter = new BrowserSessionStore();
    await assert.rejects(adapter.read('corrupt'), { code: 'SESSION_STORAGE_CORRUPT' });
    assert.equal(storage.getItem('corrupt'), 'invalid JSON');
});

test('browser signed PUT lets Fetch supply Content-Length and does not leak Suite headers', async () => {
    const store = new MemorySessionStore();
    let put = false;
    const client = createClient({
        ...options,
        store,
        fetch: async (url, init) => {
            if (url.endsWith('/uploads'))
                return new Response(
                    JSON.stringify({
                        id: 'upload',
                        uploadInfo: {
                            url: 'https://storage.example/file?signature=secret',
                            headers: { 'content-length': '3', 'content-type': 'image/png' }
                        }
                    })
                );
            if (url.startsWith('https://storage.example')) {
                put = true;
                assert.equal(init.headers.has('content-length'), false);
                assert.equal(init.headers.has('x-zs-publishable-key'), false);
                assert.equal(init.headers.has('x-zs-customer-session'), false);
                return new Response('');
            }
            return new Response(JSON.stringify({ ok: true }));
        }
    });
    await store.withLock(client.namespace, async txn => {
        await txn.write(record);
    });
    await client.media.upload(new Uint8Array([1, 2, 3]), 'image/png');
    assert.equal(put, true);
});

test('explicit forget recovers a corrupt stored record without decoding it successfully', async () => {
    const client = createClient({
        ...options,
        fetch: async () => {
            throw Error('no network expected');
        }
    });
    storage.setItem(client.namespace, '{corrupt json');
    await assert.rejects(client.auth.restore(), { code: 'SESSION_STORAGE_CORRUPT' });
    await assert.rejects(client.auth.logout(), { code: 'SESSION_STORAGE_CORRUPT' });
    assert.equal(client.auth.state.status, 'pending-revocation');
    await client.auth.forgetPendingLogout();
    assert.equal(client.auth.state.status, 'signed-out');
    assert.equal(storage.getItem(client.namespace), null);
    const restoredState1 = await client.auth.restore();
    assert.equal(restoredState1.status, 'signed-out');
});

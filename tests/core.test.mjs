import assert from 'node:assert/strict';
import test from 'node:test';

import { createClient, MemorySessionStore, ZynoSuiteError } from '../dist/index.js';

const fields = [
    { id: 'title-id', alias: 'title', type: 'text' },
    { id: 'state-id', alias: 'state', type: 'enum', options: [{ value: 'saved' }, { value: 'archived' }] },
    { id: 'extra-id', alias: 'extra', type: 'text', optional: true }
];
const type = key => ({ key, typeId: `${key}-type`, definitionId: 'definition', schemaDigest: 'digest', fields });
const schema = {
    formatVersion: 1,
    appId: 'app',
    schemaDigest: 'manifest',
    views: { public: { article: type('article') }, member: { article: type('article') }, owned: { favorite: type('favorite') } }
};
const policy = {
    policyId: 'policy',
    policyRevision: 1,
    options: {
        passwordLogin: true,
        otpLogin: true,
        createAccount: true,
        createPassword: true,
        changePasswordWithCurrent: true,
        setPasswordWithoutCurrent: true,
        passwordRecovery: true
    },
    digest: 'policy-digest',
    orderHistoryScope: 'ecomm',
    orderHistoryConfigRevision: 0
};
const session = (id = 'session', phase = 'authenticated') => ({
    tenantId: 'tenant',
    sessionId: id,
    phase,
    expiresAt: phase === 'authenticated' ? null : new Date(Date.now() + 60_000).toISOString(),
    idleExpiresAt: phase === 'authenticated' ? null : new Date(Date.now() + 60_000).toISOString(),
    sdkAppId: 'app',
    policy,
    targetCartId: null,
    principal: phase === 'authenticated' ? { method: 'password', authenticatedAt: '2026-11-12T00:00:00Z' } : null
});
const entry = (id = 'one', data = { 'title-id': 'Article', 'state-id': 'retired-choice' }) => ({
    meta: {
        id,
        definitionId: 'historical-definition',
        activeDefinitionId: 'definition',
        schemaDigest: 'digest',
        contextVersion: 'context',
        writeRevision: 7
    },
    data
});
const me = {
    appUserId: 'app-user',
    crmContactId: 'contact',
    contact: { id: 'contact', displayName: 'A', firstName: 'A', lastName: null, company: null }
};
const json = (value, status = 200, headers = {}) =>
    new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return { promise, resolve };
};
function client(fetch, extras = {}) {
    return createClient({
        appKey: 'app-key',
        publishableKey: 'publishable',
        schema,
        runtime: 'native',
        origin: 'https://example.app',
        store: new MemorySessionStore(),
        maxReadRetries: 0,
        fetch,
        ...extras
    });
}
async function seed(store, namespace, secret = 'old-secret', state = 'active') {
    await store.withLock(namespace, async txn => {
        await txn.write({ state, secret, session: session(secret) });
    });
}
const code = wanted => error => error instanceof ZynoSuiteError && error.code === wanted;

test('public reads never inspect storage or forward a credential, even with a revoked stored session', async () => {
    let reads = 0;
    const store = {
        read: async () => {
            reads++;
            throw Error('must not read');
        },
        withLock: async () => {
            throw Error('must not lock');
        }
    };
    const sdk = client(
        async (url, init) => {
            assert.match(url, /public\/content\/article\/by-slug\/hello/);
            assert.equal(init.headers.get('x-zs-customer-session'), null);
            assert.equal(init.headers.get('origin'), 'https://example.app');
            assert.equal(init.credentials, 'omit');
            assert.equal(init.redirect, 'error');
            return json(entry());
        },
        { store }
    );
    const result = await sdk.content.getBySlug('article', 'hello');
    assert.equal(reads, 0);
    assert.equal(result.data.title, 'Article');
    assert.equal(result.data.extra, null);
    assert.equal(result.data.state, 'retired-choice');
});

test('member requests require authentication and never fall back to public', async () => {
    let calls = 0;
    const sdk = client(async () => {
        calls++;
        return json(entry());
    });
    await assert.rejects(sdk.memberContent.get('article', 'one'), code('AUTHENTICATION_REQUIRED'));
    assert.equal(calls, 0);
});

test('null-expiry authenticated sessions survive restart and restore app identity', async () => {
    const store = new MemorySessionStore();
    const fetch = async (url, init) => {
        assert.equal(init.headers.get('x-zs-customer-session'), 'old-secret');
        return json(url.endsWith('/current') ? session() : me);
    };
    const sdk = client(fetch, { store });
    await seed(store, sdk.namespace);
    const restored = client(fetch, { store });
    const state = await restored.auth.restore();
    assert.equal(state.status, 'authenticated');
    assert.equal(state.session.expiresAt, null);
    assert.equal(state.me.crmContactId, 'contact');
    const saved = await store.read(sdk.namespace);
    assert.equal(saved.secret, 'old-secret');
});

for (const [errorCode, status, expected] of [
    ['INVALID_APP_CONTEXT', 403, 'configuration-error'],
    ['SDK_APP_ACCESS_DENIED', 403, 'denied'],
    ['CONTENT_ACCESS_DENIED', 403, 'denied']
]) {
    test(`restore ${errorCode} preserves credential and exposes ${expected}`, async () => {
        const store = new MemorySessionStore();
        const sdk = client(async () => json({ error: errorCode }, status), { store });
        await seed(store, sdk.namespace);
        const state = await sdk.auth.restore();
        assert.equal(state.status, expected);
        const saved = await store.read(sdk.namespace);
        assert.equal(saved.secret, 'old-secret');
    });
}

test('late revoked-session response cannot clear a newer credential in another client', async () => {
    const waiting = deferred(),
        started = deferred();
    const store = new MemorySessionStore();
    const sdk = client(
        async () => {
            started.resolve();
            await waiting.promise;
            return json({ code: 'REAUTHENTICATION_REQUIRED' }, 401);
        },
        { store }
    );
    await seed(store, sdk.namespace);
    const request = sdk.me();
    await started.promise;
    await seed(store, sdk.namespace, 'new-secret');
    waiting.resolve();
    await assert.rejects(request, code('REAUTHENTICATION_REQUIRED'));
    const saved = await store.read(sdk.namespace);
    assert.equal(saved.secret, 'new-secret');
});

test('matching REAUTHENTICATION_REQUIRED clears the credential; generic 401 does not', async () => {
    for (const [body, cleared] of [
        [{ error: 'REAUTHENTICATION_REQUIRED' }, true],
        [{ error: 'some free text' }, false],
        [{ code: 'INVALID_CREDENTIALS' }, false]
    ]) {
        const store = new MemorySessionStore();
        const sdk = client(async () => json(body, 401), { store });
        await seed(store, sdk.namespace);
        await assert.rejects(sdk.me());
        const saved = await store.read(sdk.namespace);
        assert.equal(saved === null, cleared);
    }
});

test('network and rate-limit restore failures preserve the saved credential', async () => {
    for (const fetch of [
        async () => {
            throw Error('secret transport details');
        },
        async () => json({ code: 'RATE_LIMITED' }, 429, { 'retry-after': '600' })
    ]) {
        const store = new MemorySessionStore();
        const sdk = client(fetch, { store });
        await seed(store, sdk.namespace);
        await assert.rejects(sdk.auth.restore());
        const saved = await store.read(sdk.namespace);
        assert.equal(saved.secret, 'old-secret');
    }
});

test('failed logout stores one pending revocation and blocks replacement login until retried', async () => {
    let fail = true;
    const store = new MemorySessionStore();
    const sdk = client(
        async () => {
            if (fail) throw Error('offline');
            return json({ ok: true });
        },
        { store }
    );
    await seed(store, sdk.namespace);
    await assert.rejects(sdk.auth.logout(), code('NETWORK_ERROR'));
    assert.equal(sdk.auth.state.status, 'pending-revocation');
    const pending = await store.read(sdk.namespace);
    assert.equal(pending.state, 'pending-revocation');
    await assert.rejects(sdk.auth.signIn({ email: 'a@example.com', password: 'bad' }), code('PENDING_REVOCATION'));
    const second = client(async () => json({ ok: true }), { store });
    const restoredState1 = await second.auth.restore();
    assert.equal(restoredState1.status, 'pending-revocation');
    fail = false;
    await sdk.auth.retryPendingLogout();
    const storedSession2 = await store.read(sdk.namespace);
    assert.equal(storedSession2, null);
});

test('logout immediately hides authentication while restore owns the lock and suppresses its late result', async () => {
    const current = deferred(),
        currentStarted = deferred(),
        revoke = deferred(),
        revokeStarted = deferred();
    const store = new MemorySessionStore();
    const sdk = client(
        async url => {
            if (url.endsWith('/current')) {
                currentStarted.resolve();
                await current.promise;
                return json(session());
            }
            if (url.endsWith('/me')) return json(me);
            if (url.endsWith('/logout')) {
                revokeStarted.resolve();
                await revoke.promise;
                return json({ ok: true });
            }
            throw Error(url);
        },
        { store }
    );
    await seed(store, sdk.namespace);
    const restoring = sdk.auth.restore();
    await currentStarted.promise;
    const loggingOut = sdk.auth.logout();
    assert.equal(sdk.auth.state.status, 'pending-revocation');
    await assert.rejects(sdk.me(), code('PENDING_REVOCATION'));
    current.resolve();
    const restored = await restoring;
    assert.equal(restored.status, 'pending-revocation');
    await revokeStarted.promise;
    assert.equal(sdk.auth.state.status, 'pending-revocation');
    revoke.resolve();
    await loggingOut;
    assert.equal(sdk.auth.state.status, 'signed-out');
});

test('failed pending-record writes never leave authenticated UI or allow another request', async () => {
    const memory = new MemorySessionStore();
    let fail = true;
    const store = {
        read: namespace => memory.read(namespace),
        withLock: (namespace, action) =>
            memory.withLock(namespace, txn =>
                action({
                    ...txn,
                    write: async value => {
                        if (fail && value?.state === 'pending-revocation') throw Error('unavailable');
                        return txn.write(value);
                    }
                })
            )
    };
    const sdk = client(
        async url => {
            if (url.endsWith('/current')) return json(session());
            if (url.endsWith('/me')) return json(me);
            if (fail) throw Error('offline');
            return json({ ok: true });
        },
        { store }
    );
    await seed(memory, sdk.namespace);
    const restoredState3 = await sdk.auth.restore();
    assert.equal(restoredState3.status, 'authenticated');
    await assert.rejects(sdk.auth.logout(), code('NETWORK_ERROR'));
    assert.equal(sdk.auth.state.status, 'pending-revocation');
    await assert.rejects(sdk.me(), code('PENDING_REVOCATION'));
    fail = false;
    await sdk.auth.retryPendingLogout();
    const storedSession4 = await memory.read(sdk.namespace);
    assert.equal(storedSession4, null);
});

test('concurrent clients serialize sign-in so only one indefinite grant is created', async () => {
    const store = new MemorySessionStore();
    let logins = 0;
    const fetch = async url => {
        if (url.endsWith('/configuration'))
            return json({ enabled: true, policy, passwordRequirements: { minimumLength: 12, maximumLength: 128, minimumCharacterClasses: 3 } });
        if (url.endsWith('/sessions')) return json({ session: session('anonymous', 'anonymous'), sessionSecret: 'anonymous-secret', rotated: false });
        if (url.endsWith('/password')) {
            logins++;
            return json({ session: session('authenticated'), sessionSecret: 'authenticated-secret', rotated: true });
        }
        if (url.endsWith('/me')) return json(me);
        throw Error(url);
    };
    const a = client(fetch, { store }),
        b = client(fetch, { store });
    const outcomes = await Promise.allSettled([
        a.auth.signIn({ email: 'a@example.com', password: 'valid' }),
        b.auth.signIn({ email: 'a@example.com', password: 'valid' })
    ]);
    assert.equal(logins, 1);
    assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(row => row.status === 'rejected').reason.code, 'ALREADY_AUTHENTICATED');
});

test('an indefinite grant is revoked if the store cannot persist it', async () => {
    const memory = new MemorySessionStore();
    let revoked = false;
    const store = {
        read: namespace => memory.read(namespace),
        withLock: (namespace, action) =>
            memory.withLock(namespace, txn =>
                action({
                    ...txn,
                    write: async value => {
                        if (value?.state === 'active') throw Error('quota');
                        return txn.write(value);
                    }
                })
            )
    };
    const sdk = client(
        async url => {
            if (url.endsWith('/configuration')) return json({ enabled: true, policy });
            if (url.endsWith('/sessions'))
                return json({ session: session('anonymous', 'anonymous'), sessionSecret: 'anonymous-secret', rotated: false });
            if (url.endsWith('/password')) return json({ session: session('authenticated'), sessionSecret: 'authenticated-secret', rotated: true });
            if (url.endsWith('/logout')) {
                revoked = true;
                return json({ ok: true });
            }
            throw Error(url);
        },
        { store }
    );
    await assert.rejects(sdk.auth.signIn({ email: 'a@example.com', password: 'valid' }), code('SESSION_PERSISTENCE_FAILED'));
    assert.equal(revoked, true);
    const storedSession5 = await memory.read(sdk.namespace);
    assert.equal(storedSession5, null);
});

test('pre-auth and recovery proof sessions remain volatile and honour server expiries', async () => {
    const store = new MemorySessionStore();
    const sdk = client(
        async url =>
            json(
                url.endsWith('/configuration')
                    ? { enabled: true, policy }
                    : url.endsWith('/exchange')
                      ? { session: session('proof', 'recovery'), sessionSecret: 'proof-secret', rotated: false }
                      : { session: session('anonymous', 'anonymous'), sessionSecret: 'anonymous-secret', rotated: false }
            ),
        { store }
    );
    await sdk.auth.initialize();
    const storedSession6 = await store.read(sdk.namespace);
    assert.equal(storedSession6, null);
    await sdk.auth.exchange({ purpose: 'recovery', token: 'email-token' });
    const storedSession7 = await store.read(sdk.namespace);
    assert.equal(storedSession7, null);
    const expired = client(
        async () => json({ session: { ...session('proof', 'recovery'), expiresAt: null }, sessionSecret: 'proof', rotated: false }),
        { store }
    );
    await assert.rejects(expired.auth.exchange({ purpose: 'recovery', token: 'token' }), code('PROOF_SESSION_EXPIRED'));
});

test('namespaces isolate base, environment, app, publishable key and registered origin without raw key', () => {
    const base = client(async () => json({}));
    const variations = [
        { apiBase: 'https://other.example' },
        { environment: 'alpha' },
        { appKey: 'other-app' },
        { publishableKey: 'other-publishable' },
        { origin: 'https://other.app' }
    ];
    for (const options of variations) assert.notEqual(base.namespace, client(async () => json({}), options).namespace);
    assert.equal(base.namespace.includes('publishable'), false);
});

test('server clients only read public content and reject session storage/auth', async () => {
    assert.throws(() => client(async () => json({}), { runtime: 'server' }), code('AUTHENTICATED_SSR_UNSUPPORTED'));
    const sdk = client(async () => json(entry()), { runtime: 'server', store: undefined });
    await sdk.content.get('article', 'one');
    await assert.rejects(sdk.auth.restore(), code('AUTHENTICATED_SSR_UNSUPPORTED'));
});

test('typed owned writes map aliases to IDs and pin definition plus revision; snapshots preserve unknown IDs', async () => {
    const store = new MemorySessionStore();
    let received;
    const sdk = client(
        async (url, init) => {
            received = { url, init, body: JSON.parse(init.body) };
            return json(entry('owned', { 'title-id': 'Saved', 'state-id': 'saved', 'unknown-id': 'historical' }));
        },
        { store }
    );
    await seed(store, sdk.namespace);
    const result = await sdk.owned.replace('favorite', 'owned', { title: 'Saved', state: 'saved' }, { expectedWriteRevision: 7 });
    assert.deepEqual(received.body, {
        data: { 'title-id': 'Saved', 'state-id': 'saved' },
        clientDefinitionId: 'definition',
        expectedWriteRevision: 7
    });
    assert.equal(result.raw.data['unknown-id'], 'historical');
    assert.equal(result.data['unknown-id'], undefined);
    await assert.rejects(sdk.owned.create('favorite', { title: 'Saved', state: 'removed' }), code('MODEL_VALIDATION_FAILED'));
    await assert.rejects(sdk.owned.create('favorite', { title: 'Saved', state: 'saved', unknown: 'x' }), code('MODEL_VALIDATION_FAILED'));
});

test('owned sync keeps checkpoint/context across pages and reports an access reset', async () => {
    const store = new MemorySessionStore();
    let calls = 0;
    const sdk = client(
        async url => {
            const parsed = new URL(url);
            calls++;
            if (calls === 1) {
                assert.equal(parsed.searchParams.get('since'), '2026-01-01');
                return json({ items: [entry()], nextCursor: 'next', contextVersion: 'context', deletedIds: [], syncUntil: 'upper' });
            }
            assert.equal(parsed.searchParams.get('since'), '2026-01-01');
            assert.equal(parsed.searchParams.get('contextVersion'), 'context');
            assert.equal(parsed.searchParams.get('cursor'), 'next');
            return json({ code: 'SYNC_RESET_REQUIRED' }, 409);
        },
        { store }
    );
    await seed(store, sdk.namespace);
    const iterator = sdk.owned.sync('favorite', { since: '2026-01-01', contextVersion: 'context' });
    const first = await iterator.next();
    assert.equal(first.value.items[0].raw.meta.id, 'one');
    await assert.rejects(iterator.next(), code('SYNC_RESET_REQUIRED'));
});

test('signed upload has no Suite headers, cookies or auth; mutation calls are not retried', async () => {
    const store = new MemorySessionStore();
    const requests = [];
    const sdk = client(
        async (url, init) => {
            requests.push({ url, init });
            if (url.endsWith('/uploads'))
                return json({
                    id: 'upload',
                    uploadInfo: {
                        url: 'https://storage.example/object?signature=private',
                        headers: { 'content-type': 'image/png', 'content-length': '3' }
                    }
                });
            if (url.startsWith('https://storage.example')) {
                assert.equal(init.headers.get('x-zs-customer-session'), null);
                assert.equal(init.headers.get('x-zs-publishable-key'), null);
                assert.equal(init.headers.get('origin'), null);
                assert.equal(init.credentials, 'omit');
                assert.equal(init.redirect, 'error');
                assert.ok(init.body instanceof Uint8Array);
                assert.equal(init.body.byteLength, 3);
                return new Response('', { status: 200 });
            }
            return json({ ok: true });
        },
        { store }
    );
    await seed(store, sdk.namespace);
    const uploaded = await sdk.media.upload(new Uint8Array([1, 2, 3]), 'image/png');
    assert.deepEqual(uploaded, { id: 'upload' });
    assert.equal(requests.length, 3);
    let calls = 0;
    const failing = client(
        async () => {
            calls++;
            throw Error('offline secret');
        },
        { store, maxReadRetries: 3 }
    );
    await assert.rejects(failing.auth.logout(), error => error.code === 'NETWORK_ERROR' && !error.message.includes('secret'));
    assert.equal(calls, 1);
});

test('safe retries respect Retry-After and never retry a long or missing 429 delay', async () => {
    let calls = 0;
    const sdk = client(
        async () => {
            calls++;
            return calls === 1 ? json({ code: 'RATE_LIMITED' }, 429, { 'retry-after': '0' }) : json(entry());
        },
        { maxReadRetries: 1 }
    );
    await sdk.content.get('article', 'one');
    assert.equal(calls, 2);
    for (const header of [undefined, '600']) {
        calls = 0;
        const limited = client(
            async () => {
                calls++;
                return json({ code: 'RATE_LIMITED' }, 429, header ? { 'retry-after': header } : {});
            },
            { maxReadRetries: 2 }
        );
        await assert.rejects(limited.content.get('article', 'one'), code('RATE_LIMITED'));
        assert.equal(calls, 1);
    }
});

test('503 Retry-After is honoured and legitimate double-dot slug content is allowed', async () => {
    let calls = 0;
    const sdk = client(
        async () => {
            calls++;
            return json({ code: 'CONTENT_UNAVAILABLE' }, 503, { 'retry-after': '600' });
        },
        { maxReadRetries: 2, maxRetryDelayMs: 1000 }
    );
    await assert.rejects(sdk.content.getBySlug('article', 'foo..bar'), code('CONTENT_UNAVAILABLE'));
    assert.equal(calls, 1);
});

test('unknown models, malformed wire fields and dangerous path segments fail explicitly', async () => {
    const sdk = client(async () => json(entry('one', { 'title-id': 3, 'state-id': 'saved' })));
    await assert.rejects(sdk.content.get('unknown', 'id'), code('UNKNOWN_MODEL'));
    await assert.rejects(sdk.content.get('article', 'one'), code('INVALID_RESPONSE'));
    await assert.rejects(sdk.content.get('article', '..'), code('INVALID_PATH_PARAMETER'));
});

test('successful password replacement clears the revoked active grant and requires a new login', async () => {
    const store = new MemorySessionStore();
    const sdk = client(
        async (url, init) => {
            if (init.method === 'PUT') return json({ ok: true });
            return json(url.endsWith('/current') ? session() : me);
        },
        { store }
    );
    await seed(store, sdk.namespace);
    await sdk.auth.restore();
    await sdk.auth.replacePassword({ newPassword: 'new-password', currentPassword: 'old-password' });
    assert.equal(sdk.auth.state.status, 'signed-out');
    const storedSession8 = await store.read(sdk.namespace);
    assert.equal(storedSession8, null);
    await assert.rejects(sdk.me(), code('AUTHENTICATION_REQUIRED'));
});

test('own and same-credential cross-client storage notifications never cause restore ping-pong', async () => {
    const store = new MemorySessionStore();
    let calls = 0;
    const fetch = async url => {
        calls++;
        if (calls > 12) throw Error('restore loop');
        return json(url.endsWith('/current') ? session() : me);
    };
    const a = client(fetch, { store }),
        b = client(fetch, { store });
    await seed(store, a.namespace);
    await a.auth.restore();
    await b.auth.restore();
    const statuses = [];
    for (const sdk of [a, b])
        sdk.auth.subscribe(state => {
            statuses.push(state.status);
            if (state.status === 'unverified') void sdk.auth.restore().catch(() => {});
        });
    await a.auth.restore();
    await b.auth.restore();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 8);
    assert.equal(statuses.includes('unverified'), false);
    await seed(store, a.namespace, 'rotated-secret');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(statuses.filter(status => status === 'unverified').length, 2);
    assert.equal(calls, 12);
    assert.equal(a.auth.state.status, 'authenticated');
    assert.equal(b.auth.state.status, 'authenticated');
});

test('owned historical cardinalities project null while get/list/sync preserve lossless raw data', async () => {
    const oldData = {
        media: 'old-upload',
        component: { child: 'old' },
        relation: 'old-id',
        number: 'formerly-stored',
        json: { arbitrary: ['retained', { secret: 'private-owned-value' }] },
        unknown: 'historical'
    };
    const ownedType = {
        key: 'favorite',
        typeId: 'owned',
        definitionId: 'current',
        schemaDigest: 'digest',
        fields: [
            { id: 'media', alias: 'media', type: 'media', multiple: true },
            { id: 'component', alias: 'component', type: 'component', repeatable: true, fields: [{ id: 'child', alias: 'child', type: 'text' }] },
            { id: 'relation', alias: 'relation', type: 'relation', cardinality: 'many', targetTypeKey: 'favorite' },
            { id: 'number', alias: 'number', type: 'number' },
            { id: 'json', alias: 'json', type: 'json' }
        ]
    };
    const store = new MemorySessionStore();
    const sdk = client(
        async url =>
            json(
                url.endsWith('/one')
                    ? entry('one', oldData)
                    : { items: [entry('one', oldData)], nextCursor: null, contextVersion: 'context', deletedIds: [], syncUntil: 'upper' }
            ),
        { store, schema: { ...schema, views: { ...schema.views, owned: { favorite: ownedType } } } }
    );
    await seed(store, sdk.namespace);
    const one = await sdk.owned.get('favorite', 'one');
    const page = await sdk.owned.list('favorite');
    const iterator = sdk.owned.sync('favorite');
    const synced = await iterator.next();
    for (const item of [one, page.items[0], synced.value.items[0]]) {
        assert.equal(item.data.media, null);
        assert.equal(item.data.component, null);
        assert.equal(item.data.relation, null);
        assert.equal(item.data.number, null);
        assert.equal(item.data.json.arbitrary[1].secret, 'private-owned-value');
        assert.deepEqual(item.raw.data, oldData);
    }
});

for (const flow of ['signIn', 'verify', 'register']) {
    test(`${flow} resolves its durable grant when profile authorization has a transient failure`, async () => {
        const store = new MemorySessionStore();
        const controller = new AbortController();
        let observedAbort = false;
        const sdk = client(
            async (url, init) => {
                if (url.endsWith('/configuration')) return json({ enabled: true, policy });
                if (url.endsWith('/sessions'))
                    return json({ session: session('anonymous', 'anonymous'), sessionSecret: 'anonymous-secret', rotated: false });
                if (url.endsWith('/me')) {
                    controller.abort();
                    observedAbort = init.signal.aborted;
                    throw Error('aborted transient profile request');
                }
                const grant = { session: session('authenticated'), sessionSecret: 'authenticated-secret', rotated: true };
                return json(url.endsWith('/verify') ? { purpose: 'login', session: grant } : grant);
            },
            { store }
        );
        if (flow !== 'signIn') await sdk.auth.initialize();
        const options = { signal: controller.signal };
        const result =
            flow === 'signIn'
                ? await sdk.auth.signIn({ email: 'a@example.com', password: 'valid' }, options)
                : flow === 'verify'
                  ? await sdk.auth.verify({ purpose: 'login', challengeId: 'challenge', code: '123456' }, options)
                  : await sdk.auth.register({ proof: 'proof', name: 'Name' }, options);
        assert.equal(flow === 'verify' ? result.session.session.phase : result.phase, 'authenticated');
        assert.equal(observedAbort, true);
        assert.equal(sdk.auth.state.status, 'unverified');
        const saved = await store.read(sdk.namespace);
        assert.equal(saved.secret, 'authenticated-secret');
    });
}

for (const [errorCode, expectedState, retained] of [
    ['SDK_APP_ACCESS_DENIED', 'denied', true],
    ['INVALID_APP_CONTEXT', 'configuration-error', true],
    ['REAUTHENTICATION_REQUIRED', 'signed-out', false]
]) {
    test(`post-login ${errorCode} stays authoritative after persistence`, async () => {
        const store = new MemorySessionStore();
        const sdk = client(
            async url => {
                if (url.endsWith('/configuration')) return json({ enabled: true, policy });
                if (url.endsWith('/sessions'))
                    return json({ session: session('anonymous', 'anonymous'), sessionSecret: 'anonymous-secret', rotated: false });
                if (url.endsWith('/me')) return json({ code: errorCode }, 403);
                return json({ session: session('authenticated'), sessionSecret: 'authenticated-secret', rotated: true });
            },
            { store }
        );
        await assert.rejects(sdk.auth.signIn({ email: 'a@example.com', password: 'valid' }), code(errorCode));
        assert.equal(sdk.auth.state.status, expectedState);
        const saved = await store.read(sdk.namespace);
        assert.equal(saved !== null, retained);
    });
}

test('raw native byte uploads use a separate configurable timeout', async () => {
    const store = new MemorySessionStore();
    let body;
    const sdk = client(
        async (url, init) => {
            if (url.endsWith('/uploads')) return json({ id: 'upload', uploadInfo: { url: 'https://storage.example/file', headers: {} } });
            if (url.startsWith('https://storage.example')) {
                body = init.body;
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, 35);
                    init.signal.addEventListener(
                        'abort',
                        () => {
                            clearTimeout(timer);
                            reject(Error('aborted'));
                        },
                        { once: true }
                    );
                });
                return new Response('');
            }
            return json({ ok: true });
        },
        { store, timeoutMs: 10, uploadTimeoutMs: 200 }
    );
    await seed(store, sdk.namespace);
    await sdk.media.upload(new Uint8Array([1, 2, 3]), 'image/png');
    assert.ok(body instanceof Uint8Array);
    assert.deepEqual([...body], [1, 2, 3]);
    assert.throws(() => client(async () => json({}), { uploadTimeoutMs: 0 }), code('INVALID_TRANSPORT_OPTIONS'));
});

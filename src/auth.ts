import type { Operations } from './generated/operations.js';
import type {
    ChallengeInput,
    ChallengeVerifyInput,
    CustomerAuthConfiguration,
    ExchangeInput,
    InvitationInput,
    ISdkCustomerSession,
    ISdkCustomerSessionGrant,
    ISdkMeResult,
    PasswordInput,
    PasswordLoginInput,
    RecoveryInput,
    RegistrationInput
} from './generated/types.js';
import type { SessionStore, SessionTransaction, StoredSession } from './storage.js';
import type { RequestOptions } from './transport.js';

import { copy } from './copy.js';
import { ZynoSuiteError } from './errors.js';
import { Transport } from './transport.js';

export type AuthState =
    | { status: 'signed-out' | 'unverified' | 'pending-revocation' | 'storage-unavailable' }
    | { status: 'authenticated'; session: ISdkCustomerSession; me: ISdkMeResult }
    | { status: 'denied' | 'configuration-error'; code: string };

type AuthenticatedRequest = <T>(request: (secret: string) => Promise<T>) => Promise<T>;
const authenticatedRequests = new WeakMap<Auth, AuthenticatedRequest>();
/** @internal The credential remains inside the package's transport boundary. */
export function withAuthentication<T>(auth: Auth, request: (secret: string) => Promise<T>): Promise<T> {
    const invoke = authenticatedRequests.get(auth);
    if (!invoke) throw new ZynoSuiteError('AUTHENTICATION_REQUIRED');
    return invoke(request);
}

/** CRM is the authority. Only unrestricted authenticated grants are persisted. */
export class Auth {
    private volatile: ISdkCustomerSessionGrant | null = null;
    private unsavedRevocation: StoredSession | null = null;
    private logoutRequested = false;
    private lockDepth = 0;
    private stateVersion = 0;
    private authorizedSecret: string | null = null;
    private current: AuthState = { status: 'unverified' };
    private readonly listeners = new Set<(state: AuthState) => void>();
    private unsubscribeStore?: () => void;
    constructor(
        private readonly transport: Transport,
        private readonly store?: SessionStore
    ) {
        authenticatedRequests.set(this, request => this.authenticatedRequest(request));
        if (!store) this.current = { status: transport.runtime === 'server' ? 'signed-out' : 'storage-unavailable' };
        this.unsubscribeStore = store?.subscribe?.(transport.namespace, () => {
            // Storage events invalidate cached authorization; they never authenticate a new tab locally.
            if (!this.lockDepth && this.current.status === 'authenticated') void this.checkStoredCredential();
        });
    }
    get state(): AuthState {
        return copy(this.current);
    }
    subscribe(listener: (state: AuthState) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    dispose(): void {
        this.unsubscribeStore?.();
        this.listeners.clear();
        this.volatile = null;
    }
    configuration(options: RequestOptions = {}): Promise<CustomerAuthConfiguration> {
        return this.transport.operation('getSdkPublicAuthConfiguration', options);
    }
    async restore(options: RequestOptions = {}): Promise<AuthState> {
        if (this.logoutRequested) return this.state;
        return this.lock(async transaction => {
            if (this.unsavedRevocation) {
                this.setState({ status: 'pending-revocation' });
                return this.state;
            }
            const record = await transaction.read();
            if (!record) {
                this.setState({ status: 'signed-out' });
                return this.state;
            }
            if (record.state === 'pending-revocation') {
                this.setState({ status: 'pending-revocation' });
                return this.state;
            }
            try {
                const session = await this.transport.operation('getSdkPublicAuthCurrent', { secret: record.secret, ...options });
                this.authenticated(session);
                const me = await this.transport.operation('getSdkMe', { secret: record.secret, ...options });
                await transaction.write({ ...record, session });
                this.authorizedSecret = record.secret;
                this.setState({ status: 'authenticated', session, me });
            } catch (error) {
                await this.handleLockedError(transaction, record.secret, error, false);
                if (
                    !(error instanceof ZynoSuiteError) ||
                    !['REAUTHENTICATION_REQUIRED', 'SDK_APP_ACCESS_DENIED', 'CONTENT_ACCESS_DENIED', 'INVALID_APP_CONTEXT'].includes(error.code)
                )
                    throw error;
            }
            return this.state;
        });
    }
    async initialize(options: RequestOptions = {}): Promise<ISdkCustomerSession> {
        return this.lock(async transaction => {
            await this.ensureSignedOut(transaction);
            const grant = await this.initializeVolatile(options);
            return grant.session;
        });
    }
    async signIn(input: PasswordLoginInput, options: RequestOptions = {}): Promise<ISdkCustomerSession> {
        return this.lock(async transaction => {
            await this.ensureSignedOut(transaction);
            const initial = await this.initializeVolatile(options);
            const result = await this.transport.operation('postSdkPublicAuthPassword', { body: input, secret: initial.sessionSecret, ...options });
            await this.accept(transaction, result, options);
            return result.session;
        });
    }
    async challenge(input: ChallengeInput, options: RequestOptions = {}): Promise<Operations['postSdkPublicAuthChallenge']['response']> {
        return this.lock(async transaction => {
            if (input.purpose !== 'password-set') await this.ensureSignedOut(transaction);
            const record = await transaction.read();
            if (record?.state === 'pending-revocation') throw new ZynoSuiteError('PENDING_REVOCATION');
            const initial = input.purpose === 'password-set' ? null : await this.preAuth(transaction, options);
            const secret = initial ? initial.sessionSecret : this.active(record).secret;
            try {
                return await this.transport.operation('postSdkPublicAuthChallenge', { body: input, secret, ...options });
            } catch (error) {
                await this.handleLockedError(transaction, secret, error);
                throw error;
            }
        });
    }
    async verify(input: ChallengeVerifyInput, options: RequestOptions = {}): Promise<Operations['postSdkPublicAuthVerify']['response']> {
        return this.lock(async transaction => {
            if (input.purpose !== 'password-set') await this.ensureSignedOut(transaction);
            const record = await transaction.read();
            const secret = input.purpose === 'password-set' ? this.active(record).secret : this.volatileSession().sessionSecret;
            try {
                const result = await this.transport.operation('postSdkPublicAuthVerify', { body: input, secret, ...options });
                if (result.session) await this.accept(transaction, result.session, options);
                return result;
            } catch (error) {
                await this.handleLockedError(transaction, secret, error);
                throw error;
            }
        });
    }
    async register(input: RegistrationInput, options: RequestOptions = {}): Promise<ISdkCustomerSession> {
        return this.lock(async transaction => {
            await this.ensureSignedOut(transaction);
            const secret = this.volatileSession().sessionSecret;
            const result = await this.transport.operation('postSdkPublicAuthRegister', { body: input, secret, ...options });
            await this.accept(transaction, result, options);
            return result.session;
        });
    }
    async recover(input: RecoveryInput, options: RequestOptions = {}): Promise<Operations['postSdkPublicAuthRecover']['response']> {
        return this.lock(async transaction => {
            const initial = await this.preAuth(transaction, options);
            return this.transport.operation('postSdkPublicAuthRecover', { body: input, secret: initial.sessionSecret, ...options });
        });
    }
    async exchange(input: ExchangeInput, options: RequestOptions = {}): Promise<ISdkCustomerSession> {
        return this.lock(async transaction => {
            await this.ensureSignedOut(transaction);
            const result = await this.transport.operation('postSdkPublicAuthExchange', { body: input, ...options });
            this.bounded(result);
            this.volatile = result;
            return result.session;
        });
    }
    async completeEnrollment(input: InvitationInput = {}, options: RequestOptions = {}): Promise<void> {
        return this.lock(async transaction => {
            await this.ensureSignedOut(transaction);
            const secret = this.volatileSession().sessionSecret;
            await this.transport.operation('postSdkPublicAuthEnroll', { body: input, secret, ...options });
            this.volatile = null;
        });
    }
    async completeLoginEmail(options: RequestOptions = {}): Promise<void> {
        return this.lock(async transaction => {
            await this.ensureSignedOut(transaction);
            const secret = this.volatileSession().sessionSecret;
            await this.transport.operation('putSdkPublicAuthLoginEmail', { secret, ...options });
            this.volatile = null;
        });
    }
    async replacePassword(input: PasswordInput, options: RequestOptions = {}): Promise<void> {
        return this.lock(async transaction => {
            const record = await transaction.read();
            if (record?.state === 'pending-revocation' || this.unsavedRevocation) throw new ZynoSuiteError('PENDING_REVOCATION');
            const secret = record?.state === 'active' ? record.secret : this.volatileSession().sessionSecret;
            try {
                await this.transport.operation('putSdkPublicAuthReplacePassword', { body: input, secret, ...options });
            } catch (error) {
                await this.handleLockedError(transaction, secret, error);
                throw error;
            }
            this.volatile = null;
            this.setState({ status: 'signed-out' });
            if (record) await transaction.write(null);
        });
    }
    /** Local sign-out is immediate. Failed server revocation remains durable and blocks a replacement login. */
    async logout(options: RequestOptions = {}): Promise<void> {
        this.requireStore();
        this.volatile = null;
        this.logoutRequested = true;
        this.setState({ status: 'pending-revocation' });
        return this.lock(async transaction => {
            const saved = await transaction.read();
            const record = this.unsavedRevocation ?? saved;
            if (!record) {
                this.logoutRequested = false;
                this.setState({ status: 'signed-out' });
                return;
            }
            if (!this.unsavedRevocation) {
                try {
                    await transaction.write({ ...record, state: 'pending-revocation' });
                } catch {
                    this.unsavedRevocation = { ...record, state: 'pending-revocation' };
                }
            }
            this.setState({ status: 'pending-revocation' });
            try {
                await this.transport.operation('postSdkPublicAuthLogout', { secret: record.secret, ...options });
                this.unsavedRevocation = null;
                await transaction.write(null);
                this.logoutRequested = false;
                this.setState({ status: 'signed-out' });
            } catch (error) {
                if (error instanceof ZynoSuiteError && error.code === 'REAUTHENTICATION_REQUIRED') {
                    this.unsavedRevocation = null;
                    await transaction.write(null);
                    this.logoutRequested = false;
                    this.setState({ status: 'signed-out' });
                    return;
                }
                throw error;
            }
        }, true);
    }
    retryPendingLogout(options: RequestOptions = {}): Promise<void> {
        return this.logout(options);
    }
    /** Explicitly forget a pending or corrupt local record. This cannot revoke an unreadable or unreachable server session. */
    async forgetPendingLogout(): Promise<void> {
        return this.lock(async transaction => {
            let record: StoredSession | null = null;
            let corrupt = false;
            try {
                record = await transaction.read();
            } catch (error) {
                if (!(error instanceof ZynoSuiteError) || error.code !== 'SESSION_STORAGE_CORRUPT') throw error;
                corrupt = true;
            }
            if (!corrupt && record?.state !== 'pending-revocation' && !this.unsavedRevocation && !this.logoutRequested)
                throw new ZynoSuiteError('NO_PENDING_REVOCATION');
            await transaction.write(null);
            this.unsavedRevocation = null;
            this.logoutRequested = false;
            this.setState({ status: 'signed-out' });
        }, true);
    }
    private async authenticatedRequest<T>(request: (secret: string) => Promise<T>): Promise<T> {
        this.requireStore();
        if (this.logoutRequested || this.unsavedRevocation) throw new ZynoSuiteError('PENDING_REVOCATION');
        const record = await this.store!.read(this.transport.namespace);
        if (this.logoutRequested) throw new ZynoSuiteError('PENDING_REVOCATION');
        const active = this.active(record);
        try {
            return await request(active.secret);
        } catch (error) {
            if (
                error instanceof ZynoSuiteError &&
                ['REAUTHENTICATION_REQUIRED', 'SDK_APP_ACCESS_DENIED', 'CONTENT_ACCESS_DENIED', 'INVALID_APP_CONTEXT'].includes(error.code)
            ) {
                await this.lock(async transaction => {
                    await this.handleLockedError(transaction, active.secret, error, false);
                }, true);
            }
            throw error;
        }
    }
    private async initializeVolatile(options: RequestOptions): Promise<ISdkCustomerSessionGrant> {
        const config = await this.configuration(options);
        if (!config.enabled || !config.policy) throw new ZynoSuiteError('AUTHENTICATION_DISABLED');
        const grant = await this.transport.operation('postSdkPublicAuthInitialize', {
            body: { policyId: config.policy.policyId, policyRevision: config.policy.policyRevision, options: config.policy.options },
            ...options
        });
        this.bounded(grant);
        this.volatile = grant;
        return grant;
    }
    private async preAuth(transaction: SessionTransaction, options: RequestOptions): Promise<ISdkCustomerSessionGrant> {
        await this.ensureSignedOut(transaction);
        try {
            return this.volatileSession();
        } catch {
            return this.initializeVolatile(options);
        }
    }
    private volatileSession(): ISdkCustomerSessionGrant {
        if (!this.volatile) throw new ZynoSuiteError('AUTHENTICATION_REQUIRED');
        this.bounded(this.volatile);
        return this.volatile;
    }
    private bounded(grant: ISdkCustomerSessionGrant): void {
        if (
            !grant.sessionSecret ||
            grant.session.phase === 'authenticated' ||
            !grant.session.expiresAt ||
            !grant.session.idleExpiresAt ||
            Date.parse(grant.session.expiresAt) <= Date.now() ||
            Date.parse(grant.session.idleExpiresAt) <= Date.now() ||
            !Number.isFinite(Date.parse(grant.session.expiresAt)) ||
            !Number.isFinite(Date.parse(grant.session.idleExpiresAt))
        ) {
            this.volatile = null;
            throw new ZynoSuiteError('PROOF_SESSION_EXPIRED');
        }
    }
    private authenticated(session: ISdkCustomerSession): void {
        if (session.phase !== 'authenticated' || !session.principal || !session.sdkAppId || session.targetCartId)
            throw new ZynoSuiteError('INVALID_AUTHENTICATED_GRANT');
        for (const expiry of [session.expiresAt, session.idleExpiresAt])
            if (expiry !== null && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()))
                throw new ZynoSuiteError('REAUTHENTICATION_REQUIRED', 401);
    }
    private async accept(transaction: SessionTransaction, grant: ISdkCustomerSessionGrant, options: RequestOptions): Promise<void> {
        this.authenticated(grant.session);
        if (!grant.sessionSecret) throw new ZynoSuiteError('INVALID_AUTHENTICATED_GRANT');
        const record: StoredSession = { state: 'active', secret: grant.sessionSecret, session: grant.session };
        try {
            await transaction.write(record);
        } catch {
            // The server already created an indefinite grant. Revoke it if durable persistence failed.
            try {
                await this.transport.operation('postSdkPublicAuthLogout', { secret: grant.sessionSecret });
            } catch (error) {
                if (!(error instanceof ZynoSuiteError && error.code === 'REAUTHENTICATION_REQUIRED')) {
                    this.unsavedRevocation = { ...record, state: 'pending-revocation' };
                    try {
                        await transaction.write(this.unsavedRevocation);
                        this.unsavedRevocation = null;
                    } catch {
                        /* Keep one retryable in-memory revocation if the store remains unavailable. */
                    }
                    this.setState({ status: 'pending-revocation' });
                    throw new ZynoSuiteError('SESSION_PERSISTENCE_FAILED');
                }
            }
            this.setState({ status: 'storage-unavailable' });
            throw new ZynoSuiteError('SESSION_PERSISTENCE_FAILED');
        }
        this.volatile = null;
        this.setState({ status: 'unverified' });
        try {
            const me = await this.transport.operation('getSdkMe', { secret: grant.sessionSecret, ...options });
            this.authorizedSecret = grant.sessionSecret;
            this.setState({ status: 'authenticated', session: grant.session, me });
            if (this.logoutRequested) throw new ZynoSuiteError('PENDING_REVOCATION');
        } catch (error) {
            await this.handleLockedError(transaction, grant.sessionSecret, error, false);
            if (this.logoutRequested) throw new ZynoSuiteError('PENDING_REVOCATION');
            if (
                error instanceof ZynoSuiteError &&
                ['REAUTHENTICATION_REQUIRED', 'SDK_APP_ACCESS_DENIED', 'CONTENT_ACCESS_DENIED', 'INVALID_APP_CONTEXT', 'PENDING_REVOCATION'].includes(
                    error.code
                )
            )
                throw error;
            // The login already committed. Transient profile failures are recoverable through restore().
        }
    }
    private active(record: StoredSession | null): StoredSession {
        if (!record) throw new ZynoSuiteError('AUTHENTICATION_REQUIRED');
        if (record.state === 'pending-revocation') throw new ZynoSuiteError('PENDING_REVOCATION');
        return record;
    }
    private async ensureSignedOut(transaction: SessionTransaction): Promise<void> {
        if (this.logoutRequested || this.unsavedRevocation) throw new ZynoSuiteError('PENDING_REVOCATION');
        const record = await transaction.read();
        if (record) throw new ZynoSuiteError(record.state === 'pending-revocation' ? 'PENDING_REVOCATION' : 'ALREADY_AUTHENTICATED');
    }
    private async handleLockedError(transaction: SessionTransaction, sentSecret: string, error: unknown, rethrow = true): Promise<void> {
        const current = await transaction.read();
        if (current?.state === 'active' && current.secret === sentSecret && error instanceof ZynoSuiteError) {
            if (error.code === 'REAUTHENTICATION_REQUIRED') {
                await transaction.write(null);
                this.setState({ status: 'signed-out' });
            }
            if (error.code === 'SDK_APP_ACCESS_DENIED' || error.code === 'CONTENT_ACCESS_DENIED')
                this.setState({ status: 'denied', code: error.code });
            if (error.code === 'INVALID_APP_CONTEXT') this.setState({ status: 'configuration-error', code: error.code });
        }
        if (rethrow) throw error;
    }
    private requireStore(): void {
        if (this.transport.runtime === 'server') throw new ZynoSuiteError('AUTHENTICATED_SSR_UNSUPPORTED');
        if (!this.store) throw new ZynoSuiteError('SESSION_STORAGE_UNAVAILABLE');
    }
    private async lock<T>(action: (transaction: SessionTransaction) => Promise<T>, allowLogout = false): Promise<T> {
        this.requireStore();
        if (this.logoutRequested && !allowLogout) throw new ZynoSuiteError('PENDING_REVOCATION');
        return this.store!.withLock(this.transport.namespace, async transaction => {
            this.lockDepth++;
            try {
                return await action(transaction);
            } finally {
                this.lockDepth--;
            }
        });
    }
    private async checkStoredCredential(): Promise<void> {
        const version = this.stateVersion;
        try {
            const record = await this.store!.read(this.transport.namespace);
            if (version !== this.stateVersion || this.lockDepth || this.current.status !== 'authenticated') return;
            if (!record || record.state !== 'active' || record.secret !== this.authorizedSecret) this.setState({ status: 'unverified' });
        } catch {
            if (version === this.stateVersion && !this.lockDepth && this.current.status === 'authenticated') this.setState({ status: 'unverified' });
        }
    }
    private setState(state: AuthState): void {
        if (this.logoutRequested && state.status !== 'pending-revocation') state = { status: 'pending-revocation' };
        this.stateVersion++;
        if (state.status !== 'authenticated') this.authorizedSecret = null;
        this.current = state;
        for (const listener of this.listeners) {
            try {
                listener(this.state);
            } catch {
                /* Observer failures must not turn a committed authentication into a failed mutation. */
            }
        }
    }
}

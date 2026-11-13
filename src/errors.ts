/** A safe protocol error. Request bodies, credentials, and signed URLs are never retained. */
export class ZynoSuiteError extends Error {
    readonly name = 'ZynoSuiteError';
    constructor(
        readonly code: string,
        readonly status = 0,
        readonly retryAfterSeconds?: number
    ) {
        super(code);
    }
}

const legacyCodes = new Set([
    'REAUTHENTICATION_REQUIRED',
    'INVALID_APP_CONTEXT',
    'SDK_APP_ACCESS_DENIED',
    'CONTENT_ACCESS_DENIED',
    'INVALID_CREDENTIALS',
    'AUTHENTICATION_DISABLED',
    'SCHEMA_CHANGED',
    'SCHEMA_REAPPROVAL_REQUIRED',
    'SYNC_RESET_REQUIRED',
    'WRITE_CONFLICT',
    'SLUG_CONFLICT',
    'PUBLIC_SLUG_CONFLICT',
    'RATE_LIMITED',
    'CONTENT_NOT_FOUND',
    'NOT_FOUND',
    'POLICY_CHANGED',
    'INVALID_CHALLENGE',
    'CHALLENGE_EXPIRED',
    'CHALLENGE_RATE_LIMITED',
    'INVALID_TOKEN',
    'AUTH_OPTION_DISABLED',
    'AUTH_POLICY_MISMATCH',
    'CONTACT_CHANGED',
    'CONTENT_UNAVAILABLE',
    'CURSOR_RESET_REQUIRED',
    'ENROLLMENT_REQUIRED',
    'ENROLLMENT_SUPPORT_REQUIRED',
    'ENTRY_NOT_FOUND',
    'EXPANSION_BUDGET_EXCEEDED',
    'INVALID_AUTH_OPTIONS',
    'INVALID_AUTH_ORIGIN',
    'INVALID_AUTH_POLICY',
    'INVALID_AUTH_STATE',
    'INVALID_CURSOR',
    'INVALID_EMAIL',
    'INVALID_LOGIN_EMAIL_POINT',
    'INVALID_MEDIA_REQUEST',
    'INVALID_OR_EXPIRED_CODE',
    'INVALID_PAGE_SIZE',
    'INVALID_PASSWORD_POLICY',
    'INVALID_REASON_CODE',
    'MEDIA_UNAVAILABLE',
    'NAME_REQUIRED',
    'POPULATION_NOT_SUPPORTED',
    'PUBLIC_ACCESS_UNAVAILABLE',
    'SDK_ACCESS_UNAVAILABLE',
    'VALIDATION_FAILED',
    'VERIFICATION_REQUIRED'
]);

export function protocolError(status: number, payload: unknown, retryAfter: string | null): ZynoSuiteError {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const code =
        typeof body.code === 'string' && /^[A-Z][A-Z0-9_]{1,95}$/.test(body.code)
            ? body.code
            : typeof body.error === 'string' && legacyCodes.has(body.error)
              ? body.error
              : `HTTP_${status}`;
    let delay =
        typeof body.retryAfterSeconds === 'number' && Number.isFinite(body.retryAfterSeconds) && body.retryAfterSeconds >= 0
            ? body.retryAfterSeconds
            : undefined;
    if (retryAfter) {
        const numeric = Number(retryAfter);
        const parsed = Number.isFinite(numeric) ? numeric : (Date.parse(retryAfter) - Date.now()) / 1000;
        if (Number.isFinite(parsed) && parsed >= 0) delay = Math.max(delay ?? 0, parsed);
    }
    return new ZynoSuiteError(code, status, delay);
}

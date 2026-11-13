import type { Auth } from './auth.js';
import type { Operations } from './generated/operations.js';
import type { ModelShape } from './models.js';
import type { RequestOptions } from './transport.js';

import { withAuthentication } from './auth.js';
import { ZynoSuiteError } from './errors.js';
import { Transport } from './transport.js';

export type MemberRendition = Operations['getSdkMediaUrl']['query'];
export type PublicRendition = Omit<Operations['getSdkPublicMediaV1Resolve']['query'], 'uploadIds'>;
export class MediaClient<M extends ModelShape<M>> {
    constructor(
        private readonly transport: Transport,
        private readonly auth: Auth
    ) {}
    /** Uploads exact bytes directly to the signed object-store destination, then commits through Suite. */
    async upload(bytes: Blob | Uint8Array, contentType: string, options: RequestOptions = {}): Promise<{ id: string }> {
        const size = bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
        if (!Number.isSafeInteger(size) || size <= 0 || !contentType) throw new ZynoSuiteError('INVALID_UPLOAD');
        return withAuthentication(this.auth, async secret => {
            const created = await this.transport.operation('postSdkMediaCreateUpload', { body: { contentType, size }, secret, ...options });
            if (!created?.id || !created.uploadInfo?.url || !created.uploadInfo.headers) throw new ZynoSuiteError('INVALID_RESPONSE');
            await this.transport.upload(created.uploadInfo.url, created.uploadInfo.headers, bytes, options.signal);
            await this.transport.operation('postSdkMediaCommit', { path: { uploadId: created.id }, secret, ...options });
            return { id: created.id };
        });
    }
    resolveMember(
        uploadId: string,
        rendition: MemberRendition = {},
        options: RequestOptions = {}
    ): Promise<Operations['getSdkMediaUrl']['response']> {
        return withAuthentication(this.auth, secret =>
            this.transport.operation('getSdkMediaUrl', { path: { uploadId }, query: rendition, secret, ...options })
        );
    }
    /** Every ready public URL has a server expiry. Keep it in display state, never in a durable CMS document. */
    async resolvePublic(
        key: keyof M['public'] & string,
        entryId: string,
        uploadIds: string[],
        rendition: PublicRendition,
        options: RequestOptions = {}
    ): Promise<Operations['getSdkPublicMediaV1Resolve']['response']> {
        if (
            !uploadIds.length ||
            uploadIds.length > 20 ||
            new Set(uploadIds).size !== uploadIds.length ||
            uploadIds.some(id => !id || id.includes(','))
        )
            throw new ZynoSuiteError('INVALID_MEDIA_BATCH');
        const result = await this.transport.operation('getSdkPublicMediaV1Resolve', {
            path: { key, entryId },
            query: { ...rendition, uploadIds: uploadIds.join(',') },
            ...options
        });
        if (
            !result ||
            !Array.isArray(result.items) ||
            result.items.some(item => item.status === 'ready' && (!item.url || !item.expiresAt || !Number.isFinite(Date.parse(item.expiresAt))))
        )
            throw new ZynoSuiteError('INVALID_RESPONSE');
        return result;
    }
}

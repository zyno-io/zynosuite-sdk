// Generated from Suite OpenAPI. Do not edit.
import type * as DTO from "./types.js";
export interface Operations {
"getSdkPublicAuthConfiguration": { body: never; response: DTO.CustomerAuthConfiguration; path: {  }; query: {  }; };
"postSdkPublicAuthInitialize": { body: DTO.SessionInitInput; response: DTO.ISdkCustomerSessionGrant; path: {  }; query: {  }; };
"getSdkPublicAuthCurrent": { body: never; response: DTO.ISdkCustomerSession; path: {  }; query: {  }; };
"postSdkPublicAuthPassword": { body: DTO.PasswordLoginInput; response: DTO.ISdkCustomerSessionGrant; path: {  }; query: {  }; };
"putSdkPublicAuthReplacePassword": { body: DTO.PasswordInput; response: unknown; path: {  }; query: {  }; };
"postSdkPublicAuthChallenge": { body: DTO.ChallengeInput; response: DTO.CustomerAuthChallengeResult; path: {  }; query: {  }; };
"postSdkPublicAuthVerify": { body: DTO.ChallengeVerifyInput; response: DTO.ISdkChallengeVerification; path: {  }; query: {  }; };
"postSdkPublicAuthRegister": { body: DTO.RegistrationInput; response: DTO.ISdkCustomerSessionGrant; path: {  }; query: {  }; };
"postSdkPublicAuthRecover": { body: DTO.RecoveryInput; response: { "accepted": true; }; path: {  }; query: {  }; };
"postSdkPublicAuthExchange": { body: DTO.ExchangeInput; response: DTO.ISdkCustomerSessionGrant; path: {  }; query: {  }; };
"postSdkPublicAuthEnroll": { body: DTO.InvitationInput; response: unknown; path: {  }; query: {  }; };
"putSdkPublicAuthLoginEmail": { body: never; response: unknown; path: {  }; query: {  }; };
"postSdkPublicAuthLogout": { body: never; response: unknown; path: {  }; query: {  }; };
"getSdkMe": { body: never; response: DTO.ISdkMeResult; path: {  }; query: {  }; };
"postSdkMediaCreateUpload": { body: DTO.ISdkUploadRequest; response: DTO.ICmsUploadCreateResult; path: {  }; query: {  }; };
"postSdkMediaCommit": { body: never; response: { "ok": true; }; path: { "uploadId": string; }; query: {  }; };
"getSdkMediaUrl": { body: never; response: DTO.ICmsMediaUrlResult; path: { "uploadId": string; }; query: { "kind"?: "imageVariant" | "thumbnail" | "poster" | "video"; "profile"?: string; }; };
"getSdkPublicBrowseV1List": { body: never; response: DTO.ISdkV1List; path: { "key": string; }; query: { "limit"?: number; "cursor"?: string; "populate"?: string; }; };
"getSdkPublicBrowseV1Slug": { body: never; response: DTO.ISdkV1Entry; path: { "key": string; "slug": string; }; query: {  }; };
"getSdkPublicBrowseV1Get": { body: never; response: DTO.ISdkV1Entry; path: { "key": string; "id": string; }; query: {  }; };
"getSdkPublicMediaV1Resolve": { body: never; response: DTO.ISdkPublicMediaV1Result; path: { "key": string; "entryId": string; }; query: { "uploadIds": string; "kind": "imageVariant" | "thumbnail" | "video" | "poster"; "profile": string; }; };
"getSdkMemberBrowseV1List": { body: never; response: DTO.ISdkV1List; path: { "key": string; }; query: { "limit"?: number; "cursor"?: string; "populate"?: string; }; };
"getSdkMemberBrowseV1Slug": { body: never; response: DTO.ISdkV1Entry; path: { "key": string; "slug": string; }; query: {  }; };
"getSdkMemberBrowseV1Get": { body: never; response: DTO.ISdkV1Entry; path: { "key": string; "id": string; }; query: {  }; };
"getSdkOwnedV1Sync": { body: never; response: DTO.ISdkV1Sync; path: { "key": string; }; query: { "since"?: string; "cursor"?: string; "contextVersion"?: string; "limit"?: number; }; };
"postSdkOwnedV1Create": { body: DTO.ISdkOwnedV1Create; response: DTO.ISdkV1Entry; path: { "key": string; }; query: {  }; };
"getSdkOwnedV1Get": { body: never; response: DTO.ISdkV1Entry; path: { "key": string; "id": string; }; query: {  }; };
"putSdkOwnedV1Replace": { body: DTO.ISdkOwnedV1Replace; response: DTO.ISdkV1Entry; path: { "key": string; "id": string; }; query: {  }; };
"deleteSdkOwnedV1Remove": { body: never; response: unknown; path: { "key": string; "id": string; }; query: { "expectedWriteRevision": number; }; };
"postSdkOwnedV1Batch": { body: { "rows": Array<{ "data": DTO.Record; }>; }; response: Array<DTO.ISdkV1Entry>; path: { "key": string; "id": string; "childKey": string; }; query: {  }; };
}
export const operations = {
"getSdkPublicAuthConfiguration": { method: "GET", path: "/sdk/auth/configuration" },
"postSdkPublicAuthInitialize": { method: "POST", path: "/sdk/auth/sessions" },
"getSdkPublicAuthCurrent": { method: "GET", path: "/sdk/auth/sessions/current" },
"postSdkPublicAuthPassword": { method: "POST", path: "/sdk/auth/password" },
"putSdkPublicAuthReplacePassword": { method: "PUT", path: "/sdk/auth/password" },
"postSdkPublicAuthChallenge": { method: "POST", path: "/sdk/auth/challenges" },
"postSdkPublicAuthVerify": { method: "POST", path: "/sdk/auth/challenges/verify" },
"postSdkPublicAuthRegister": { method: "POST", path: "/sdk/auth/registration/complete" },
"postSdkPublicAuthRecover": { method: "POST", path: "/sdk/auth/password-recovery" },
"postSdkPublicAuthExchange": { method: "POST", path: "/sdk/auth/exchange" },
"postSdkPublicAuthEnroll": { method: "POST", path: "/sdk/auth/enrollment/complete" },
"putSdkPublicAuthLoginEmail": { method: "PUT", path: "/sdk/auth/login-email/complete" },
"postSdkPublicAuthLogout": { method: "POST", path: "/sdk/auth/logout" },
"getSdkMe": { method: "GET", path: "/sdk/me" },
"postSdkMediaCreateUpload": { method: "POST", path: "/sdk/cms/uploads" },
"postSdkMediaCommit": { method: "POST", path: "/sdk/cms/uploads/{uploadId}/commit" },
"getSdkMediaUrl": { method: "GET", path: "/sdk/cms/media/{uploadId}/url" },
"getSdkPublicBrowseV1List": { method: "GET", path: "/sdk/v1/public/content/{key}" },
"getSdkPublicBrowseV1Slug": { method: "GET", path: "/sdk/v1/public/content/{key}/by-slug/{slug}" },
"getSdkPublicBrowseV1Get": { method: "GET", path: "/sdk/v1/public/content/{key}/{id}" },
"getSdkPublicMediaV1Resolve": { method: "GET", path: "/sdk/v1/public/content/{key}/{entryId}/media" },
"getSdkMemberBrowseV1List": { method: "GET", path: "/sdk/v1/member/content/{key}" },
"getSdkMemberBrowseV1Slug": { method: "GET", path: "/sdk/v1/member/content/{key}/by-slug/{slug}" },
"getSdkMemberBrowseV1Get": { method: "GET", path: "/sdk/v1/member/content/{key}/{id}" },
"getSdkOwnedV1Sync": { method: "GET", path: "/sdk/v1/owned/{key}" },
"postSdkOwnedV1Create": { method: "POST", path: "/sdk/v1/owned/{key}" },
"getSdkOwnedV1Get": { method: "GET", path: "/sdk/v1/owned/{key}/{id}" },
"putSdkOwnedV1Replace": { method: "PUT", path: "/sdk/v1/owned/{key}/{id}" },
"deleteSdkOwnedV1Remove": { method: "DELETE", path: "/sdk/v1/owned/{key}/{id}" },
"postSdkOwnedV1Batch": { method: "POST", path: "/sdk/v1/owned/{key}/{id}/children/{childKey}/batch" },
} as const;

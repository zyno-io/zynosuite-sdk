// Generated from the staff-exported app manifest. Review alias/schema diffs before replacing.
import type { GeneratedSchema } from '@zyno-io/zynosuite-sdk';
export type public_articleRead = {
    title: string | null;
    body: string | null;
};
export type owned_favoriteRead = {
    name: string | null;
    state: string | null;
};
export type owned_favoriteWrite = {
    name: string;
    state?: 'active' | 'archived';
};
export interface AppModels {
    public: {
        article: { read: public_articleRead };
    };
    member: Record<never, never>;
    owned: {
        favorite: { read: owned_favoriteRead; write: owned_favoriteWrite };
    };
}
export const schema: GeneratedSchema<AppModels> = JSON.parse(
    '{"formatVersion":1,"appId":"example-app","schemaDigest":"example-manifest-digest","views":{"public":{"article":{"key":"article","typeId":"example-article-type","definitionId":"example-article-definition","schemaDigest":"example-article-digest","fields":[{"id":"article-title-id","alias":"title","type":"text"},{"id":"article-body-id","alias":"body","type":"text","optional":true}]}},"member":{},"owned":{"favorite":{"key":"favorite","typeId":"example-favorite-type","definitionId":"example-favorite-definition","schemaDigest":"example-favorite-digest","fields":[{"id":"favorite-name-id","alias":"name","type":"text"},{"id":"favorite-state-id","alias":"state","type":"enum","options":[{"value":"active"},{"value":"archived"}],"optional":true}]}}}}'
);

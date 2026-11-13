import type { ISdkV1Meta } from './generated/types.js';

import { ZynoSuiteError } from './errors.js';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/** A durable upload ID, never an expiring signed URL. */
export type MediaReference = string;
export interface Entry<T extends object> {
    meta: ISdkV1Meta;
    data: T;
}
export type RelationRead<T extends object> = string | Entry<T> | null;
export interface FieldSchema {
    id: string;
    alias: string;
    type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'multiSelect' | 'json' | 'media' | 'component' | 'relation';
    optional?: boolean;
    conditional?: boolean;
    options?: { value: string }[];
    fields?: FieldSchema[];
    repeatable?: boolean;
    cardinality?: 'one' | 'many';
    targetTypeKey?: string;
    multiple?: boolean;
    format?: string;
    min?: number;
    max?: number;
    allowedTypes?: string[];
}
export interface TypeSchema {
    key: string;
    typeId: string;
    definitionId: string;
    schemaDigest: string;
    fields: FieldSchema[];
}
export type ModelView = 'public' | 'member' | 'owned';
export interface ModelBinding {
    read: object;
    write?: object;
}
export type ModelShape<M> = {
    public: { [K in keyof (M extends { public: unknown } ? M['public'] : never)]: ModelBinding };
    member: { [K in keyof (M extends { member: unknown } ? M['member'] : never)]: ModelBinding };
    owned: { [K in keyof (M extends { owned: unknown } ? M['owned'] : never)]: { read: object; write: object } };
};
export interface AppModels {
    public: Record<string, ModelBinding>;
    member: Record<string, ModelBinding>;
    owned: Record<string, { read: object; write: object }>;
}
export interface GeneratedSchema<M extends ModelShape<M>> {
    formatVersion: 1;
    appId: string;
    schemaDigest: string;
    views: { [V in ModelView]: Record<keyof M[V] & string, TypeSchema> };
    /** Type-only link between generated interfaces and their runtime bindings. */
    readonly __models?: M;
}
export type ReadModel<M extends ModelShape<M>, V extends ModelView, K extends keyof M[V]> = M[V][K] extends { read: infer R extends object }
    ? R
    : never;
export type WriteModel<M extends ModelShape<M>, K extends keyof M['owned']> = M['owned'][K] extends { write: infer W extends object } ? W : never;

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = (): never => {
    throw new ZynoSuiteError('MODEL_VALIDATION_FAILED');
};
const mismatch = (): never => {
    throw new ZynoSuiteError('INVALID_RESPONSE');
};

/** Maps immutable field IDs through the same manifest that generated the model interfaces. */
export class ModelMapper<M extends ModelShape<M>> {
    constructor(readonly schema: GeneratedSchema<M>) {
        if (schema.formatVersion !== 1 || !schema.appId || !schema.schemaDigest) throw new ZynoSuiteError('INVALID_SCHEMA_MANIFEST');
        for (const view of ['public', 'member', 'owned'] as const) {
            for (const [key, type] of Object.entries<TypeSchema>(schema.views[view])) {
                if (type.key !== key || !type.definitionId || !type.typeId) throw new ZynoSuiteError('INVALID_SCHEMA_MANIFEST');
                this.validateFields(type.fields);
            }
        }
    }
    type<V extends ModelView>(view: V, key: keyof M[V] & string): TypeSchema {
        const type = this.schema.views[view][key];
        if (!type) throw new ZynoSuiteError('UNKNOWN_MODEL');
        return type;
    }
    read<V extends ModelView, K extends keyof M[V] & string>(view: V, key: K, value: unknown): Entry<ReadModel<M, V, K>> {
        const type = this.type(view, key);
        const mapped = this.entry(view, type, value, 0);
        // All assertions are confined to the runtime validator, not an unconstrained call-site generic.
        return mapped as Entry<ReadModel<M, V, K>>;
    }
    write<K extends keyof M['owned'] & string>(key: K, data: WriteModel<M, K>): Record<string, unknown> {
        return this.fields('owned', this.type('owned', key).fields, data, true, 0);
    }
    private validateFields(fields: FieldSchema[], depth = 0): void {
        if (!Array.isArray(fields) || depth > 20) throw new ZynoSuiteError('INVALID_SCHEMA_MANIFEST');
        const ids = new Set<string>(),
            aliases = new Set<string>();
        for (const field of fields) {
            if (!field.id || typeof field.alias !== 'string' || !field.alias || ids.has(field.id) || aliases.has(field.alias))
                throw new ZynoSuiteError('INVALID_SCHEMA_MANIFEST');
            ids.add(field.id);
            aliases.add(field.alias);
            if (
                !['text', 'number', 'boolean', 'date', 'datetime', 'enum', 'multiSelect', 'json', 'media', 'component', 'relation'].includes(
                    field.type
                )
            )
                throw new ZynoSuiteError('INVALID_SCHEMA_MANIFEST');
            if (field.type === 'component') this.validateFields(field.fields ?? [], depth + 1);
            if (field.type === 'relation' && !['one', 'many'].includes(field.cardinality ?? '')) throw new ZynoSuiteError('INVALID_SCHEMA_MANIFEST');
        }
    }
    private entry(view: ModelView, type: TypeSchema, raw: unknown, depth: number): Entry<object> {
        if (!object(raw) || !object(raw.meta) || !object(raw.data)) return mismatch();
        const meta = raw.meta;
        if (
            typeof meta.id !== 'string' ||
            typeof meta.definitionId !== 'string' ||
            typeof meta.activeDefinitionId !== 'string' ||
            typeof meta.schemaDigest !== 'string' ||
            typeof meta.contextVersion !== 'string' ||
            !Number.isSafeInteger(meta.writeRevision)
        )
            mismatch();
        const data = this.fields(view, type.fields, raw.data, false, depth);
        return { meta: { ...meta } as unknown as ISdkV1Meta, data };
    }
    private fields(view: ModelView, fields: FieldSchema[], raw: unknown, write: boolean, depth: number): Record<string, unknown> {
        if (!object(raw) || depth > 20) (write ? invalid : mismatch)();
        const source = raw as Record<string, unknown>;
        const output: Record<string, unknown> = Object.create(null);
        if (write) {
            const known = new Set(fields.map(field => field.alias));
            if (Object.keys(source).some(key => !known.has(key))) invalid();
        }
        for (const field of fields) {
            const sourceKey = write ? field.alias : field.id;
            const targetKey = write ? field.id : field.alias;
            const value = Object.hasOwn(source, sourceKey) ? source[sourceKey] : undefined;
            if (value === null || value === undefined) {
                if (write) {
                    if (!field.optional && !field.conditional) invalid();
                    // Optional omissions are genuine whole-document omissions. Explicit null is accepted by CMS.
                    if (value === null) output[targetKey] = null;
                } else output[targetKey] = null;
                continue;
            }
            try {
                output[targetKey] = this.value(view, field, value, write, depth + 1);
            } catch (error) {
                if (view !== 'owned' || write || !(error instanceof ZynoSuiteError) || error.code !== 'INVALID_RESPONSE') throw error;
                // Owned snapshots retain historical cardinalities under the same immutable field ID.
                // The current projection stays sound while OwnedEntry.raw retains the lossless value.
                output[targetKey] = null;
            }
        }
        return output;
    }
    private value(view: ModelView, field: FieldSchema, value: unknown, write: boolean, depth: number): unknown {
        const fail = write ? invalid : mismatch;
        const strings = (item: unknown): item is string[] => Array.isArray(item) && item.every(part => typeof part === 'string');
        const options = new Set(field.options?.map(option => option.value) ?? []);
        switch (field.type) {
            case 'text':
            case 'date':
            case 'datetime':
            case 'enum':
                if (typeof value !== 'string') fail();
                if (write && field.type === 'enum' && !options.has(value as string)) fail();
                if (
                    write &&
                    field.type === 'text' &&
                    ((field.min !== undefined && (value as string).length < field.min) ||
                        (field.max !== undefined && (value as string).length > field.max))
                )
                    fail();
                return value;
            case 'number':
                if (typeof value !== 'number' || !Number.isFinite(value)) fail();
                if (
                    write &&
                    ((field.min !== undefined && (value as number) < field.min) || (field.max !== undefined && (value as number) > field.max))
                )
                    fail();
                return value;
            case 'boolean':
                if (typeof value !== 'boolean') fail();
                return value;
            case 'multiSelect':
                if (!strings(value) || (write && value.some(item => !options.has(item)))) fail();
                return [...(value as string[])];
            case 'media':
                if (field.multiple ? !strings(value) : typeof value !== 'string') fail();
                return field.multiple ? [...(value as string[])] : value;
            case 'component': {
                if (field.repeatable) {
                    if (!Array.isArray(value)) fail();
                    return (value as unknown[]).map(item => this.fields(view, field.fields ?? [], item, write, depth));
                }
                return this.fields(view, field.fields ?? [], value, write, depth);
            }
            case 'relation': {
                const relation = (item: unknown): unknown => {
                    if (typeof item === 'string') {
                        if (!write && view === 'public') fail();
                        return item;
                    }
                    if (write || view === 'owned') fail();
                    if (!field.targetTypeKey) return fail();
                    const bindings: Record<string, TypeSchema> = this.schema.views[view];
                    const type = bindings[field.targetTypeKey];
                    if (!type) fail();
                    return this.entry(view, type!, item, depth);
                };
                if (field.cardinality === 'many') {
                    if (!Array.isArray(value)) fail();
                    return (value as unknown[]).map(relation);
                }
                return relation(value);
            }
            case 'json': {
                if (view === 'public') fail();
                const walk = (item: unknown, level: number): JsonValue => {
                    if (level > 32) return fail();
                    if (item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))
                        return item;
                    if (Array.isArray(item)) return item.map(part => walk(part, level + 1));
                    if (object(item)) {
                        const result: Record<string, JsonValue> = Object.create(null);
                        for (const [key, part] of Object.entries(item)) result[key] = walk(part, level + 1);
                        return result;
                    }
                    return fail();
                };
                return walk(value, 0);
            }
        }
    }
}

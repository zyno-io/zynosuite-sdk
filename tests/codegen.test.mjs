import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { generateModels } from '../scripts/generate-models.mjs';
import { emitTypes, selectPublicContract } from '../scripts/generate-openapi.mjs';

test('allowlist excludes staff, devices and legacy APIs and closes referenced schema graph', () => {
    const spec = {
        openapi: '3.1.0',
        paths: {
            '/sdk/me': {
                get: {
                    operationId: 'getSdkMe',
                    responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Me' } } } } }
                }
            },
            '/sdk/apps': { get: { operationId: 'staff' } },
            '/sdk/devices': { post: { operationId: 'device' } },
            '/cms/content': { get: { operationId: 'legacy' } }
        },
        components: {
            schemas: {
                Me: { type: 'object', properties: { profile: { $ref: '#/components/schemas/Profile' } } },
                Profile: { type: 'string' },
                Secret: { type: 'string' }
            }
        }
    };
    const selected = selectPublicContract(spec);
    assert.deepEqual(Object.keys(selected.paths), ['/sdk/me']);
    assert.deepEqual(Object.keys(selected.components.schemas).sort(), ['Me', 'Profile']);
});
test('OpenAPI3.1 composites, nullable records and identifier collisions are explicit', () => {
    const rendered = emitTypes({
        paths: {},
        components: {
            schemas: {
                A: {
                    allOf: [
                        { type: 'object', required: ['name'], properties: { name: { type: ['string', 'null'] } } },
                        { type: 'object', additionalProperties: { type: 'integer' } }
                    ]
                }
            }
        }
    });
    assert.match(rendered.types, /"name": \(string \| null\)/);
    assert.match(rendered.types, /\[key: string\]: number/);
    assert.throws(() => emitTypes({ paths: {}, components: { schemas: { 'a-b': {}, a_b: {} } } }), /collision/);
    assert.throws(() => emitTypes({ paths: {}, components: { schemas: { A: { $ref: '#/components/schemas/Missing' } } } }), /Unresolved/);
});
const field = { id: 'immutable-1', alias: 'id', type: 'enum', options: [{ value: 'active' }] };
const model = fields => ({
    formatVersion: 1,
    appId: 'app',
    schemaDigest: 'digest',
    views: { public: {}, member: {}, owned: { note: { key: 'note', typeId: 'type', definitionId: 'def', schemaDigest: 'schema', fields } } }
});
test('model aliases remain under data, reads nullable/open enums and writes current closed choices', () => {
    const result = generateModels(model([field, { id: 'conditional', alias: 'data-value', type: 'text', conditional: true }]));
    assert.match(result, /"id": string \| null/);
    assert.match(result, /"id": "active";/);
    assert.match(result, /"data-value"\?: string/);
    assert.match(result, /immutable-1/);
    assert.doesNotMatch(result, /default|expr/);
});
test('nested duplicate aliases, invalid kinds and public opaque JSON fail closed', () => {
    assert.throws(() => generateModels(model([field, { ...field, id: 'other' }])), /duplicate/);
    assert.throws(() => generateModels(model([{ ...field, type: 'unreviewed' }])), /Unknown field/);
    const publicManifest = model([]);
    publicManifest.views.public.note = { ...publicManifest.views.owned.note, fields: [{ id: 'json', alias: 'json', type: 'json' }] };
    assert.throws(() => generateModels(publicManifest), /Public JSON/);
});

test('checked-in public protocol contains only the complete positive operation graph', async () => {
    const source = await readFile(new URL('../openapi.suite.json', import.meta.url), 'utf8');
    const contract = JSON.parse(source);
    assert.deepEqual(selectPublicContract(contract), contract);
    assert.equal(Object.values(contract.paths).flatMap(path => Object.keys(path)).length, 30);
});

test('model imports contain only helpers used by the generated field types', () => {
    const scalar = generateModels(model([field]));
    assert.match(scalar, /import type \{ GeneratedSchema \}/);
    assert.doesNotMatch(scalar, /import type \{[^\n]*(?:Entry|JsonValue|MediaReference)/);
    const allHelpers = model([
        { id: 'json', alias: 'json', type: 'json' },
        { id: 'media', alias: 'media', type: 'media' }
    ]);
    allHelpers.views.member.note = {
        ...allHelpers.views.owned.note,
        fields: [{ id: 'relation', alias: 'relation', type: 'relation', cardinality: 'one', targetTypeKey: 'note' }]
    };
    const generated = generateModels(allHelpers);
    const imports = generated.split('\n')[1];
    for (const helper of ['GeneratedSchema', 'Entry', 'JsonValue', 'MediaReference']) assert.ok(imports.includes(helper));
});

test('empty audiences have no type keys and empty definitions reject extra field values', () => {
    const generated = generateModels(model([]));
    assert.match(generated, /public: Record<never, never>/);
    assert.match(generated, /owned_noteWrite = Record<string, never>/);
});

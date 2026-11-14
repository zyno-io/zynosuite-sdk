import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { parse } = require('yaml');

// Only exact reviewed operations enter the browser package. New endpoints require review.
export const operationAllowlist = new Map([
    ['/sdk/auth/configuration', ['get']],
    ['/sdk/auth/sessions', ['post']],
    ['/sdk/auth/sessions/current', ['get']],
    ['/sdk/auth/password', ['post', 'put']],
    ['/sdk/auth/challenges', ['post']],
    ['/sdk/auth/challenges/verify', ['post']],
    ['/sdk/auth/registration/complete', ['post']],
    ['/sdk/auth/password-recovery', ['post']],
    ['/sdk/auth/exchange', ['post']],
    ['/sdk/auth/enrollment/complete', ['post']],
    ['/sdk/auth/login-email/complete', ['put']],
    ['/sdk/auth/logout', ['post']],
    ['/sdk/me', ['get']],
    ['/sdk/cms/uploads', ['post']],
    ['/sdk/cms/uploads/{uploadId}/commit', ['post']],
    ['/sdk/cms/media/{uploadId}/url', ['get']],
    ['/sdk/v1/public/content/{key}', ['get']],
    ['/sdk/v1/public/content/{key}/by-slug/{slug}', ['get']],
    ['/sdk/v1/public/content/{key}/{id}', ['get']],
    ['/sdk/v1/public/content/{key}/{entryId}/media', ['get']],
    ['/sdk/v1/member/content/{key}', ['get']],
    ['/sdk/v1/member/content/{key}/by-slug/{slug}', ['get']],
    ['/sdk/v1/member/content/{key}/{id}', ['get']],
    ['/sdk/v1/owned/{key}', ['get', 'post']],
    ['/sdk/v1/owned/{key}/{id}', ['get', 'put', 'delete']],
    ['/sdk/v1/owned/{key}/{id}/children/{childKey}/batch', ['post']]
]);
const expectedOperationIds = {
    'GET /sdk/auth/configuration': 'getSdkPublicAuthConfiguration',
    'POST /sdk/auth/sessions': 'postSdkPublicAuthInitialize',
    'GET /sdk/auth/sessions/current': 'getSdkPublicAuthCurrent',
    'POST /sdk/auth/password': 'postSdkPublicAuthPassword',
    'PUT /sdk/auth/password': 'putSdkPublicAuthReplacePassword',
    'POST /sdk/auth/challenges': 'postSdkPublicAuthChallenge',
    'POST /sdk/auth/challenges/verify': 'postSdkPublicAuthVerify',
    'POST /sdk/auth/registration/complete': 'postSdkPublicAuthRegister',
    'POST /sdk/auth/password-recovery': 'postSdkPublicAuthRecover',
    'POST /sdk/auth/exchange': 'postSdkPublicAuthExchange',
    'POST /sdk/auth/enrollment/complete': 'postSdkPublicAuthEnroll',
    'PUT /sdk/auth/login-email/complete': 'putSdkPublicAuthLoginEmail',
    'POST /sdk/auth/logout': 'postSdkPublicAuthLogout',
    'GET /sdk/me': 'getSdkMe',
    'POST /sdk/cms/uploads': 'postSdkMediaCreateUpload',
    'POST /sdk/cms/uploads/{uploadId}/commit': 'postSdkMediaCommit',
    'GET /sdk/cms/media/{uploadId}/url': 'getSdkMediaUrl',
    'GET /sdk/v1/public/content/{key}': 'getSdkPublicBrowseV1List',
    'GET /sdk/v1/public/content/{key}/by-slug/{slug}': 'getSdkPublicBrowseV1Slug',
    'GET /sdk/v1/public/content/{key}/{id}': 'getSdkPublicBrowseV1Get',
    'GET /sdk/v1/member/content/{key}': 'getSdkMemberBrowseV1List',
    'GET /sdk/v1/member/content/{key}/by-slug/{slug}': 'getSdkMemberBrowseV1Slug',
    'GET /sdk/v1/member/content/{key}/{id}': 'getSdkMemberBrowseV1Get',
    'GET /sdk/v1/owned/{key}': 'getSdkOwnedV1Sync',
    'POST /sdk/v1/owned/{key}': 'postSdkOwnedV1Create',
    'GET /sdk/v1/owned/{key}/{id}': 'getSdkOwnedV1Get',
    'PUT /sdk/v1/owned/{key}/{id}': 'putSdkOwnedV1Replace',
    'DELETE /sdk/v1/owned/{key}/{id}': 'deleteSdkOwnedV1Remove',
    'POST /sdk/v1/owned/{key}/{id}/children/{childKey}/batch': 'postSdkOwnedV1Batch',
    'GET /sdk/v1/public/content/{key}/{entryId}/media': 'getSdkPublicMediaV1Resolve'
};
export function selectPublicContract(spec) {
    const paths = {},
        schemas = {},
        pending = [];
    const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (value.$ref) {
            if (!value.$ref.startsWith('#/components/schemas/')) throw new Error(`Unsupported external/component reference: ${value.$ref}`);
            pending.push(value.$ref.slice('#/components/schemas/'.length));
        }
        for (const child of Object.values(value)) visit(child);
    };
    const ids = new Set();
    for (const [path, methods] of operationAllowlist) {
        for (const method of methods) {
            const operation = spec.paths?.[path]?.[method];
            if (!operation) continue; // Server slices can land independently; check --complete before release.
            if (operation.operationId !== expectedOperationIds[`${method.toUpperCase()} ${path}`])
                throw new Error(`Unreviewed operationId for ${method} ${path}`);
            if (ids.has(operation.operationId)) throw new Error('Duplicate operationId');
            ids.add(operation.operationId);
            paths[path] ??= {};
            paths[path][method] = operation;
            visit(operation);
        }
    }
    while (pending.length) {
        const key = pending.shift();
        if (Object.hasOwn(schemas, key)) continue;
        const schema = spec.components?.schemas?.[key];
        if (!schema) throw new Error(`Unresolved schema: ${key}`);
        schemas[key] = schema;
        visit(schema);
    }
    return { openapi: spec.openapi, info: { title: 'ZynoSuite public SDK protocol', version: '1' }, paths, components: { schemas } };
}
export function emitTypes(spec) {
    const schemas = spec.components?.schemas ?? {};
    const names = new Map();
    const used = new Set();
    for (const key of Object.keys(schemas).sort()) {
        const identifier = key.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^(?=[0-9])/, '_');
        if (used.has(identifier)) throw new Error(`Schema identifier collision: ${key}`);
        used.add(identifier);
        names.set(key, identifier);
    }
    const emit = (schema, qualified = false) => {
        if (schema === true || schema === undefined) return 'unknown';
        if (schema === false) return 'never';
        if (schema.$ref) {
            const key = schema.$ref.slice('#/components/schemas/'.length),
                name = names.get(key);
            if (!name) throw new Error(`Unresolved schema: ${key}`);
            const rest = { ...schema };
            delete rest.$ref;
            return Object.keys(rest).some(k => !['description', 'title'].includes(k))
                ? `(${qualified ? `DTO.${name}` : name} & ${emit(rest, qualified)})`
                : qualified
                  ? `DTO.${name}`
                  : name;
        }
        if (schema.const !== undefined) return JSON.stringify(schema.const);
        if (schema.enum) return schema.enum.length ? schema.enum.map(v => JSON.stringify(v)).join(' | ') : 'never';
        for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
            if (schema[keyword]) return `(${schema[keyword].map(item => emit(item, qualified)).join(keyword === 'allOf' ? ' & ' : ' | ')})`;
        }
        if (Array.isArray(schema.type)) return `(${schema.type.map(type => emit({ ...schema, type }, qualified)).join(' | ')})`;
        let result;
        switch (schema.type) {
            case 'null':
                result = 'null';
                break;
            case 'string':
                result = 'string';
                break;
            case 'number':
            case 'integer':
                result = 'number';
                break;
            case 'boolean':
                result = 'boolean';
                break;
            case 'array':
                result = `Array<${emit(schema.items, qualified)}>`;
                break;
            case 'object':
            case undefined: {
                if (!schema.properties && !schema.additionalProperties && schema.type === undefined) return 'unknown';
                const required = new Set(schema.required ?? []);
                const props = Object.entries(schema.properties ?? {}).map(
                    ([key, child]) => `${JSON.stringify(key)}${required.has(key) ? '' : '?'}: ${emit(child, qualified)};`
                );
                if (schema.additionalProperties)
                    props.push(`[key: string]: ${schema.additionalProperties === true ? 'unknown' : emit(schema.additionalProperties, qualified)};`);
                result = `{ ${props.join(' ')} }`;
                break;
            }
            default:
                throw new Error(`Unsupported schema type ${schema.type}`);
        }
        return schema.nullable ? `(${result} | null)` : result;
    };
    let types = '// Generated from Suite OpenAPI. Do not edit.\n';
    for (const [key, name] of names) types += `export type ${name} = ${emit(schemas[key])};\n`;
    let operations = '// Generated from Suite OpenAPI. Do not edit.\nimport type * as DTO from "./types.js";\nexport interface Operations {\n';
    let runtime = 'export const operations = {\n';
    const qualified = schema => emit(schema, true);
    for (const [path, methods] of Object.entries(spec.paths))
        for (const [method, op] of Object.entries(methods)) {
            const body = op.requestBody?.content?.['application/json']?.schema;
            const response =
                op.responses?.['200']?.content?.['application/json']?.schema ?? op.responses?.['201']?.content?.['application/json']?.schema;
            const parameters = op.parameters ?? [];
            const paramType = kind =>
                `{ ${parameters
                    .filter(p => p.in === kind)
                    .map(p => `${JSON.stringify(p.name)}${p.required ? '' : '?'}: ${qualified(p.schema)};`)
                    .join(' ')} }`;
            operations += `${JSON.stringify(op.operationId)}: { body: ${body ? qualified(body) : 'never'}; response: ${response ? qualified(response) : 'void'}; path: ${paramType('path')}; query: ${paramType('query')}; };\n`;
            runtime += `${JSON.stringify(op.operationId)}: { method: ${JSON.stringify(method.toUpperCase())}, path: ${JSON.stringify(path)} },\n`;
        }
    return { types, operations: operations + '}\n' + runtime + '} as const;\n' };
}
async function main() {
    const here = dirname(fileURLToPath(import.meta.url));
    const inputArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
    const input = inputArg ? resolve(inputArg) : resolve(here, '../openapi.suite.json');
    const source = await readFile(input, 'utf8');
    const spec = selectPublicContract(parse(source));
    if (process.argv.includes('--complete'))
        for (const [path, methods] of operationAllowlist)
            for (const method of methods) if (!spec.paths[path]?.[method]) throw new Error(`Required operation absent: ${method} ${path}`);
    const generated = emitTypes(spec),
        out = resolve(here, '../src/generated');
    await mkdir(out, { recursive: true });
    await writeFile(resolve(out, 'types.ts'), generated.types);
    await writeFile(resolve(out, 'operations.ts'), generated.operations);
    await writeFile(resolve(here, '../openapi.suite.json'), JSON.stringify(spec, null, 2) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

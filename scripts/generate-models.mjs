#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function generateModels(manifest) {
    if (manifest.formatVersion !== 1 || !manifest.views || !manifest.appId || !manifest.schemaDigest)
        throw new Error('Unsupported or invalid schema manifest');
    const imports = new Set(['GeneratedSchema']);
    const used = new Set();
    const names = new Map();
    for (const view of ['public', 'member', 'owned'])
        for (const [key, schema] of Object.entries(manifest.views[view] ?? {})) {
            if (schema.key !== key || !schema.typeId || !schema.definitionId || !schema.schemaDigest || !Array.isArray(schema.fields))
                throw new Error(`Invalid type schema: ${view}.${key}`);
            const name = `${view}_${key}`.replace(/[^A-Za-z0-9_$]/g, '_');
            if (used.has(name)) throw new Error(`Generated identifier collision: ${view}.${key}`);
            used.add(name);
            names.set(`${view}:${key}`, name);
        }
    const fieldsType = (fields, view, write) => {
        if (!fields.length) return 'Record<string, never>';
        const aliases = new Set(),
            ids = new Set();
        return `{\n${fields
            .map(field => {
                if (!field.id || typeof field.alias !== 'string' || aliases.has(field.alias) || ids.has(field.id))
                    throw new Error('Invalid or duplicate field ID/alias');
                aliases.add(field.alias);
                ids.add(field.id);
                const type = fieldType(field, view, write);
                return `${JSON.stringify(field.alias)}${write && (field.optional || field.conditional) ? '?' : ''}: ${type}${write ? '' : ' | null'};`;
            })
            .join('\n')}\n}`;
    };
    const fieldType = (field, view, write) => {
        switch (field.type) {
            case 'text':
            case 'date':
            case 'datetime':
                return 'string';
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'enum':
                return write ? field.options?.map(option => JSON.stringify(option.value)).join(' | ') || 'never' : 'string';
            case 'multiSelect':
                return `Array<${write ? field.options?.map(option => JSON.stringify(option.value)).join(' | ') || 'never' : 'string'}>`;
            case 'json':
                if (view === 'public') throw new Error('Public JSON fields are not supported');
                imports.add('JsonValue');
                return 'JsonValue';
            case 'media':
                imports.add('MediaReference');
                return field.multiple ? 'MediaReference[]' : 'MediaReference';
            case 'component': {
                if (!Array.isArray(field.fields)) throw new Error('Component fields missing');
                const shape = fieldsType(field.fields, view, write);
                return field.repeatable ? `Array<${shape}>` : shape;
            }
            case 'relation': {
                if (!['one', 'many'].includes(field.cardinality)) throw new Error('Invalid relation cardinality');
                const target = names.get(`${view}:${field.targetTypeKey}`);
                if (!write && ((view === 'public' && target) || view === 'member')) imports.add('Entry');
                const shape = write
                    ? 'string'
                    : view === 'public'
                      ? target
                          ? `Entry<${target}Read>`
                          : 'never'
                      : view === 'member'
                        ? `string | Entry<${target ? `${target}Read` : 'Record<string, unknown>'}>`
                        : 'string';
                return field.cardinality === 'many' ? `Array<${shape}>` : shape;
            }
            default:
                throw new Error(`Unknown field kind: ${field.type}`);
        }
    };
    let out = '';
    for (const view of ['public', 'member', 'owned'])
        for (const [key, schema] of Object.entries(manifest.views[view] ?? {})) {
            const name = names.get(`${view}:${key}`);
            out += `export type ${name}Read = ${fieldsType(schema.fields, view, false)};\n`;
            if (view === 'owned') out += `export type ${name}Write = ${fieldsType(schema.fields, view, true)};\n`;
        }
    out += 'export interface AppModels {\n';
    for (const view of ['public', 'member', 'owned']) {
        if (!Object.keys(manifest.views[view] ?? {}).length) {
            out += `${view}: Record<never, never>;\n`;
            continue;
        }
        out += `${view}: {\n`;
        for (const key of Object.keys(manifest.views[view] ?? {})) {
            const name = names.get(`${view}:${key}`);
            out += `${JSON.stringify(key)}: { read: ${name}Read;${view === 'owned' ? ` write: ${name}Write;` : ''} };\n`;
        }
        out += '};\n';
    }
    out += '}\n';
    // Runtime bindings and aliases come from precisely the same artifact as the read/write types.
    out += `export const schema: GeneratedSchema<AppModels> = JSON.parse(${JSON.stringify(JSON.stringify(manifest))});\n`;
    return (
        '// Generated from the staff-exported app manifest. Review alias/schema diffs before replacing.\n' +
        `import type { ${[...imports].join(', ')} } from "@zyno-io/zynosuite-sdk";\n` +
        out
    );
}
async function main() {
    const [, , input, output = 'zyno.generated.ts'] = process.argv;
    if (!input) throw new Error('Usage: models:generate manifest.json [zyno.generated.ts]');
    const source = await readFile(resolve(input), 'utf8');
    const generated = generateModels(JSON.parse(source));
    await writeFile(resolve(output), generated);
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main();

import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { renderApi } from '../scripts/generate-api-docs.mjs';
const require = createRequire(new URL('../tools/docs/package.json', import.meta.url));
const ts = require('typescript');

test('API reference follows public exports and preserves public generic signatures/JSDoc', async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), 'zynosuite-api-docs-'));
    const entry = resolve(temporary, 'index.ts');
    try {
        await writeFile(resolve(temporary, 'dependency.ts'), 'export interface Dependency { hidden: string }');
        await writeFile(
            entry,
            `
import type { Dependency } from './dependency.js';
/** A public generic model. */
export interface Model<T> {
    readonly id: T;
    update(value: T): Promise<T>;
    [key: string]: unknown;
}
export class Client {
    #nativePrivate = 0;
    constructor(readonly code: string, private secret: string) {}
    /** Reads the supplied model without changing its type. */
    read<T extends Model<string>>(value: T): T { return value; }
    /** @internal */
    hidden(): Dependency { return { hidden: this.secret }; }
    overload(value: string): string;
    overload(value: number): number;
    overload(value: string | number): string | number { return value; }
    private implementation(): void {}
    protected subclassOnly(): void {}
}
/** Build a typed value. */
export function create<T>(value: T) { return { value }; }
/** @internal */
export function internalHelper() { return 1; }
`
        );
        const program = ts.createProgram([entry], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 });
        assert.equal(ts.getPreEmitDiagnostics(program).length, 0);
        const pages = renderApi(program, entry);
        assert.deepEqual([...pages.keys()].sort(), ['classes/Client.md', 'functions/create.md', 'index.md', 'interfaces/Model.md']);
        const client = pages.get('classes/Client.md');
        assert.match(client, /read<T extends Model<string>>\(value: T\): T/);
        assert.match(client, /Reads the supplied model/);
        assert.match(client, /readonly code: string/);
        assert.doesNotMatch(client, /hidden\(|implementation\(|subclassOnly\(|#nativePrivate/);
        assert.match(client, /overload\(value: string\): string/);
        assert.doesNotMatch(client, /overload\(value: string \| number/);
        assert.doesNotMatch(client, /constructor[^\n]*\): Client/);
        assert.match(pages.get('interfaces/Model.md'), /\[key: string\]: unknown/);
        assert.match(pages.get('functions/create.md'), /create<T>\(value: T\): \{ value: T; \}/);
        for (const path of [...pages.keys()].filter(path => path !== 'index.md')) assert.ok(pages.get('index.md').includes(`](${path})`));
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
});

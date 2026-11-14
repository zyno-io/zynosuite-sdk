import { spawn } from 'node:child_process';
import { mkdtemp, cp, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(resolve(tmpdir(), 'zynosuite-sdk-consumer-'));
async function run(command, args, cwd) {
    const code = await new Promise((done, reject) => {
        const child = spawn(command, args, { cwd, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', done);
    });
    if (code !== 0) throw new Error(`${command} failed (${code})`);
}
try {
    await run('yarn', ['pack', '--out', resolve(temporary, 'sdk.tgz')], root);
    await writeFile(
        resolve(temporary, 'package.json'),
        JSON.stringify({ private: true, type: 'module', dependencies: { '@zyno-io/zynosuite-sdk': 'file:./sdk.tgz' } })
    );
    await cp(resolve(root, 'examples'), resolve(temporary, 'examples'), { recursive: true });
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org'], temporary);
    const installed = resolve(temporary, 'node_modules/@zyno-io/zynosuite-sdk');
    const metadataSource = await readFile(resolve(installed, 'package.json'), 'utf8');
    const metadata = JSON.parse(metadataSource);
    // A silent no-op must not pass by compiling the checked-in generated fixture.
    await rm(resolve(temporary, 'examples/zyno.generated.ts'));
    // Exercise the actual published generator, rather than a manually trimmed example artifact.
    await run(
        'npm',
        [
            'exec',
            '--offline',
            '--',
            'zynosuite-models',
            resolve(temporary, 'examples/app-schema.json'),
            resolve(temporary, 'examples/zyno.generated.ts')
        ],
        temporary
    );
    const dependencies = Object.keys(metadata.dependencies ?? {});
    if (dependencies.some(name => !['@noble/hashes'].includes(name))) throw new Error('Unreviewed browser runtime dependency');
    async function inspect(directory) {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const item of entries) {
            const path = resolve(directory, item.name);
            if (item.isDirectory()) await inspect(path);
            else if (item.name.endsWith('.js')) {
                const source = await readFile(path, 'utf8');
                if (/(?:from|import)\s*['"](?:node:|@zyno-platform\/|@zyno-io\/(?:ts-server-foundation|ts-reflection))/.test(source))
                    throw new Error(`Backend/Node-only import in browser package: ${item.name}`);
                if (source.includes('/sdk/apps') || source.includes('/sdk/devices') || source.includes('/cms/me/'))
                    throw new Error(`Non-public endpoint in browser package: ${item.name}`);
            }
        }
    }
    await inspect(resolve(installed, 'dist'));
    await run('yarn', ['exec', 'tsc', '--project', resolve(temporary, 'examples/tsconfig.json')], root);
} finally {
    await rm(temporary, { recursive: true, force: true });
}

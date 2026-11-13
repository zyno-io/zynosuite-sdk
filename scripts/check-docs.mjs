import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs');
async function walk(directory) {
    const result = [];
    const entries = await readdir(directory, { withFileTypes: true });
    for (const item of entries) {
        if (item.name.startsWith('.')) continue;
        const path = resolve(directory, item.name);
        if (item.isDirectory()) {
            const children = await walk(path);
            result.push(...children);
        } else if (item.name.endsWith('.md')) result.push(path);
    }
    return result;
}
const docFiles = await walk(root);
const files = [...docFiles, ...process.argv.slice(2).map(path => resolve(path))],
    errors = [];
for (const path of files) {
    const source = await readFile(path, 'utf8');
    let inFence = false;
    for (const line of source.split('\n'))
        if (line.startsWith('```')) {
            if (!inFence && line.trim() === '```') errors.push(`${path}: untagged code fence`);
            inFence = !inFence;
        }
    if (inFence) errors.push(`${path}: unclosed code fence`);
    const prose = source.replace(/```[^\n]*\n[\s\S]*?```/g, '');
    for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^(https?:|mailto:)/.test(target)) continue;
        const base = target.startsWith('/') ? root : dirname(path),
            relative = target.replace(/^\//, '');
        const candidates = [resolve(base, relative), resolve(base, relative + '.md'), resolve(base, relative, 'index.md')];
        let found = false;
        for (const candidate of candidates) {
            try {
                await stat(candidate);
                found = true;
                break;
            } catch {
                /* Try the next Markdown target form. */
            }
        }
        if (!found) errors.push(`${path}: missing link ${target}`);
    }
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Checked ${files.length} Markdown files: local links and fenced code blocks.`);

import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Documentation tooling has its own supported compiler; the SDK's compiler remains independent.
const require = createRequire(new URL('../tools/docs/package.json', import.meta.url));
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const print = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const typeFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const signatureFlags = typeFlags | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature;
const display = parts => (typeof parts === 'string' ? parts : ts.displayPartsToString(parts ?? []));

function hidden(node, symbol, checker) {
    const flags = ts.getCombinedModifierFlags(node);
    if (node.name && ts.isPrivateIdentifier(node.name)) return true;
    if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return true;
    return symbol?.getJsDocTags(checker).some(tag => ['internal', 'deprecated'].includes(tag.name)) ?? false;
}
function documentation(symbol, checker) {
    if (!symbol) return '';
    const body = display(symbol.getDocumentationComment(checker));
    const tags = symbol
        .getJsDocTags(checker)
        .filter(tag => !['internal', 'deprecated'].includes(tag.name))
        .map(tag => `**@${tag.name}** ${display(tag.text)}`);
    return [body, ...tags].filter(Boolean).join('\n\n');
}
function nameOf(node) {
    return node.name ? print.printNode(ts.EmitHint.Unspecified, node.name, node.getSourceFile()) : 'constructor';
}
function signature(node, checker) {
    const result = checker.getSignatureFromDeclaration(node);
    if (!result) throw new Error(`No signature for ${nameOf(node)}`);
    return checker.signatureToString(result, node, signatureFlags);
}
function memberText(node, checker) {
    const symbol = node.name ? checker.getSymbolAtLocation(node.name) : undefined;
    if (hidden(node, symbol, checker)) return undefined;
    const modifiers = ts.getCombinedModifierFlags(node);
    const prefix = `${modifiers & ts.ModifierFlags.Static ? 'static ' : ''}${modifiers & ts.ModifierFlags.Readonly ? 'readonly ' : ''}`;
    let declaration;
    if (ts.isConstructorDeclaration(node)) {
        const parameters = node.parameters.map(parameter => {
            const type = parameter.type ?? checker.typeToTypeNode(checker.getTypeAtLocation(parameter), parameter, typeFlags);
            return ts.factory.updateParameterDeclaration(
                parameter,
                undefined,
                parameter.dotDotDotToken,
                parameter.name,
                parameter.questionToken ?? (parameter.initializer ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined),
                type,
                undefined
            );
        });
        const constructor = ts.factory.updateConstructorDeclaration(node, undefined, parameters, undefined);
        declaration = print.printNode(ts.EmitHint.Unspecified, constructor, node.getSourceFile());
    } else if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node))
        declaration = `${prefix}${nameOf(node)}${node.questionToken ? '?' : ''}${signature(node, checker)};`;
    else if (ts.isGetAccessorDeclaration(node)) declaration = `${prefix}get ${nameOf(node)}${signature(node, checker)};`;
    else if (ts.isSetAccessorDeclaration(node)) declaration = `${prefix}set ${nameOf(node)}${signature(node, checker)};`;
    else if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node))
        declaration = `${prefix}${nameOf(node)}${node.questionToken ? '?' : ''}: ${checker.typeToString(checker.getTypeAtLocation(node), node, typeFlags)};`;
    else if (ts.isIndexSignatureDeclaration(node)) declaration = print.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
    else if (ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node))
        declaration = `${ts.isConstructSignatureDeclaration(node) ? 'new ' : ''}${signature(node, checker)};`;
    else return undefined;
    return { name: nameOf(node), declaration, docs: documentation(symbol, checker) };
}

/** Export graph only: imported implementation modules and standard-library declarations are not pages. */
export function renderApi(program, entryFile) {
    const checker = program.getTypeChecker();
    const entry = program.getSourceFile(entryFile);
    const module = entry && checker.getSymbolAtLocation(entry);
    if (!module) throw new Error('SDK entry point is not a module');
    const pages = new Map();
    const index = [];
    for (const exported of checker.getExportsOfModule(module).sort((left, right) => left.name.localeCompare(right.name))) {
        const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        const declarations = target.getDeclarations() ?? [];
        const declaration = declarations.find(
            node =>
                ts.isClassDeclaration(node) ||
                ts.isInterfaceDeclaration(node) ||
                ts.isTypeAliasDeclaration(node) ||
                ts.isFunctionDeclaration(node) ||
                ts.isVariableDeclaration(node) ||
                ts.isEnumDeclaration(node)
        );
        if (!declaration || hidden(declaration, target, checker)) continue;
        const name = exported.name;
        const source = declaration.getSourceFile();
        let category,
            code,
            memberSections = '';
        if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
            category = ts.isClassDeclaration(declaration) ? 'classes' : 'interfaces';
            const kind = category === 'classes' ? 'class' : 'interface';
            const parameters = declaration.typeParameters?.length
                ? `<${declaration.typeParameters.map(parameter => print.printNode(ts.EmitHint.Unspecified, parameter, source)).join(', ')}>`
                : '';
            const heritage =
                declaration.heritageClauses?.map(clause => print.printNode(ts.EmitHint.Unspecified, clause, source).trim()).join(' ') ?? '';
            const visibleMembers = declaration.members.filter(member => {
                if (!ts.isMethodDeclaration(member) || !member.body) return true;
                return !declaration.members.some(other => ts.isMethodDeclaration(other) && !other.body && nameOf(other) === nameOf(member));
            });
            const members = visibleMembers.map(member => memberText(member, checker)).filter(Boolean);
            for (const constructor of declaration.members.filter(ts.isConstructorDeclaration)) {
                for (const parameter of constructor.parameters) {
                    const flags = ts.getCombinedModifierFlags(parameter);
                    const symbol = checker.getSymbolAtLocation(parameter.name);
                    if (!(flags & (ts.ModifierFlags.Public | ts.ModifierFlags.Readonly)) || hidden(parameter, symbol, checker)) continue;
                    const type = checker.typeToString(checker.getTypeAtLocation(parameter), parameter, typeFlags);
                    members.push({
                        name: nameOf(parameter),
                        declaration: `${flags & ts.ModifierFlags.Readonly ? 'readonly ' : ''}${nameOf(parameter)}${parameter.questionToken ? '?' : ''}: ${type};`,
                        docs: documentation(symbol, checker)
                    });
                }
            }
            code = `export ${kind} ${name}${parameters}${heritage ? ' ' + heritage : ''} {\n${members.map(member => '    ' + member.declaration).join('\n')}\n}`;
            memberSections = members
                .filter(member => member.docs)
                .map(member => `\n## ${member.name}\n\n${member.docs}\n`)
                .join('');
        } else if (ts.isFunctionDeclaration(declaration)) {
            category = 'functions';
            const type = checker.getTypeOfSymbolAtLocation(target, declaration);
            code = type
                .getCallSignatures()
                .map(call => `export function ${name}${checker.signatureToString(call, declaration, signatureFlags)};`)
                .join('\n');
        } else if (ts.isTypeAliasDeclaration(declaration)) {
            category = 'type-aliases';
            const parameters = declaration.typeParameters?.length
                ? `<${declaration.typeParameters.map(parameter => print.printNode(ts.EmitHint.Unspecified, parameter, source)).join(', ')}>`
                : '';
            code = `export type ${name}${parameters} = ${print.printNode(ts.EmitHint.Unspecified, declaration.type, source)};`;
        } else if (ts.isEnumDeclaration(declaration)) {
            category = 'enumerations';
            code = print.printNode(ts.EmitHint.Unspecified, declaration, source);
        } else {
            category = 'variables';
            code = `export const ${name}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(target, declaration), declaration, typeFlags)};`;
        }
        const docs = documentation(target, checker);
        const path = `${category}/${name}.md`;
        pages.set(path, `# ${name}\n\n${docs ? docs + '\n\n' : ''}\`\`\`ts\n${code}\n\`\`\`\n${memberSections}`);
        index.push({ category, name, path });
    }
    let overview =
        '# API reference\n\nGenerated from the SDK public export graph, declarations and JSDoc. Private, protected and internal implementation members are excluded.\n';
    for (const category of ['functions', 'classes', 'interfaces', 'type-aliases', 'enumerations', 'variables']) {
        const items = index.filter(item => item.category === category);
        if (!items.length) continue;
        overview += `\n## ${category.replaceAll('-', ' ')}\n\n`;
        overview += items.map(item => `- [${item.name}](${item.path})`).join('\n') + '\n';
    }
    pages.set('index.md', overview);
    return pages;
}

async function main() {
    const configPath = resolve(root, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const entry = resolve(root, 'src/index.ts');
    const program = ts.createProgram([entry], { ...parsed.options, noEmit: true });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length)
        throw new Error(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: name => name,
                getCurrentDirectory: () => root,
                getNewLine: () => '\n'
            })
        );
    const pages = renderApi(program, entry);
    const temporary = resolve(root, '.working/api-docs-next');
    await rm(temporary, { recursive: true, force: true });
    for (const [path, content] of pages) {
        const target = resolve(temporary, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
    }
    await rm(resolve(root, 'docs/api'), { recursive: true, force: true });
    await rename(temporary, resolve(root, 'docs/api'));
    console.log(`Generated ${pages.size} public API Markdown pages with TypeScript ${ts.version}.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

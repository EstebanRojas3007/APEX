// Read-only validation of the explicit first-commit manifest. No Git writes.
import {readFileSync, existsSync, statSync, readdirSync} from 'node:fs';
import {resolve, dirname, relative, join} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const paths = readFileSync(join(root, 'Docs/GITHUB_ARCHIVOS_REVISAR.txt'), 'utf8').trim().split(/\r?\n/);
const selected = new Set(paths);
const issues = [];
const report = (path, category, extra = {}) => issues.push({path, category, ...extra});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = text => text.replace(/\\[nrt]/g, ' ').replace(/\s+/g, ' ').trim();
const content = new Map();
for (const path of paths) {
  const abs = resolve(root, path);
  if (!abs.startsWith(root + '/') && !abs.startsWith(root + '\\')) { report(path, 'outside-root'); continue; }
  if (!existsSync(abs) || !statSync(abs).isFile()) { report(path, 'missing-file'); continue; }
  const bytes = readFileSync(abs);
  if (bytes.includes(0)) report(path, 'binary-requires-review');
  content.set(path, bytes.toString('utf8'));
}
if (selected.size !== paths.length) report('Docs/GITHUB_ARCHIVOS_REVISAR.txt', 'duplicate-path');
for (const dir of ['supabase/migrations', 'server/migrations']) {
  for (const name of readdirSync(join(root, dir))) if (!selected.has(dir + '/' + name)) report(dir + '/' + name, 'migration-excluded');
}
for (const path of ['.gitattributes', 'package.json', 'package-lock.json', 'app.json', 'index.ts', 'App.tsx', 'tsconfig.json', 'server/tsconfig.json', '.env.example', '.env.ai.example', 'supabase/functions/.env.example', 'supabase/applied-baseline.json', 'supabase/seed-demo.sql']) {
  if (!selected.has(path)) report(path, 'required-file-excluded');
}
for (const [path, text] of content) {
  if (path.endsWith('.md')) for (const match of text.matchAll(/!?\[[^\]\n]*\]\(((?:[^()\n]|\([^()\n]*\))*)\)/g)) {
    let link = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;
    try { link = decodeURIComponent(link); } catch { report(path, 'invalid-link'); continue; }
    const target = relative(root, resolve(dirname(join(root, path)), link)).replaceAll('\\', '/');
    if (!selected.has(target) && !paths.some(p => p.startsWith(target.replace(/\/$/, '') + '/'))) report(path, 'link-to-unselected-file', {target});
  }
  if (/\.(?:ts|tsx|mjs)$/.test(path)) {
    const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const check = literal => {
      if (!literal || !ts.isStringLiteralLike(literal) || !literal.text.startsWith('.')) return;
      const base = resolve(dirname(join(root, path)), literal.text);
      const options = [base, ...['.ts', '.tsx', '.mjs', '.js', '.json', '/index.ts', '.web.ts', '.web.tsx'].map(ext => base + ext)];
      if (!options.some(p => selected.has(relative(root, p).replaceAll('\\', '/')))) report(path, 'local-import-excluded', {target:literal.text});
    };
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) check(node.moduleSpecifier);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require')) check(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
}

// Optional comparison with authorized local editorial files. Never prints text,
// keys, student records or hashes of private files. Not required in a fresh clone.
let privateComparison = 'not-requested', fingerprints = 0, comparedFiles = 0;
if (process.argv.includes('--private-material')) {
  const snippets = new Set(), privateHashes = new Set();
  const strings = value => {
    if (typeof value === 'string') {
      const s = normalized(value);
      if (s.length >= 80 && /\s/.test(s) && !/^https?:/.test(s)) {
        for (let offset = 0; offset + 80 <= s.length; offset += 40) snippets.add(s.slice(offset, offset + 80));
      }
    } else if (Array.isArray(value)) value.forEach(strings);
    else if (value && typeof value === 'object') Object.values(value).forEach(strings);
  };
  const walk = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, {withFileTypes:true})) {
      const abs = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(abs);
      else {
        const bytes = readFileSync(abs); privateHashes.add(hash(bytes)); comparedFiles++;
        // Editorial fields only: metadata includes shared software instructions.
        if (entry.name === 'revision.json') {
          const data = JSON.parse(bytes.toString('utf8'));
          for (const q of data.questions ?? []) { strings(q.text); strings(q.options); }
          for (const b of data.blocks ?? []) { strings(b.reading); strings(b.sharedOptions); }
        }
        if (entry.name === 'claves.servidor.json') {
          const data = JSON.parse(bytes.toString('utf8'));
          for (const key of data.keys ?? []) strings(key.justification);
        }
      }
    }
  };
  for (const dir of ['content', 'Docs/Materiales']) walk(join(root, dir));
  for (const name of ['apex-ingles-105-v0.2.sql', 'icfes-ingles-2018-draft.sql']) {
    const p = join(root, 'supabase/content', name);
    if (existsSync(p)) { privateHashes.add(hash(readFileSync(p))); comparedFiles++; }
  }
  for (const [path, text] of content) {
    const bytes = readFileSync(join(root, path));
    if (privateHashes.has(hash(bytes))) report(path, 'exact-private-file-copy');
    const plain = normalized(text);
    if ([...snippets].some(s => plain.includes(s))) report(path, 'editorial-text-copy-review');
  }
  fingerprints = snippets.size;
  privateComparison = comparedFiles ? 'completed' : 'no-private-material-found';
  if (!comparedFiles) report('content/', 'private-comparison-unavailable');
}
console.log(JSON.stringify({files: paths.length, migrations: paths.filter(p => /^supabase\/migrations\//.test(p)).length,
  privateComparison, comparedFiles, fingerprints, issues,
  limitations: ['Git ignore rules require separate git check-ignore verification', 'Dynamic paths, encoded or rewritten excerpts and short answer sequences need manual review', 'Static imports and Markdown file targets checked; remote links and Markdown anchors not requested']}, null, 2));
if (issues.length) process.exitCode = 1;

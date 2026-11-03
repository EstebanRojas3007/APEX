// Offline review helper. Never prints matching text, environment values or blob contents.
// Heuristics are not a substitute for a maintained secret scanner or visual review.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { inflateSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const selectionOnly = process.argv.includes('--selection');
const findings = [];
const binary = [];
const skipped = [];
const excluded = new Set(['node_modules', '.git']);
const rules = [
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['provider-secret', /\b(?:sb_secret_[A-Za-z0-9_-]{15,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{15,}|GOCSPX-[A-Za-z0-9_-]{15,}|1\/\/[A-Za-z0-9_-]{25,}|re_[A-Za-z0-9]{24,})\b/g],
  ['supabase-public-key', /\bsb_publishable_[A-Za-z0-9_-]{15,}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g],
  ['credential-in-url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?):\/\/[^\s/@:]+:[^\s/@]+@[^\s'"<>]+/g],
  ['literal-credential-review', /\b(?:[A-Z_]*(?:PASSWORD|SECRET|TOKEN|SERVICE_KEY|API_KEY|CLIENT_SECRET|REFRESH_TOKEN)|password|secret|access_token|refresh_token|api_key|client_secret|service_role_key)["']?[ \t]*[=:][ \t]*["'][^"'\r\n]{8,}["']/g],
  ['unquoted-env-credential-review', /^[ \t]*(?:export[ \t]+)?[A-Z_]*(?:PASSWORD|SECRET|TOKEN|SERVICE_KEY|API_KEY|CLIENT_SECRET|REFRESH_TOKEN)[A-Z_]*[ \t]*=[ \t]*[^\s#][^\r\n]*/gm],
  ['email-review', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['supabase-project-reference', /\bhttps:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\b/g],
];

// Compare nonempty local env values without printing them. Public Expo config is
// deliberately classified separately; it is bundled into client builds by design.
const envValues = [];
for (const file of ['.env', '.env.ai', 'supabase/functions/.env.local']) {
  if (!existsSync(join(root, file))) continue;
  for (const line of readFileSync(join(root, file), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= 12 && !/^(?:http:\/\/(?:localhost|127\.0\.0\.1)|example|your_|replace_|<)/i.test(value)) {
      envValues.push({ value, type: match[1].startsWith('EXPO_PUBLIC_') ? 'local-public-env-copy' : 'local-private-env-copy' });
    }
  }
}

function scan(bytes, location, source) {
  // Binary scans cover only visible strings, never compressed pixels/PDF streams.
  const isBinary = bytes.subarray(0, 8192).includes(0) || /\.(?:png|jpe?g|webp|pdf|zip|sqlite(?:-wal|-shm)?|wasm|ttf|otf)$/i.test(location);
  if (isBinary && source === 'worktree') binary.push(location);
  const text = bytes.toString('utf8');
  for (const [kind, expression] of rules) {
    expression.lastIndex = 0;
    const lines = new Set();
    let count = 0;
    for (const match of text.matchAll(expression)) {
      count++;
      if (lines.size < 12) lines.add(text.slice(0, match.index).split('\n').length);
    }
    if (count) findings.push({ source, location, kind, count, lines: [...lines] });
  }
  for (const { value, type } of envValues) {
    if (text.includes(value)) findings.push({ source, location, kind: type, count: text.split(value).length - 1 });
  }
}

let files = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) { skipped.push({ location: rel, reason: 'symlink' }); continue; }
    if (entry.isDirectory()) {
      if (excluded.has(entry.name) || rel === '.tools/pdf' || rel.startsWith('documentos-locales/auditoria-github')) {
        skipped.push({ location: rel, reason: 'dependencies-tools-git-or-audit-output' });
      } else walk(abs);
    } else {
      const size = statSync(abs).size;
      if (size > 80 * 1024 * 1024) { skipped.push({ location: rel, reason: 'over-80-MiB' }); continue; }
      scan(readFileSync(abs), rel, 'worktree'); files++;
    }
  }
}
if (selectionOnly) {
  const manifest = readFileSync(join(root, 'Docs/GITHUB_ARCHIVOS_REVISAR.txt'), 'utf8').trim().split(/\r?\n/);
  for (const file of manifest) {
    const abs = resolve(root, file);
    if (!abs.startsWith(root + '\\') && !abs.startsWith(root + '/')) throw Error('Manifest path outside project');
    scan(readFileSync(abs), file, 'selection'); files++;
  }
} else walk(root);

// Optionally inspect locally extracted PDF/OCR text. Outputs stay ignored.
if (process.argv.includes('--extracted-text')) {
  const extractionDir = join(root, 'documentos-locales', 'auditoria-github');
  function extracted(dir) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory() && e.name === 'ocr') extracted(p);
      else if (e.isFile() && e.name.endsWith('.txt')) scan(readFileSync(p), relative(root, p).replaceAll('\\', '/'), 'extracted-text');
    }
  }
  extracted(extractionDir);
}
for (const file of selectionOnly ? [] : ['config', 'FETCH_HEAD', 'packed-refs', 'info/exclude']) {
  const p = join(root, '.git', file);
  if (existsSync(p)) scan(readFileSync(p), '.git/' + file, 'git-metadata');
}

// This repository currently uses loose objects. Inspect ALL of them, including
// unreachable trees and Codex checkpoint refs, rather than just branch commits.
const objects = new Map();
const objectDir = join(root, '.git', 'objects');
let packFiles = [];
if (!selectionOnly && existsSync(objectDir)) {
  if (existsSync(join(objectDir, 'pack'))) packFiles = readdirSync(join(objectDir, 'pack')).filter(x => x.endsWith('.pack'));
  for (const prefix of readdirSync(objectDir).filter(x => /^[a-f0-9]{2}$/.test(x))) {
    for (const suffix of readdirSync(join(objectDir, prefix))) {
      const raw = inflateSync(readFileSync(join(objectDir, prefix, suffix)));
      const nul = raw.indexOf(0);
      objects.set(prefix + suffix, { type: raw.subarray(0, nul).toString().split(' ')[0], body: raw.subarray(nul + 1) });
    }
  }
}
const children = new Set();
const trees = new Map();
for (const [oid, obj] of objects) {
  if (obj.type !== 'tree') continue;
  const entries = [];
  for (let cursor = 0; cursor < obj.body.length;) {
    const space = obj.body.indexOf(32, cursor), nul = obj.body.indexOf(0, space);
    const entry = { mode: obj.body.subarray(cursor, space).toString(), name: obj.body.subarray(space + 1, nul).toString(), oid: obj.body.subarray(nul + 1, nul + 21).toString('hex') };
    entries.push(entry); children.add(entry.oid); cursor = nul + 21;
  }
  trees.set(oid, entries);
}
const paths = new Map();
function walkTree(oid, prefix = '', ancestors = new Set()) {
  if (ancestors.has(oid)) return;
  const next = new Set([...ancestors, oid]);
  for (const entry of trees.get(oid) ?? []) {
    const path = prefix + entry.name;
    if (entry.mode === '40000') walkTree(entry.oid, path + '/', next);
    else { if (!paths.has(entry.oid)) paths.set(entry.oid, new Set()); paths.get(entry.oid).add(path); }
  }
}
for (const oid of trees.keys()) if (!children.has(oid)) walkTree(oid);
const types = {};
for (const [oid, obj] of objects) {
  types[obj.type] = (types[obj.type] ?? 0) + 1;
  if (['blob', 'commit', 'tag'].includes(obj.type)) {
    const names = [...(paths.get(oid) ?? [])].sort();
    scan(obj.body, `object:${oid.slice(0, 12)}:${names.join('|') || '(no-path)'}`, 'git-object');
  }
}

console.log(JSON.stringify({
  tool: 'APEX offline audit-repository.mjs (Node.js, regex + local env comparison + zlib loose Git objects)',
  files, gitObjects: objects.size, gitObjectTypes: types, packFiles: packFiles.length,
  scope: selectionOnly ? 'Explicit first-commit manifest only; no index or Git mutation' : 'Worktree and loose Git objects',
  limitations: ['No online validation or remote access', 'No OCR in this script; binary strings only; use --extracted-text to scan separately extracted PDF/OCR text', 'No general entropy detection; unknown formats and split/encoded secrets may escape', 'Emails and literal credentials require manual classification; synthetic fixtures can match', 'Dependencies, .tools/pdf third-party installation, symlinks, files over 80 MiB and prior local audit output excluded; other .tools artifacts included', 'Packed Git objects are not supported by this helper; any pack file requires another scanner'],
  skipped, binary, findings,
}, null, 2));
if (packFiles.length) process.exitCode = 2;

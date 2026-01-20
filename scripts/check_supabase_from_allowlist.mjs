import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const allowlistPath = path.join(ROOT, 'scripts', 'supabase_from_allowlist.json');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!fs.existsSync(allowlistPath)) {
  console.error(`Missing allowlist: ${path.relative(ROOT, allowlistPath)}`);
  process.exit(2);
}

const allowRaw = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

const allowEntries = Array.isArray(allowRaw?.entries)
  ? allowRaw.entries
  : Array.isArray(allowRaw?.allowedFiles)
  ? allowRaw.allowedFiles.map((file) => ({ file, reason: '(legacy allowlist)' }))
  : [];

const allow = new Set(
  allowEntries
    .map((e) => (typeof e === 'string' ? e : e?.file))
    .filter(Boolean)
);

const invalidAllowEntries = allowEntries
  .filter((e) => typeof e !== 'string')
  .filter((e) => !e?.file || typeof e.file !== 'string' || !String(e.reason || '').trim());

if (invalidAllowEntries.length) {
  console.error('Invalid allowlist entries in scripts/supabase_from_allowlist.json (missing `file` or `reason`).');
  for (const e of invalidAllowEntries) console.error(`- ${JSON.stringify(e)}`);
  process.exit(2);
}

// Captura `supabase.from(` mesmo com quebras de linha/espaços entre `supabase` e `.from`.
const re = /\bsupabase\s*\.\s*from\s*\(/gms;

const offenders = [];
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

for (const file of files) {
  const rel = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const src = fs.readFileSync(file, 'utf8');
  if (!re.test(src)) continue;
  re.lastIndex = 0;
  const matches = [...src.matchAll(re)];
  if (!matches.length) continue;
  if (!allow.has(rel)) offenders.push({ file: rel, count: matches.length });
}

if (offenders.length) {
  console.error('Found disallowed `supabase.from()` usage. Move to RPC-first or add explicit allowlist entry:');
  for (const o of offenders) console.error(`- ${o.file} (${o.count})`);
  process.exit(1);
}

console.log('OK: no disallowed `supabase.from()` found.');

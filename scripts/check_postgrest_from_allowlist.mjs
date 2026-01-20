import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const allowlistPath = path.join(ROOT, "scripts", "postgrest_from_allowlist.json");

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

const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const entries = Array.isArray(raw?.entries) ? raw.entries : [];
const allow = new Set(entries.map((e) => e?.file).filter(Boolean));

const invalid = entries.filter((e) => !e?.file || typeof e.file !== "string" || !String(e.reason || "").trim());
if (invalid.length) {
  console.error("Invalid allowlist entries in scripts/postgrest_from_allowlist.json (missing `file` or `reason`).");
  for (const e of invalid) console.error(`- ${JSON.stringify(e)}`);
  process.exit(2);
}

// Captura `.from('tabela')` / `.from("tabela")` (PostgREST). Ignora `storage.from(...)`.
const re = /\.\s*from\s*\(\s*['"][^'"]+['"]\s*\)/gms;

function isStorageFrom(src, matchIndex) {
  // Olha um pouco para trás para detectar `storage.from(...)`.
  const start = Math.max(0, matchIndex - 80);
  const prefix = src.slice(start, matchIndex);
  return /\bstorage\s*\.\s*$/.test(prefix) || /\bstorage\s*\.\s*from\s*\($/m.test(prefix);
}

const offenders = [];
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

for (const file of files) {
  const rel = path.relative(ROOT, file).replaceAll(path.sep, "/");
  const src = fs.readFileSync(file, "utf8");

  if (!re.test(src)) continue;
  re.lastIndex = 0;
  const matches = [...src.matchAll(re)];
  const realMatches = matches.filter((m) => !isStorageFrom(src, m.index ?? 0));
  if (!realMatches.length) continue;

  if (!allow.has(rel)) offenders.push({ file: rel, count: realMatches.length });
}

if (offenders.length) {
  console.error("Found disallowed PostgREST `.from('table')` usage.");
  console.error("Move to RPC-first or add explicit allowlist entry (with a reason): scripts/postgrest_from_allowlist.json");
  for (const o of offenders) console.error(`- ${o.file} (${o.count})`);
  process.exit(1);
}

console.log("OK: no disallowed PostgREST `.from()` found.");


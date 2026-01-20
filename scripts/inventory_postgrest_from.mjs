import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "INVENTARIO-POSTGREST-FROM.md");

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

// Captura `.from('tabela')` / `.from("tabela")` (PostgREST). Ignora `storage.from(...)`.
const re = /\.\s*from\s*\(\s*(['"])([^'"]+)\1\s*\)/gms;

function isStorageFrom(src, matchIndex) {
  const start = Math.max(0, matchIndex - 80);
  const prefix = src.slice(start, matchIndex);
  return /\bstorage\s*\.\s*$/.test(prefix) || /\bstorage\s*\.\s*from\s*\($/m.test(prefix);
}

const hits = [];
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

for (const file of files) {
  const rel = path.relative(ROOT, file).replaceAll(path.sep, "/");
  const src = fs.readFileSync(file, "utf8");
  re.lastIndex = 0;
  for (const m of src.matchAll(re)) {
    if (isStorageFrom(src, m.index ?? 0)) continue;
    hits.push({ file: rel, table: m[2] });
  }
}

hits.sort((a, b) => (a.table === b.table ? a.file.localeCompare(b.file) : a.table.localeCompare(b.table)));

const byTable = new Map();
for (const h of hits) {
  const arr = byTable.get(h.table) || [];
  arr.push(h.file);
  byTable.set(h.table, arr);
}

const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
let md = `# Inventário — PostgREST \`.from('tabela')\`\n\n`;
md += `Gerado em: ${stamp}\n\n`;
md += `Objetivo: mapear acessos diretos a tabelas via PostgREST (client-side), para migração RPC-first.\n\n`;

if (!hits.length) {
  md += `✅ Nenhuma ocorrência encontrada.\n`;
  fs.writeFileSync(OUT, md, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT)} (0 ocorrências)`);
  process.exit(0);
}

md += `## Resumo\n\n`;
md += `- Arquivos: **${new Set(hits.map((h) => h.file)).size}**\n`;
md += `- Referências: **${hits.length}**\n`;
md += `- Tabelas: **${byTable.size}**\n\n`;

md += `## Tabelas\n\n`;
for (const [table, filesList] of byTable.entries()) {
  md += `### \`${table}\`\n\n`;
  for (const f of [...new Set(filesList)].sort()) md += `- \`${f}\`\n`;
  md += `\n`;
}

fs.writeFileSync(OUT, md, "utf8");
console.log(`Wrote ${path.relative(ROOT, OUT)} (${hits.length} referências)`);


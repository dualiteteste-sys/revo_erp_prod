import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

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

function domainForFile(filePath) {
  const rel = path.relative(SRC, filePath).replaceAll(path.sep, '/');
  const parts = rel.split('/');
  const [root] = parts;

  if (root === 'pages' || root === 'services' || root === 'components') {
    const d = parts[1] || 'core';
    return `${root}/${d}`;
  }
  return root || 'core';
}

function extractTables(source) {
  const tables = [];
  // Captura `supabase.from('table')` mesmo quando há quebras de linha/espaços entre `supabase` e `.from`.
  const re = /\bsupabase\s*\.\s*from\(\s*(['"`])([^'"`]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(source))) {
    tables.push(m[2]);
  }
  return tables;
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

const byDomain = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/\bsupabase\s*\.\s*from\(/.test(src)) continue;
  const tables = extractTables(src);
  if (!tables.length) continue;
  const domain = domainForFile(file);
  const rel = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const entry = byDomain.get(domain) || { count: 0, tables: new Map(), files: [] };
  entry.count += tables.length;
  entry.files.push(rel);
  for (const t of tables) entry.tables.set(t, (entry.tables.get(t) || 0) + 1);
  byDomain.set(domain, entry);
}

const domains = [...byDomain.entries()].sort((a, b) => b[1].count - a[1].count);

const lines = [];
lines.push('# Inventário — `supabase.from()` por domínio');
lines.push('');
lines.push(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
lines.push('');
lines.push('Objetivo: mapear acessos diretos a tabelas (client-side) para migrar gradualmente para RPC-first em domínios sensíveis.');
lines.push('');

for (const [domain, data] of domains) {
  lines.push(`## ${domain} — ${data.count} ocorrência(s)`);
  const tables = [...data.tables.entries()].sort((a, b) => b[1] - a[1]);
  lines.push('');
  lines.push('**Tabelas mais acessadas**');
  for (const [table, count] of tables.slice(0, 15)) {
    lines.push(`- \`${table}\`: ${count}`);
  }
  if (tables.length > 15) lines.push(`- … (+${tables.length - 15} tabelas)`);
  lines.push('');
  lines.push('**Arquivos**');
  for (const f of [...new Set(data.files)].slice(0, 25)) lines.push(`- \`${f}\``);
  if (data.files.length > 25) lines.push(`- … (+${data.files.length - 25} arquivos)`);
  lines.push('');
}

const outPath = path.join(ROOT, 'INVENTARIO-SUPABASE-FROM.md');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${path.relative(ROOT, outPath)}`);

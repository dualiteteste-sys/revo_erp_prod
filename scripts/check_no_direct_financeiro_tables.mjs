import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');

function listFiles(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const patterns = [
  {
    name: 'supabase.from(financeiro_)',
    re: /supabase\.from\(\s*['"`]financeiro_/g,
  },
  {
    name: 'supabase.from(finance_)',
    re: /supabase\.from\(\s*['"`]finance_/g,
  },
];

const hits = [];

for (const file of listFiles(root)) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
  const rel = path.relative(process.cwd(), file);
  const text = readFileSync(file, 'utf8');

  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text))) {
      const upto = text.slice(0, m.index);
      const line = upto.split('\n').length;
      hits.push({ file: rel, line, pattern: p.name });
    }
  }
}

if (hits.length) {
  const details = hits
    .slice(0, 200)
    .map((h) => `${h.file}:${h.line}  ${h.pattern}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(
    [
      'RG-FIN-01: acesso direto a tabelas do Financeiro detectado no frontend.',
      'O módulo Financeiro deve ser RPC-first (sem supabase.from("financeiro_*")).',
      '',
      details,
      hits.length > 200 ? `\n(+${hits.length - 200} ocorrências omitidas)` : '',
    ].join('\n')
  );
  process.exit(1);
}

readFileSync('package.json', 'utf8');

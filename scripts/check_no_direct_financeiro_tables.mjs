import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function rg(pattern) {
  const res = spawnSync('rg', ['-n', pattern, 'src'], { encoding: 'utf8' });
  if (res.status === 0) return (res.stdout || '').trim();
  if (res.status === 1) return '';
  throw new Error((res.stderr || res.stdout || 'rg failed').trim());
}

const patterns = [
  String.raw`supabase\.from\(\s*['"\`]financeiro_`,
  String.raw`supabase\.from\(\s*['"\`]finance_`,
];

const hits = patterns
  .map((p) => ({ pattern: p, output: rg(p) }))
  .filter((h) => h.output);

if (hits.length) {
  const details = hits
    .map((h) => `Pattern: ${h.pattern}\n${h.output}`)
    .join('\n\n');
  // eslint-disable-next-line no-console
  console.error(
    [
      'RG-FIN-01: acesso direto a tabelas do Financeiro detectado no frontend.',
      'O módulo Financeiro deve ser RPC-first (sem supabase.from("financeiro_*")).',
      '',
      details,
    ].join('\n')
  );
  process.exit(1);
}

// Sanity: falha se o script for executado fora do repo (ajuda CI).
readFileSync('package.json', 'utf8');

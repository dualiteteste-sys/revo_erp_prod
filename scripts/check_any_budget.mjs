import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const BUDGET_PATH = path.join(ROOT, 'scripts', 'any_budget.json');

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

function normalize(p) {
  return p.replaceAll(path.sep, '/');
}

function matchesAny(pattern, rel) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return rel === prefix || rel.startsWith(`${prefix}/`);
  }
  return rel === pattern;
}

function loadBudgets() {
  if (!fs.existsSync(BUDGET_PATH)) {
    return {
      generated_at: null,
      budgets: [],
    };
  }
  return JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
}

function countInText(text) {
  const anyRe = /\bany\b/g;
  const asAnyRe = /\bas\s+any\b/g;
  let anyCount = 0;
  let asAnyCount = 0;
  anyRe.lastIndex = 0;
  asAnyRe.lastIndex = 0;
  while (anyRe.exec(text)) anyCount += 1;
  while (asAnyRe.exec(text)) asAnyCount += 1;
  return { anyCount, asAnyCount };
}

function computeCounts(files) {
  let anyCount = 0;
  let asAnyCount = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const c = countInText(text);
    anyCount += c.anyCount;
    asAnyCount += c.asAnyCount;
  }
  return { anyCount, asAnyCount };
}

function selectFilesForBudget(allFiles, budget) {
  const include = budget.include || [];
  const exclude = budget.exclude || [];

  return allFiles.filter((f) => {
    const rel = normalize(path.relative(ROOT, f));
    const inc = include.some((p) => matchesAny(p, rel));
    if (!inc) return false;
    const exc = exclude.some((p) => matchesAny(p, rel));
    return !exc;
  });
}

const args = process.argv.slice(2);
const wantsUpdate = args.includes('--update');

const allFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const cfg = loadBudgets();

if (wantsUpdate) {
  const next = {
    generated_at: new Date().toISOString(),
    budgets: (cfg.budgets || []).map((b) => {
      const files = selectFilesForBudget(allFiles, b);
      const { anyCount, asAnyCount } = computeCounts(files);
      return {
        ...b,
        maxAny: anyCount,
        maxAsAny: asAnyCount,
      };
    }),
  };
  fs.writeFileSync(BUDGET_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Updated ${normalize(path.relative(ROOT, BUDGET_PATH))}`);
  process.exit(0);
}

const failures = [];
for (const b of cfg.budgets || []) {
  const files = selectFilesForBudget(allFiles, b);
  const { anyCount, asAnyCount } = computeCounts(files);

  const maxAny = Number.isFinite(b.maxAny) ? b.maxAny : Infinity;
  const maxAsAny = Number.isFinite(b.maxAsAny) ? b.maxAsAny : Infinity;
  const ok = anyCount <= maxAny && asAnyCount <= maxAsAny;

  if (!ok) {
    failures.push({
      name: b.name,
      any: { current: anyCount, max: maxAny },
      asAny: { current: asAnyCount, max: maxAsAny },
    });
  }
}

if (failures.length) {
  const msg = failures
    .map((f) => {
      return [
        `- ${f.name}`,
        `  any: ${f.any.current} (max ${f.any.max})`,
        `  as any: ${f.asAny.current} (max ${f.asAny.max})`,
      ].join('\n');
    })
    .join('\n');

  // eslint-disable-next-line no-console
  console.error(
    [
      'RG-TS-01: orçamento de `any` estourou em áreas críticas.',
      'Isso evita que novos `any` entrem em domínios sensíveis (auth/billing/financeiro).',
      '',
      msg,
      '',
      `Se a mudança for intencional, atualize o baseline: node ${normalize(
        path.relative(ROOT, path.join(ROOT, 'scripts', 'check_any_budget.mjs'))
      )} --update`,
    ].join('\n')
  );
  process.exit(1);
}


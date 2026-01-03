import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function formatBytes(n) {
  if (!Number.isFinite(n)) return String(n);
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

const root = process.cwd();
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');
const budgetPath = path.join(root, 'scripts', 'bundle-budgets.json');

if (!fs.existsSync(distDir) || !fs.existsSync(assetsDir)) {
  console.error(`[BUDGET] dist não encontrado. Rode 'yarn build' antes.`);
  process.exit(2);
}

const budgets = fs.existsSync(budgetPath) ? readJson(budgetPath) : { max: {} };
const max = budgets.max || {};

const files = listFilesRecursive(assetsDir)
  .filter((f) => !f.endsWith('.map'))
  .filter((f) => f.endsWith('.js') || f.endsWith('.css'));

const rows = files.map((filePath) => {
  const ext = filePath.endsWith('.css') ? 'css' : 'js';
  const buf = fs.readFileSync(filePath);
  const gz = zlib.gzipSync(buf);
  return {
    file: path.relative(distDir, filePath).replaceAll(path.sep, '/'),
    ext,
    raw: buf.length,
    gzip: gz.length,
  };
});

const js = rows.filter((r) => r.ext === 'js');
const css = rows.filter((r) => r.ext === 'css');

const totalJsGzip = js.reduce((sum, r) => sum + r.gzip, 0);
const totalCssGzip = css.reduce((sum, r) => sum + r.gzip, 0);
const maxJs = js.reduce((best, r) => (r.gzip > best.gzip ? r : best), { file: '-', gzip: 0, raw: 0 });
const maxCss = css.reduce((best, r) => (r.gzip > best.gzip ? r : best), { file: '-', gzip: 0, raw: 0 });

const sorted = [...rows].sort((a, b) => b.gzip - a.gzip).slice(0, 20);

console.log('');
console.log('[BUDGET] Top 20 assets (gzip):');
for (const r of sorted) {
  console.log(`- ${r.file.padEnd(55)} raw ${formatBytes(r.raw).padStart(8)}  gzip ${formatBytes(r.gzip).padStart(8)}`);
}
console.log('');
console.log('[BUDGET] Summary:');
console.log(`- total JS gzip:  ${formatBytes(totalJsGzip)}`);
console.log(`- total CSS gzip: ${formatBytes(totalCssGzip)}`);
console.log(`- max JS gzip:    ${maxJs.file} (${formatBytes(maxJs.gzip)})`);
console.log(`- max CSS gzip:   ${maxCss.file} (${formatBytes(maxCss.gzip)})`);

const failures = [];
if (max.total_js_gzip_bytes && totalJsGzip > max.total_js_gzip_bytes) {
  failures.push(`total JS gzip excedeu: ${formatBytes(totalJsGzip)} > ${formatBytes(max.total_js_gzip_bytes)}`);
}
if (max.total_css_gzip_bytes && totalCssGzip > max.total_css_gzip_bytes) {
  failures.push(`total CSS gzip excedeu: ${formatBytes(totalCssGzip)} > ${formatBytes(max.total_css_gzip_bytes)}`);
}
if (max.max_js_file_gzip_bytes && maxJs.gzip > max.max_js_file_gzip_bytes) {
  failures.push(`maior arquivo JS gzip excedeu: ${maxJs.file} (${formatBytes(maxJs.gzip)} > ${formatBytes(max.max_js_file_gzip_bytes)})`);
}
if (max.max_css_file_gzip_bytes && maxCss.gzip > max.max_css_file_gzip_bytes) {
  failures.push(`maior arquivo CSS gzip excedeu: ${maxCss.file} (${formatBytes(maxCss.gzip)} > ${formatBytes(max.max_css_file_gzip_bytes)})`);
}

if (failures.length) {
  console.error('');
  console.error('[BUDGET] FAIL');
  for (const f of failures) console.error(`- ${f}`);
  console.error('');
  console.error('Ações sugeridas: split por rota (dynamic imports), reduzir libs pesadas, ou ajustar budgets conscientemente.');
  process.exit(1);
}

console.log('');
console.log('[BUDGET] OK');


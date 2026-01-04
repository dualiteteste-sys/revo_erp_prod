import { execFileSync } from 'node:child_process';

const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';
const EMPRESA_ID = process.env.RES08_EMPRESA_ID ?? '11111111-1111-1111-1111-111111111111';

function psql(sql) {
  return execFileSync(
    'psql',
    [
      DB_URL,
      '-v',
      'ON_ERROR_STOP=1',
      '-X',
      '-qAt',
      '-c',
      `set role service_role; set app.current_empresa_id = '${EMPRESA_ID}'; ${sql}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  ).trim();
}

function setup() {
  psql(`
    begin;

    insert into public.empresas (id, razao_social)
    values ('${EMPRESA_ID}', 'Empresa Perf Smoke')
    on conflict (id) do nothing;

    insert into public.pessoas (empresa_id, nome, tipo, tipo_pessoa, doc_unico, email)
    select '${EMPRESA_ID}', 'Cliente '||gs, 'cliente', 'fisica', lpad(gs::text, 11, '0'), 'cliente'||gs||'@example.com'
    from generate_series(1, 200) gs
    on conflict do nothing;

    insert into public.produtos (empresa_id, nome, sku, preco_venda, pode_vender)
    select '${EMPRESA_ID}', 'Produto '||gs, 'SKU-'||gs, (gs % 100) + 1, true
    from generate_series(1, 300) gs
    on conflict do nothing;

    -- Conexão ecommerce mínima para RPCs de mapeamento/health
    insert into public.ecommerces (empresa_id, provider, status, config)
    values ('${EMPRESA_ID}', 'meli', 'connected', '{}'::jsonb)
    on conflict (empresa_id, provider) do nothing;

    -- Seed vendas_pedidos com joins em pessoas
    with clientes as (
      select id from public.pessoas where empresa_id='${EMPRESA_ID}' and deleted_at is null order by id limit 200
    )
    insert into public.vendas_pedidos (empresa_id, cliente_id, data_emissao, status, total_produtos, total_geral)
    select
      '${EMPRESA_ID}',
      (select id from clientes offset (gs % 200) limit 1),
      (current_date - ((gs % 30))::int),
      case when gs % 10 = 0 then 'cancelado' when gs % 3 = 0 then 'aprovado' else 'orcamento' end,
      (gs % 100)::numeric,
      (gs % 100)::numeric
    from generate_series(1, 800) gs;

    commit;
  `);
}

function explainMs(selectSql) {
  const out = psql(`EXPLAIN (ANALYZE, FORMAT JSON) ${selectSql}`);
  const json = JSON.parse(out);
  const ms = Number(json?.[0]?.['Execution Time'] ?? NaN);
  if (!Number.isFinite(ms)) throw new Error(`Failed to parse execution time for: ${selectSql}`);
  return ms;
}

function timedMs(sql) {
  const out = psql(`
    with t0 as (select clock_timestamp() as t0),
    run as (${sql}),
    t1 as (select clock_timestamp() as t1)
    select (extract(epoch from (t1.t1 - t0.t0))*1000)::numeric(12,3) from t0, t1;
  `);
  const ms = Number(out);
  if (!Number.isFinite(ms)) throw new Error(`Failed to parse timing for: ${sql}`);
  return ms;
}

const budgets = [
  { name: 'rpc:list_partners_v2', kind: 'explain', budgetMs: 120, sql: `select * from public.list_partners_v2(null, null, 'active', 50, 0, 'nome', 'asc')` },
  { name: 'rpc:vendas_list_pedidos', kind: 'explain', budgetMs: 150, sql: `select * from public.vendas_list_pedidos(null, null, 50, 0)` },
  { name: 'rpc:vendas_count_pedidos_by_canal', kind: 'explain', budgetMs: 60, sql: `select public.vendas_count_pedidos_by_canal(null)` },
  { name: 'rpc:ecommerce_health_summary', kind: 'explain', budgetMs: 80, sql: `select * from public.ecommerce_health_summary(interval '24 hours')` },
  { name: 'rpc:ecommerce_product_mappings_list', kind: 'explain', budgetMs: 180, sql: `select * from public.ecommerce_product_mappings_list('meli', null, 50, 0)` },
  { name: 'flow:vendas_upsert_pedido', kind: 'timed', budgetMs: 250, sql: `select public.vendas_upsert_pedido(jsonb_build_object('cliente_id',(select id from public.pessoas where empresa_id='${EMPRESA_ID}' limit 1),'data_emissao',current_date::text,'status','orcamento','canal','pdv','itens',jsonb_build_array(jsonb_build_object('produto_id',(select id from public.produtos where empresa_id='${EMPRESA_ID}' limit 1),'quantidade',1,'preco_unitario',10))))` },
  { name: 'flow:ecommerce_product_mapping_upsert', kind: 'timed', budgetMs: 200, sql: `select public.ecommerce_product_mapping_upsert('meli', (select id from public.produtos where empresa_id='${EMPRESA_ID}' limit 1), 'MLB-TEST-1')` },
];

console.log('[RES-08] Setting up local data…');
setup();

const results = [];
let failed = 0;

for (const t of budgets) {
  const ms = t.kind === 'explain' ? explainMs(t.sql) : timedMs(t.sql);
  const ok = ms <= t.budgetMs;
  results.push({ name: t.name, ms, budgetMs: t.budgetMs, ok });
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${t.name}: ${ms.toFixed(1)}ms (budget ${t.budgetMs}ms)`);
}

if (failed) {
  console.error(`[RES-08] Failed ${failed}/${results.length} budgets.`);
  process.exit(1);
}

console.log(`[RES-08] All budgets passed (${results.length} checks).`);

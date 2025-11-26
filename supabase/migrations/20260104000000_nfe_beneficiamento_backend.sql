/*
  # Beneficiamento via NF-e – Base fiscal + estoque + RPCs

  ## Impact Summary
  - Segurança:
    - RLS por operação em todas as novas tabelas (empresa_id).
    - RPCs SECURITY DEFINER + search_path fixo.
    - Idempotência por chave NFe e “processed_at”.
  - Compatibilidade:
    - create table/index if not exists.
    - Sem dependência de módulos fiscais externos.
  - Reversibilidade:
    - Objetos isolados; podem ser dropados.
  - Performance:
    - Índices em (empresa_id, chave_acesso/status) e (empresa_id, produto_id, data).
*/

-- ================================
-- 0) Limpeza segura (se legados)
-- ================================
drop function if exists public.fiscal_nfe_import_register(jsonb);
drop function if exists public.beneficiamento_preview(uuid);
drop function if exists public.beneficiamento_process_from_import(uuid, jsonb);

-- ================================
-- 1) Tabelas: import fiscal
-- ================================
create table if not exists public.fiscal_nfe_imports (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.current_empresa_id(),
  origem_upload    text not null default 'xml' check (origem_upload in ('xml','danfe')),
  chave_acesso     text not null,                        -- 44 dígitos
  numero           text,                                 -- nNF
  serie            text,                                 -- serie
  emitente_cnpj    text,
  emitente_nome    text,
  destinat_cnpj    text,
  destinat_nome    text,
  data_emissao     timestamptz,
  total_produtos   numeric(18,2),
  total_nf         numeric(18,2),
  xml_raw          text,                                 -- XML original (opcional)
  status           text not null default 'registrado'    -- registrado|processado|erro
                   check (status in ('registrado','processado','erro')),
  processed_at     timestamptz,
  last_error       text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  constraint fiscal_nfe_imp_emp_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fiscal_nfe_imp_emp_chave_uk
    unique (empresa_id, chave_acesso)
);

create table if not exists public.fiscal_nfe_import_items (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.current_empresa_id(),
  import_id        uuid not null,
  -- campos principais extraídos do det/prod
  n_item           int,                 -- número do item
  cprod            text,                -- código do fornecedor
  ean              text,
  xprod            text,
  ncm              text,
  cfop             text,
  ucom             text,
  qcom             numeric(18,4),
  vuncom           numeric(18,6),
  vprod            numeric(18,2),
  -- trib (campos simples para referência futura)
  cst              text,
  utrib            text,
  qtrib            numeric(18,4),
  vuntrib          numeric(18,6),

  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  constraint fiscal_nfe_imp_item_emp_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fiscal_nfe_imp_item_imp_fkey
    foreign key (import_id) references public.fiscal_nfe_imports(id) on delete cascade
);

-- Índices
create index if not exists idx_nfe_imp_empresa_status
  on public.fiscal_nfe_imports (empresa_id, status);

create index if not exists idx_nfe_imp_empresa_chave
  on public.fiscal_nfe_imports (empresa_id, chave_acesso);

create index if not exists idx_nfe_imp_items_emp_imp
  on public.fiscal_nfe_import_items (empresa_id, import_id, n_item);


-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_fiscal_nfe_imports'
      and tgrelid = 'public.fiscal_nfe_imports'::regclass
  ) then
    create trigger handle_updated_at_fiscal_nfe_imports
      before update on public.fiscal_nfe_imports
      for each row
      execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_fiscal_nfe_import_items'
      and tgrelid = 'public.fiscal_nfe_import_items'::regclass
  ) then
    create trigger handle_updated_at_fiscal_nfe_import_items
      before update on public.fiscal_nfe_import_items
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.fiscal_nfe_imports       enable row level security;
alter table public.fiscal_nfe_import_items  enable row level security;

drop policy if exists "nfe_imp_select" on public.fiscal_nfe_imports;
drop policy if exists "nfe_imp_insert" on public.fiscal_nfe_imports;
drop policy if exists "nfe_imp_update" on public.fiscal_nfe_imports;
drop policy if exists "nfe_imp_delete" on public.fiscal_nfe_imports;

create policy "nfe_imp_select"
  on public.fiscal_nfe_imports for select
  using (empresa_id = public.current_empresa_id());
create policy "nfe_imp_insert"
  on public.fiscal_nfe_imports for insert
  with check (empresa_id = public.current_empresa_id());
create policy "nfe_imp_update"
  on public.fiscal_nfe_imports for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
create policy "nfe_imp_delete"
  on public.fiscal_nfe_imports for delete
  using (empresa_id = public.current_empresa_id());

drop policy if exists "nfe_imp_item_select" on public.fiscal_nfe_import_items;
drop policy if exists "nfe_imp_item_insert" on public.fiscal_nfe_import_items;
drop policy if exists "nfe_imp_item_update" on public.fiscal_nfe_import_items;
drop policy if exists "nfe_imp_item_delete" on public.fiscal_nfe_import_items;

create policy "nfe_imp_item_select"
  on public.fiscal_nfe_import_items for select
  using (empresa_id = public.current_empresa_id());
create policy "nfe_imp_item_insert"
  on public.fiscal_nfe_import_items for insert
  with check (empresa_id = public.current_empresa_id());
create policy "nfe_imp_item_update"
  on public.fiscal_nfe_import_items for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
create policy "nfe_imp_item_delete"
  on public.fiscal_nfe_import_items for delete
  using (empresa_id = public.current_empresa_id());

-- ================================
-- 2) Tabela: estoque_movimentos (mínimo p/ beneficiamento)
-- ================================
create table if not exists public.estoque_movimentos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.current_empresa_id(),
  produto_id       uuid not null,
  data_movimento   date not null default current_date,
  tipo_mov         text not null check (tipo_mov in ('entrada_beneficiamento')),
  quantidade       numeric(18,4) not null check (quantidade > 0),
  valor_unitario   numeric(18,6), -- opcional
  origem_tipo      text not null default 'nfe_beneficiamento',
  origem_id        uuid,          -- fiscal_nfe_imports.id
  observacoes      text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  constraint est_mov_emp_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint est_mov_prod_fkey
    foreign key (produto_id) references public.produtos(id),
  constraint est_mov_emp_origem_uk
    unique (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
);

create index if not exists idx_est_mov_emp_prod_data
  on public.estoque_movimentos (empresa_id, produto_id, data_movimento);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_estoque_movimentos'
      and tgrelid = 'public.estoque_movimentos'::regclass
  ) then
    create trigger handle_updated_at_estoque_movimentos
      before update on public.estoque_movimentos
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.estoque_movimentos enable row level security;

drop policy if exists "est_mov_select" on public.estoque_movimentos;
drop policy if exists "est_mov_insert" on public.estoque_movimentos;
drop policy if exists "est_mov_update" on public.estoque_movimentos;
drop policy if exists "est_mov_delete" on public.estoque_movimentos;

create policy "est_mov_select"
  on public.estoque_movimentos for select
  using (empresa_id = public.current_empresa_id());
create policy "est_mov_insert"
  on public.estoque_movimentos for insert
  with check (empresa_id = public.current_empresa_id());
create policy "est_mov_update"
  on public.estoque_movimentos for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
create policy "est_mov_delete"
  on public.estoque_movimentos for delete
  using (empresa_id = public.current_empresa_id());

-- ================================
-- 3) RPCs
-- ================================

-- 3.1) Registrar/atualizar import (idempotente por chave)
create or replace function public.fiscal_nfe_import_register(
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp     uuid := public.current_empresa_id();
  v_id      uuid;
  v_chave   text := trim(coalesce(p_payload->>'chave_acesso',''));
  v_items   jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_it      jsonb;
begin
  if v_chave = '' then
    raise exception 'chave_acesso é obrigatória.';
  end if;

  -- upsert do cabeçalho por (empresa, chave)
  insert into public.fiscal_nfe_imports (
    empresa_id, origem_upload, chave_acesso,
    numero, serie, emitente_cnpj, emitente_nome,
    destinat_cnpj, destinat_nome, data_emissao,
    total_produtos, total_nf, xml_raw, status, last_error
  ) values (
    v_emp,
    coalesce(p_payload->>'origem_upload','xml'),
    v_chave,
    p_payload->>'numero',
    p_payload->>'serie',
    p_payload->>'emitente_cnpj',
    p_payload->>'emitente_nome',
    p_payload->>'destinat_cnpj',
    p_payload->>'destinat_nome',
    (p_payload->>'data_emissao')::timestamptz,
    (p_payload->>'total_produtos')::numeric,
    (p_payload->>'total_nf')::numeric,
    p_payload->>'xml_raw',
    'registrado',
    null
  )
  on conflict (empresa_id, chave_acesso) do update set
    origem_upload  = excluded.origem_upload,
    numero         = excluded.numero,
    serie          = excluded.serie,
    emitente_cnpj  = excluded.emitente_cnpj,
    emitente_nome  = excluded.emitente_nome,
    destinat_cnpj  = excluded.destinat_cnpj,
    destinat_nome  = excluded.destinat_nome,
    data_emissao   = excluded.data_emissao,
    total_produtos = excluded.total_produtos,
    total_nf       = excluded.total_nf,
    xml_raw        = excluded.xml_raw,
    status         = 'registrado',
    last_error     = null,
    updated_at     = now()
  returning id into v_id;

  -- Recarrega itens (estratégia simples: limpa e insere)
  delete from public.fiscal_nfe_import_items
  where empresa_id = v_emp
    and import_id  = v_id;

  for v_it in select * from jsonb_array_elements(v_items)
  loop
    insert into public.fiscal_nfe_import_items (
      empresa_id, import_id, n_item, cprod, ean, xprod, ncm, cfop,
      ucom, qcom, vuncom, vprod, cst, utrib, qtrib, vuntrib
    ) values (
      v_emp, v_id,
      (v_it->>'n_item')::int,
      v_it->>'cprod',
      v_it->>'ean',
      v_it->>'xprod',
      v_it->>'ncm',
      v_it->>'cfop',
      v_it->>'ucom',
      (v_it->>'qcom')::numeric,
      (v_it->>'vuncom')::numeric,
      (v_it->>'vprod')::numeric,
      v_it->>'cst',
      v_it->>'utrib',
      (v_it->>'qtrib')::numeric,
      (v_it->>'vuntrib')::numeric
    );
  end loop;

  perform pg_notify('app_log', '[RPC] fiscal_nfe_import_register: '||v_id);
  return v_id;
end;
$$;

revoke all on function public.fiscal_nfe_import_register from public;
grant execute on function public.fiscal_nfe_import_register to authenticated, service_role;

-- 3.2) Preview (tenta casar itens com produtos por codigo ou ean)
create or replace function public.beneficiamento_preview(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_head  jsonb;
  v_itens jsonb;
begin
  select to_jsonb(i.*) - 'xml_raw' into v_head
  from public.fiscal_nfe_imports i
  where i.id = p_import_id
    and i.empresa_id = v_emp;

  if v_head is null then
    raise exception 'Import não encontrado.';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'item_id', fi.id,
             'n_item', fi.n_item,
             'cprod',  fi.cprod,
             'ean',    fi.ean,
             'xprod',  fi.xprod,
             'qcom',   fi.qcom,
             'vuncom', fi.vuncom,
             'vprod',  fi.vprod,
             'match_produto_id',
             (
               select p.id
               from public.produtos p
               where (p.sku = fi.cprod and fi.cprod is not null and fi.cprod <> '')
                  or (p.ean = fi.ean and fi.ean is not null and fi.ean <> '')
               limit 1
             ),
             'match_strategy',
             case
               when exists (select 1 from public.produtos p where p.sku = fi.cprod and fi.cprod is not null and fi.cprod <> '')
                 then 'sku'
               when exists (select 1 from public.produtos p where p.ean = fi.ean and fi.ean is not null and fi.ean <> '')
                 then 'ean'
               else 'none'
             end
           )
         ), '[]'::jsonb)
  into v_itens
  from public.fiscal_nfe_import_items fi
  where fi.import_id = p_import_id
    and fi.empresa_id = v_emp
  order by fi.n_item;

  return jsonb_build_object('import', v_head, 'itens', v_itens);
end;
$$;

revoke all on function public.beneficiamento_preview from public;
grant execute on function public.beneficiamento_preview to authenticated, service_role;

-- 3.3) Processar import → gerar entradas de beneficiamento (idempotente)
create or replace function public.beneficiamento_process_from_import(
  p_import_id uuid,
  p_matches   jsonb default '[]'::jsonb  -- [{item_id, produto_id}] para resolver pendências
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_stat  text;
  v_row   record;
  v_prod  uuid;
begin
  select status into v_stat
  from public.fiscal_nfe_imports
  where id = p_import_id
    and empresa_id = v_emp
  for update;

  if v_stat is null then
    raise exception 'Import não encontrado.';
  end if;

  -- idempotência: se já processado, apenas retorna
  if v_stat = 'processado' then
    return;
  end if;

  for v_row in
    select fi.*
    from public.fiscal_nfe_import_items fi
    where fi.import_id = p_import_id
      and fi.empresa_id = v_emp
    order by fi.n_item
  loop
    -- resolve produto:
    select p.id into v_prod
    from public.produtos p
    where (p.sku = v_row.cprod and v_row.cprod is not null and v_row.cprod <> '')
       or (p.ean    = v_row.ean   and v_row.ean   is not null and v_row.ean   <> '')
    limit 1;

    if v_prod is null and p_matches is not null then
      select (m->>'produto_id')::uuid into v_prod
      from jsonb_array_elements(p_matches) m
      where (m->>'item_id')::uuid = v_row.id;
    end if;

    if v_prod is null then
      raise exception 'Item % sem mapeamento de produto. Utilize preview e envie p_matches.', v_row.n_item;
    end if;

    -- insere movimento (ON CONFLICT pela unique de origem evita duplicação)
    insert into public.estoque_movimentos (
      empresa_id, produto_id, data_movimento,
      tipo_mov, quantidade, valor_unitario,
      origem_tipo, origem_id, observacoes
    ) values (
      v_emp, v_prod, current_date,
      'entrada_beneficiamento', v_row.qcom, v_row.vuncom,
      'nfe_beneficiamento', p_import_id,
      'NF-e entrada para beneficiamento - chave='||(
        select chave_acesso from public.fiscal_nfe_imports where id = p_import_id
      )
    )
    on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov) do update set
      quantidade     = excluded.quantidade,
      valor_unitario = excluded.valor_unitario,
      updated_at     = now();
  end loop;

  update public.fiscal_nfe_imports
  set status = 'processado', processed_at = now(), last_error = null
  where id = p_import_id
    and empresa_id = v_emp;

  perform pg_notify('app_log', '[RPC] beneficiamento_process_from_import: '||p_import_id);
exception
  when others then
    update public.fiscal_nfe_imports
    set status = 'erro', last_error = sqlerrm, updated_at = now()
    where id = p_import_id
      and empresa_id = v_emp;
    raise;
end;
$$;

revoke all on function public.beneficiamento_process_from_import from public;
grant execute on function public.beneficiamento_process_from_import to authenticated, service_role;

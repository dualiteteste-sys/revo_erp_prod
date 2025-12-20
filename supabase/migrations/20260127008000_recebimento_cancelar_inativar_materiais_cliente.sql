/*
  # Recebimento: cancelar também reverte Materiais de Clientes

  Problema:
  - Ao finalizar recebimentos classificados como `material_cliente`, o sistema sincroniza/reativa
    registros em `public.industria_materiais_cliente`.
  - Ao cancelar o recebimento, os materiais permaneciam ativos no módulo "Materiais de Clientes".

  Solução (comportamento moderno e confiável):
  - Registrar quais `industria_materiais_cliente` foram afetados por cada recebimento, com o estado anterior.
  - Ao cancelar, reverter/inativar esses materiais conforme o estado anterior.
  - Ao reimportar/reabrir recebimento cancelado, limpar o vínculo anterior para evitar reversões incorretas.
*/

create schema if not exists public;

-- ---------------------------------------------------------------------
-- 1) Tabela de vínculo (recebimento -> materiais de cliente afetados)
-- ---------------------------------------------------------------------
create table if not exists public.recebimento_materiais_cliente_links (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  recebimento_id uuid not null,
  material_cliente_id uuid not null,
  inserted boolean not null default false,
  prev_ativo boolean,
  created_at timestamptz default now()
);

do $$
begin
  if to_regclass('public.recebimentos') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'recebimento_materiais_cliente_links_recebimento_fkey'
        and conrelid = 'public.recebimento_materiais_cliente_links'::regclass
    ) then
      alter table public.recebimento_materiais_cliente_links
        add constraint recebimento_materiais_cliente_links_recebimento_fkey
        foreign key (recebimento_id) references public.recebimentos(id) on delete cascade;
    end if;
  end if;

  if to_regclass('public.industria_materiais_cliente') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'recebimento_materiais_cliente_links_material_fkey'
        and conrelid = 'public.recebimento_materiais_cliente_links'::regclass
    ) then
      alter table public.recebimento_materiais_cliente_links
        add constraint recebimento_materiais_cliente_links_material_fkey
        foreign key (material_cliente_id) references public.industria_materiais_cliente(id) on delete cascade;
    end if;
  end if;
exception when others then
  -- best-effort: evita bloquear em ambientes com drift
  null;
end $$;

create unique index if not exists ux_recebimento_materiais_cliente_links_key
  on public.recebimento_materiais_cliente_links (empresa_id, recebimento_id, material_cliente_id);

create index if not exists idx_receb_mcl_recebimento
  on public.recebimento_materiais_cliente_links (empresa_id, recebimento_id);

alter table public.recebimento_materiais_cliente_links enable row level security;
-- Sem policies: não expõe a tabela diretamente para authenticated.

-- ---------------------------------------------------------------------
-- 2) Sync: escrever vínculos + capturar estado anterior
-- ---------------------------------------------------------------------
create or replace function public.recebimento_sync_materiais_cliente(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_import_id uuid;
  v_cliente_id uuid;
  v_chave text;
  v_numero text;
  v_serie text;
  v_upserted int := 0;
  v_linked int := 0;
begin
  if to_regclass('public.industria_materiais_cliente') is null then
    return jsonb_build_object('status','skipped','reason','industria_materiais_cliente_missing');
  end if;

  select
    r.fiscal_nfe_import_id,
    r.cliente_id,
    n.chave_acesso,
    n.numero,
    n.serie
  into
    v_import_id,
    v_cliente_id,
    v_chave,
    v_numero,
    v_serie
  from public.recebimentos r
  join public.fiscal_nfe_imports n on n.id = r.fiscal_nfe_import_id
  where r.id = p_recebimento_id
    and r.empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_cliente_id is null then
    return jsonb_build_object('status','skipped','reason','cliente_not_set');
  end if;

  with src as (
    select distinct
      v_emp::uuid as empresa_id,
      v_cliente_id::uuid as cliente_id,
      ri.produto_id,
      left(
        coalesce(
          nullif(fi.cprod,''),
          nullif(fi.ean,''),
          'IMPORT-'||left(v_import_id::text,8)||'-'||coalesce(fi.n_item::text,'0')
        ),
        120
      ) as codigo_cliente,
      nullif(fi.xprod,'') as nome_cliente,
      nullif(fi.ucom,'') as unidade,
      left(
        'Classificado como Material do Cliente a partir da NF-e '||
        coalesce(nullif(v_numero,''),'?')||'/'||coalesce(nullif(v_serie,''),'?')||
        ' chave='||coalesce(nullif(v_chave,''),'?'),
        250
      ) as observacoes
    from public.recebimento_itens ri
    join public.fiscal_nfe_import_items fi
      on fi.id = ri.fiscal_nfe_item_id
     and fi.empresa_id = v_emp
    where ri.recebimento_id = p_recebimento_id
      and ri.empresa_id = v_emp
      and ri.produto_id is not null
  ),
  prev as (
    select
      s.*,
      mc.ativo as prev_ativo
    from src s
    left join public.industria_materiais_cliente mc
      on mc.empresa_id = s.empresa_id
     and mc.cliente_id = s.cliente_id
     and mc.produto_id = s.produto_id
     and mc.codigo_cliente is not distinct from s.codigo_cliente
  ),
  upserted as (
    insert into public.industria_materiais_cliente (
      empresa_id,
      cliente_id,
      produto_id,
      codigo_cliente,
      nome_cliente,
      unidade,
      ativo,
      observacoes
    )
    select
      empresa_id,
      cliente_id,
      produto_id,
      codigo_cliente,
      nome_cliente,
      unidade,
      true,
      observacoes
    from prev
    on conflict (empresa_id, cliente_id, produto_id, codigo_cliente)
    do update set
      nome_cliente = coalesce(excluded.nome_cliente, public.industria_materiais_cliente.nome_cliente),
      unidade      = coalesce(excluded.unidade, public.industria_materiais_cliente.unidade),
      ativo        = true,
      updated_at   = now()
    returning
      id as material_cliente_id,
      empresa_id,
      cliente_id,
      produto_id,
      codigo_cliente,
      (xmax = 0) as inserted
  ),
  links as (
    insert into public.recebimento_materiais_cliente_links (
      empresa_id,
      recebimento_id,
      material_cliente_id,
      inserted,
      prev_ativo
    )
    select
      u.empresa_id,
      p_recebimento_id,
      u.material_cliente_id,
      u.inserted,
      p.prev_ativo
    from upserted u
    left join prev p
      on p.empresa_id = u.empresa_id
     and p.cliente_id = u.cliente_id
     and p.produto_id = u.produto_id
     and p.codigo_cliente is not distinct from u.codigo_cliente
    where to_regclass('public.recebimento_materiais_cliente_links') is not null
    on conflict (empresa_id, recebimento_id, material_cliente_id) do nothing
    returning 1
  )
  select
    (select count(*) from upserted),
    (select count(*) from links)
  into v_upserted, v_linked;

  return jsonb_build_object(
    'status','ok',
    'cliente_id',v_cliente_id,
    'upserted',coalesce(v_upserted,0),
    'linked',coalesce(v_linked,0)
  );
end;
$$;

revoke all on function public.recebimento_sync_materiais_cliente(uuid) from public;
grant execute on function public.recebimento_sync_materiais_cliente(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) Cancelamento: reverter materiais sincronizados pelo recebimento
-- ---------------------------------------------------------------------
create or replace function public.recebimento_cancelar(
  p_recebimento_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_status text;
  v_classificacao text;
  v_import_id uuid;
  v_item record;
  v_mov record;
  v_lote text;
  v_qtd numeric;
  v_rows int := 0;
  v_materiais_revertidos int := 0;
  v_chave text;
  v_links int := 0;
begin
  select status, classificacao, fiscal_nfe_import_id
    into v_status, v_classificacao, v_import_id
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  for update;

  if v_status is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_status = 'cancelado' then
    return jsonb_build_object('status','already_cancelled');
  end if;

  if v_status <> 'concluido' then
    raise exception 'Somente recebimentos concluídos podem ser cancelados (status atual: %).', v_status;
  end if;

  if v_classificacao is null then
    -- Legado/ambiente antigo: assume estoque próprio para permitir estorno.
    v_classificacao := 'estoque_proprio';
  end if;

  -- 1) ESTOQUE PRÓPRIO: estorno baseado nos itens do recebimento
  if v_classificacao = 'estoque_proprio' then
    for v_item in
      select
        ri.produto_id,
        coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) as qtd,
        fi.vuncom as valor_unitario,
        fi.xprod as xprod
      from public.recebimento_itens ri
      join public.fiscal_nfe_import_items fi
        on fi.id = ri.fiscal_nfe_item_id
       and fi.empresa_id = v_emp
      where ri.recebimento_id = p_recebimento_id
        and ri.empresa_id = v_emp
        and ri.produto_id is not null
    loop
      v_qtd := coalesce(v_item.qtd, 0);
      if v_qtd <= 0 then
        continue;
      end if;

      v_lote := 'SEM_LOTE';

      -- Ajuste de saldo por lote (best-effort)
      begin
        update public.estoque_lotes
        set saldo = greatest(coalesce(saldo,0) - v_qtd, 0),
            updated_at = now()
        where empresa_id = v_emp
          and produto_id = v_item.produto_id
          and lote = v_lote;
      exception when undefined_table then
        null;
      end;

      -- Movimento de estorno (idempotente quando existir unique de origem)
      begin
        insert into public.estoque_movimentos (
          empresa_id, produto_id, data_movimento,
          tipo, tipo_mov, quantidade, valor_unitario,
          origem_tipo, origem_id, lote, observacoes
        ) values (
          v_emp, v_item.produto_id, current_date,
          'saida', 'estorno_nfe', v_qtd, v_item.valor_unitario,
          'recebimento_estorno', p_recebimento_id, v_lote,
          left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
        )
        on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
        do update set
          quantidade = excluded.quantidade,
          valor_unitario = excluded.valor_unitario,
          updated_at = now();
      exception
        when undefined_column then
          insert into public.estoque_movimentos (
            empresa_id, produto_id, data_movimento,
            tipo, tipo_mov, quantidade,
            origem_tipo, origem_id, lote, observacoes
          ) values (
            v_emp, v_item.produto_id, current_date,
            'saida', 'estorno_nfe', v_qtd,
            'recebimento_estorno', p_recebimento_id, v_lote,
            left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
          );
        when others then
          -- Sem unique p/ ON CONFLICT: evita duplicar se já existir
          if not exists (
            select 1 from public.estoque_movimentos m
            where m.empresa_id = v_emp
              and m.origem_tipo = 'recebimento_estorno'
              and m.origem_id = p_recebimento_id
              and m.produto_id = v_item.produto_id
              and m.tipo_mov = 'estorno_nfe'
          ) then
            begin
              insert into public.estoque_movimentos (
                empresa_id, produto_id, data_movimento,
                tipo, tipo_mov, quantidade, valor_unitario,
                origem_tipo, origem_id, lote, observacoes
              ) values (
                v_emp, v_item.produto_id, current_date,
                'saida', 'estorno_nfe', v_qtd, v_item.valor_unitario,
                'recebimento_estorno', p_recebimento_id, v_lote,
                left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
              );
            exception when undefined_column then
              insert into public.estoque_movimentos (
                empresa_id, produto_id, data_movimento,
                tipo, tipo_mov, quantidade,
                origem_tipo, origem_id, lote, observacoes
              ) values (
                v_emp, v_item.produto_id, current_date,
                'saida', 'estorno_nfe', v_qtd,
                'recebimento_estorno', p_recebimento_id, v_lote,
                left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
              );
            end;
          end if;
      end;

      v_rows := v_rows + 1;
    end loop;

  -- 2) MATERIAL DO CLIENTE: estorno best-effort baseado em movimentos de beneficiamento
  elsif v_classificacao = 'material_cliente' then
    for v_mov in
      select produto_id, quantidade, valor_unitario, coalesce(lote,'SEM_LOTE') as lote
      from public.estoque_movimentos
      where empresa_id = v_emp
        and origem_tipo = 'nfe_beneficiamento'
        and origem_id = v_import_id
        and tipo_mov = 'entrada_beneficiamento'
    loop
      v_qtd := coalesce(v_mov.quantidade, 0);
      if v_qtd <= 0 then
        continue;
      end if;

      v_lote := coalesce(v_mov.lote, 'SEM_LOTE');

      begin
        update public.estoque_lotes
        set saldo = greatest(coalesce(saldo,0) - v_qtd, 0),
            updated_at = now()
        where empresa_id = v_emp
          and produto_id = v_mov.produto_id
          and lote = v_lote;
      exception when undefined_table then
        null;
      end;

      begin
        insert into public.estoque_movimentos (
          empresa_id, produto_id, data_movimento,
          tipo, tipo_mov, quantidade, valor_unitario,
          origem_tipo, origem_id, lote, observacoes
        ) values (
          v_emp, v_mov.produto_id, current_date,
          'saida', 'estorno_beneficiamento', v_qtd, v_mov.valor_unitario,
          'nfe_beneficiamento_estorno', v_import_id, v_lote,
          left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
        )
        on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
        do update set
          quantidade = excluded.quantidade,
          valor_unitario = excluded.valor_unitario,
          updated_at = now();
      exception
        when undefined_column then
          insert into public.estoque_movimentos (
            empresa_id, produto_id, data_movimento,
            tipo, tipo_mov, quantidade,
            origem_tipo, origem_id, lote, observacoes
          ) values (
            v_emp, v_mov.produto_id, current_date,
            'saida', 'estorno_beneficiamento', v_qtd,
            'nfe_beneficiamento_estorno', v_import_id, v_lote,
            left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
          );
        when others then
          if not exists (
            select 1 from public.estoque_movimentos m
            where m.empresa_id = v_emp
              and m.origem_tipo = 'nfe_beneficiamento_estorno'
              and m.origem_id = v_import_id
              and m.produto_id = v_mov.produto_id
              and m.tipo_mov = 'estorno_beneficiamento'
          ) then
            begin
              insert into public.estoque_movimentos (
                empresa_id, produto_id, data_movimento,
                tipo, tipo_mov, quantidade, valor_unitario,
                origem_tipo, origem_id, lote, observacoes
              ) values (
                v_emp, v_mov.produto_id, current_date,
                'saida', 'estorno_beneficiamento', v_qtd, v_mov.valor_unitario,
                'nfe_beneficiamento_estorno', v_import_id, v_lote,
                left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
              );
            exception when undefined_column then
              insert into public.estoque_movimentos (
                empresa_id, produto_id, data_movimento,
                tipo, tipo_mov, quantidade,
                origem_tipo, origem_id, lote, observacoes
              ) values (
                v_emp, v_mov.produto_id, current_date,
                'saida', 'estorno_beneficiamento', v_qtd,
                'nfe_beneficiamento_estorno', v_import_id, v_lote,
                left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
              );
            end;
          end if;
      end;

      v_rows := v_rows + 1;
    end loop;
  else
    raise exception 'Classificação inválida para estorno: %', v_classificacao;
  end if;

  -- 3) Reverter Materiais de Clientes (se este recebimento sincronizou)
  if v_classificacao = 'material_cliente'
     and to_regclass('public.industria_materiais_cliente') is not null
     and to_regclass('public.recebimento_materiais_cliente_links') is not null
  then
    select count(*) into v_links
    from public.recebimento_materiais_cliente_links l
    where l.empresa_id = v_emp
      and l.recebimento_id = p_recebimento_id;

    if coalesce(v_links,0) > 0 then
      update public.industria_materiais_cliente mc
      set ativo = case
                    when l.inserted then false
                    else coalesce(l.prev_ativo, true)
                  end,
          updated_at = now()
      from public.recebimento_materiais_cliente_links l
      where l.empresa_id = v_emp
        and l.recebimento_id = p_recebimento_id
        and l.material_cliente_id = mc.id
        and mc.empresa_id = v_emp;

      get diagnostics v_materiais_revertidos = row_count;
    else
      -- fallback para recebimentos antigos (antes do vínculo): tenta pela chave da NF-e no observacoes
      begin
        select n.chave_acesso into v_chave
        from public.fiscal_nfe_imports n
        where n.id = v_import_id
        limit 1;
      exception when undefined_table then
        v_chave := null;
      end;

      if nullif(trim(coalesce(v_chave,'')), '') is not null then
        update public.industria_materiais_cliente
        set ativo = false,
            updated_at = now()
        where empresa_id = v_emp
          and ativo is true
          and coalesce(observacoes,'') ilike '%'||'chave='||v_chave||'%';

        get diagnostics v_materiais_revertidos = row_count;
      end if;
    end if;
  end if;

  update public.recebimentos
  set status = 'cancelado',
      cancelado_at = now(),
      cancelado_por = auth.uid(),
      cancelado_motivo = nullif(trim(p_motivo), ''),
      updated_at = now()
  where id = p_recebimento_id
    and empresa_id = v_emp;

  return jsonb_build_object(
    'status','ok',
    'movimentos_estorno',v_rows,
    'classificacao',v_classificacao,
    'materiais_cliente_revertidos',coalesce(v_materiais_revertidos,0)
  );
end;
$$;

revoke all on function public.recebimento_cancelar(uuid, text) from public;
grant execute on function public.recebimento_cancelar(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Reimportação: ao reabrir recebimento cancelado, limpar vínculos antigos
-- ---------------------------------------------------------------------
create or replace function public.create_recebimento_from_xml(
  p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_recebimento_id uuid;
  v_recebimento_status text;
  v_item record;
  v_prod_id uuid;
begin
  select id, status
    into v_recebimento_id, v_recebimento_status
  from public.recebimentos
  where fiscal_nfe_import_id = p_import_id
    and empresa_id = v_emp;

  if v_recebimento_id is not null then
    if v_recebimento_status is distinct from 'cancelado' then
      return jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
    end if;

    -- Recebimento cancelado: reabrir e recriar itens/conferências
    delete from public.recebimento_conferencias rc
    where rc.empresa_id = v_emp
      and rc.recebimento_item_id in (
        select ri.id
        from public.recebimento_itens ri
        where ri.empresa_id = v_emp
          and ri.recebimento_id = v_recebimento_id
      );

    delete from public.recebimento_itens ri
    where ri.empresa_id = v_emp
      and ri.recebimento_id = v_recebimento_id;

    -- Limpa vínculo de materiais para o recebimento reaberto (evita reversões incorretas)
    if to_regclass('public.recebimento_materiais_cliente_links') is not null then
      delete from public.recebimento_materiais_cliente_links l
      where l.empresa_id = v_emp
        and l.recebimento_id = v_recebimento_id;
    end if;

    update public.recebimentos
    set status = 'pendente',
        data_recebimento = now(),
        responsavel_id = null,
        cancelado_at = null,
        cancelado_por = null,
        cancelado_motivo = null,
        updated_at = now()
    where id = v_recebimento_id
      and empresa_id = v_emp;

  else
    insert into public.recebimentos (empresa_id, fiscal_nfe_import_id, status)
    values (v_emp, p_import_id, 'pendente')
    returning id into v_recebimento_id;
  end if;

  for v_item in
    select * from public.fiscal_nfe_import_items
    where import_id = p_import_id and empresa_id = v_emp
  loop
    select id into v_prod_id
    from public.produtos p
    where p.empresa_id = v_emp
      and (
        (p.sku = v_item.cprod and coalesce(v_item.cprod,'') <> '') or
        (p.gtin = v_item.ean and coalesce(v_item.ean,'') <> '')
      )
    limit 1;

    insert into public.recebimento_itens (
      empresa_id, recebimento_id, fiscal_nfe_item_id, produto_id, quantidade_xml
    ) values (
      v_emp, v_recebimento_id, v_item.id, v_prod_id, v_item.qcom
    );
  end loop;

  if v_recebimento_status = 'cancelado' then
    return jsonb_build_object('id', v_recebimento_id, 'status', 'reopened');
  end if;

  return jsonb_build_object('id', v_recebimento_id, 'status', 'created');
end;
$$;

revoke all on function public.create_recebimento_from_xml(uuid) from public;
grant execute on function public.create_recebimento_from_xml(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';


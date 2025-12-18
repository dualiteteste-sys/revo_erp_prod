/*
  # Recebimento (XML) neutro + classificação antes de dar entrada no estoque

  Objetivo (UX moderna):
  - Importar XML em Suprimentos sem perguntar “para que é”.
  - Antes de concluir/lançar no estoque, o recebimento precisa ser classificado como:
      - 'estoque_proprio' (comércio/compra) ou
      - 'material_cliente' (terceiros/beneficiamento).
  - A classificação pode ser feita na Conferência (Suprimentos) ou em Indústria (Materiais de Clientes).

  Regras:
  - `finalizar_recebimento` não lança no estoque se `classificacao` estiver NULL.
  - Para 'material_cliente', exige `cliente_id`.
  - Para 'estoque_proprio', lança entrada genérica no estoque (`tipo_mov='entrada_nfe'`).
*/

create schema if not exists public;

-- 0) Schema: recebimentos.classificacao + recebimentos.cliente_id
alter table public.recebimentos
  add column if not exists classificacao text,
  add column if not exists cliente_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recebimentos_cliente_fkey'
      and conrelid = 'public.recebimentos'::regclass
  ) then
    if to_regclass('public.pessoas') is not null then
      alter table public.recebimentos
        add constraint recebimentos_cliente_fkey
        foreign key (cliente_id) references public.pessoas(id);
    end if;
  end if;
exception when others then
  raise notice 'Não foi possível criar FK recebimentos_cliente_fkey: %', SQLERRM;
end $$;

create index if not exists idx_recebimentos_classificacao
  on public.recebimentos (empresa_id, classificacao);

create index if not exists idx_recebimentos_cliente
  on public.recebimentos (empresa_id, cliente_id);

-- 1) Relax: remove CHECK restritivo em estoque_movimentos.tipo_mov (se existir)
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.estoque_movimentos'::regclass
      and c.contype = 'c'
      and a.attname = 'tipo_mov'
  loop
    -- Se existir um check em tipo_mov, removemos para permitir novos tipos (ex: entrada_nfe).
    execute format('alter table public.estoque_movimentos drop constraint %I', r.conname);
  end loop;
exception when undefined_table then
  null;
end $$;

-- 2) RPC: definir classificação do recebimento
create or replace function public.recebimento_set_classificacao(
  p_recebimento_id uuid,
  p_classificacao text,
  p_cliente_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_status text;
begin
  if p_classificacao is null or p_classificacao not in ('estoque_proprio','material_cliente') then
    raise exception 'p_classificacao inválida. Use estoque_proprio ou material_cliente.';
  end if;

  select status into v_status
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  limit 1;

  if v_status is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_status = 'concluido' then
    raise exception 'Recebimento já concluído.';
  end if;

  if p_classificacao = 'material_cliente' and p_cliente_id is null then
    raise exception 'cliente_id é obrigatório para material_cliente.';
  end if;

  update public.recebimentos
  set classificacao = p_classificacao,
      cliente_id = case when p_classificacao = 'material_cliente' then p_cliente_id else null end,
      updated_at = now()
  where id = p_recebimento_id
    and empresa_id = v_emp;

  return jsonb_build_object('status','ok','classificacao',p_classificacao,'cliente_id',p_cliente_id);
end;
$$;

revoke all on function public.recebimento_set_classificacao(uuid, text, uuid) from public;
grant execute on function public.recebimento_set_classificacao(uuid, text, uuid) to authenticated, service_role;

-- 3) RPC: entrada genérica no estoque (estoque próprio) a partir do recebimento
create or replace function public.estoque_process_from_recebimento(
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
  v_row record;
  v_lote text;
  v_rows int := 0;
begin
  select fiscal_nfe_import_id into v_import_id
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  for v_row in
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
    if coalesce(v_row.qtd, 0) <= 0 then
      continue;
    end if;

    v_lote := 'SEM_LOTE';

    -- Upsert de saldo por lote (best-effort)
    begin
      insert into public.estoque_lotes (empresa_id, produto_id, lote, saldo)
      values (v_emp, v_row.produto_id, v_lote, v_row.qtd)
      on conflict (empresa_id, produto_id, lote)
      do update set saldo = public.estoque_lotes.saldo + excluded.saldo, updated_at = now();
    exception when others then
      null;
    end;

    -- Movimento idempotente por origem
    begin
      insert into public.estoque_movimentos (
        empresa_id, produto_id, data_movimento,
        tipo, tipo_mov, quantidade, valor_unitario,
        origem_tipo, origem_id, lote, observacoes
      ) values (
        v_emp, v_row.produto_id, current_date,
        'entrada', 'entrada_nfe', v_row.qtd, v_row.valor_unitario,
        'recebimento', p_recebimento_id, v_lote,
        left('Entrada via NF-e (Recebimento) - '||coalesce(nullif(v_row.xprod,''),'item'), 250)
      )
      on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
      do update set
        quantidade = excluded.quantidade,
        valor_unitario = excluded.valor_unitario,
        updated_at = now();
    exception when others then
      -- Se não existir constraint para o ON CONFLICT, faz insert simples
      insert into public.estoque_movimentos (
        empresa_id, produto_id, data_movimento,
        tipo, tipo_mov, quantidade, valor_unitario,
        origem_tipo, origem_id, lote, observacoes
      ) values (
        v_emp, v_row.produto_id, current_date,
        'entrada', 'entrada_nfe', v_row.qtd, v_row.valor_unitario,
        'recebimento', p_recebimento_id, v_lote,
        left('Entrada via NF-e (Recebimento) - '||coalesce(nullif(v_row.xprod,''),'item'), 250)
      );
    end;

    v_rows := v_rows + 1;
  end loop;

  return jsonb_build_object('status','ok','movimentos',v_rows);
end;
$$;

revoke all on function public.estoque_process_from_recebimento(uuid) from public;
grant execute on function public.estoque_process_from_recebimento(uuid) to authenticated, service_role;

-- 4) Ajuste: sync de Materiais de Clientes usa recebimentos.cliente_id (não “adivinha” pelo emitente)
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
  select distinct
    v_emp,
    v_cliente_id,
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
    true,
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
  on conflict (empresa_id, cliente_id, produto_id, codigo_cliente)
  do update set
    nome_cliente = coalesce(excluded.nome_cliente, public.industria_materiais_cliente.nome_cliente),
    unidade      = coalesce(excluded.unidade, public.industria_materiais_cliente.unidade),
    ativo        = true,
    updated_at   = now();

  get diagnostics v_upserted = row_count;

  return jsonb_build_object('status','ok','cliente_id',v_cliente_id,'upserted',v_upserted);
end;
$$;

revoke all on function public.recebimento_sync_materiais_cliente(uuid) from public;
grant execute on function public.recebimento_sync_materiais_cliente(uuid) to authenticated, service_role;

-- 5) finalizar_recebimento agora exige classificação antes de lançar no estoque
create or replace function public.finalizar_recebimento(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_item record;
  v_divergente boolean := false;
  v_import_id uuid;
  v_matches jsonb;
  v_classificacao text;
  v_cliente_id uuid;
  v_sync jsonb;
  v_sync_count int := 0;
  v_mov jsonb;
begin
  -- Divergência
  for v_item in
    select * from public.recebimento_itens
    where recebimento_id = p_recebimento_id and empresa_id = v_emp
  loop
    if v_item.quantidade_conferida <> v_item.quantidade_xml then
      v_divergente := true;
    end if;
  end loop;

  if v_divergente then
    update public.recebimentos set status = 'divergente', updated_at = now()
    where id = p_recebimento_id;
    return jsonb_build_object('status', 'divergente', 'message', 'Existem divergências na conferência.');
  end if;

  -- Precisa ter produtos vinculados (senão não consegue lançar estoque)
  if exists (
    select 1 from public.recebimento_itens
    where recebimento_id = p_recebimento_id
      and empresa_id = v_emp
      and produto_id is null
  ) then
    return jsonb_build_object('status','pendente_vinculos','message','Vincule um produto do sistema para todos os itens antes de finalizar.');
  end if;

  select fiscal_nfe_import_id, classificacao, cliente_id
    into v_import_id, v_classificacao, v_cliente_id
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_classificacao is null then
    return jsonb_build_object(
      'status','pendente_classificacao',
      'message','Classifique o recebimento antes de concluir: Estoque Próprio ou Material do Cliente.'
    );
  end if;

  -- Mapeamento para beneficiamento (itens -> produto)
  select jsonb_agg(
           jsonb_build_object(
             'item_id', ri.fiscal_nfe_item_id,
             'produto_id', ri.produto_id
           )
         )
  into v_matches
  from public.recebimento_itens ri
  where ri.recebimento_id = p_recebimento_id
    and ri.empresa_id = v_emp
    and ri.produto_id is not null;

  if v_classificacao = 'material_cliente' then
    if v_cliente_id is null then
      return jsonb_build_object(
        'status','pendente_classificacao',
        'message','Para Material do Cliente, selecione o cliente/dono do material.'
      );
    end if;

    perform public.beneficiamento_process_from_import(v_import_id, coalesce(v_matches, '[]'::jsonb));

    begin
      v_sync := public.recebimento_sync_materiais_cliente(p_recebimento_id);
      v_sync_count := coalesce((v_sync->>'upserted')::int, 0);
    exception when others then
      v_sync := jsonb_build_object('status','error','error',SQLERRM);
      v_sync_count := 0;
    end;

    update public.recebimentos set status = 'concluido', updated_at = now()
    where id = p_recebimento_id;

    return jsonb_build_object(
      'status','concluido',
      'message',
        case
          when v_sync_count > 0 then
            'Recebimento concluído. Materiais de Cliente sincronizados ('||v_sync_count||').'
          else
            'Recebimento concluído.'
        end,
      'materiais_cliente_sync', v_sync
    );
  end if;

  -- estoque_proprio
  v_mov := public.estoque_process_from_recebimento(p_recebimento_id);

  update public.recebimentos set status = 'concluido', updated_at = now()
  where id = p_recebimento_id;

  return jsonb_build_object(
    'status','concluido',
    'message','Recebimento concluído e estoque atualizado.',
    'estoque', v_mov
  );
end;
$$;

revoke all on function public.finalizar_recebimento(uuid) from public;
grant execute on function public.finalizar_recebimento(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';


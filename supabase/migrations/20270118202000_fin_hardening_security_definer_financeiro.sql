/*
  FIN hardening (Estado da Arte) — domínio Financeiro (SECURITY DEFINER)

  Objetivos:
  - Garantir que RPCs SECURITY DEFINER expostas ao app tenham:
    - tenant gate (current_empresa_id presente no wrapper)
    - permission guard (require_permission_for_current_user)
    - search_path fixo (pg_catalog, public)
  - Evitar que funções internas/seed/admin fiquem executáveis por authenticated/anon.

  Importante:
  - Qualquer mudança Supabase vira migration.
  - Mantemos compatibilidade de assinatura das RPCs já usadas no frontend.
*/

begin;

-- -----------------------------------------------------------------------------
-- Funções internas/admin/seed: não devem ser executáveis por authenticated/anon.
-- -----------------------------------------------------------------------------

-- Tipicamente chamado por triggers/migrations; não deve ser chamável pelo app.
revoke all on function public.financeiro_centros_custos_ensure_defaults() from public, anon, authenticated;
grant execute on function public.financeiro_centros_custos_ensure_defaults() to service_role;

-- Automação admin (worker). Garante que só service_role execute (sem depender de current_user dentro do definer).
revoke all on function public.financeiro_cobrancas_bancarias_autotick_admin(integer) from public, anon, authenticated;
grant execute on function public.financeiro_cobrancas_bancarias_autotick_admin(integer) to service_role;

create or replace function public.financeiro_cobrancas_bancarias_autotick_admin(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := greatest(1, least(5000, coalesce(p_limit, 500)));
  v_overdue int := 0;
  v_due3 int := 0;
  r record;
begin
  -- execução restrita por grants (service_role-only)

  -- 1) Vencidas (1x)
  for r in
    select c.empresa_id, c.id as cobranca_id, c.status, c.data_vencimento
    from public.financeiro_cobrancas_bancarias c
    where c.data_vencimento < current_date
      and c.data_liquidacao is null
      and c.status not in ('liquidada','baixada','cancelada')
    order by c.data_vencimento asc
    limit v_limit
  loop
    insert into public.financeiro_cobrancas_bancarias_eventos (
      empresa_id, cobranca_id, tipo_evento, status_anterior, status_novo, mensagem
    ) values (
      r.empresa_id, r.cobranca_id, 'auto_overdue', r.status, r.status,
      'Cobrança vencida (automação).'
    )
    on conflict do nothing;
    v_overdue := v_overdue + 1;
  end loop;

  -- 2) Próximas do vencimento (3 dias) (1x)
  for r in
    select c.empresa_id, c.id as cobranca_id, c.status, c.data_vencimento
    from public.financeiro_cobrancas_bancarias c
    where c.data_vencimento between current_date and (current_date + interval '3 days')::date
      and c.data_liquidacao is null
      and c.status not in ('liquidada','baixada','cancelada')
    order by c.data_vencimento asc
    limit v_limit
  loop
    insert into public.financeiro_cobrancas_bancarias_eventos (
      empresa_id, cobranca_id, tipo_evento, status_anterior, status_novo, mensagem
    ) values (
      r.empresa_id, r.cobranca_id, 'auto_due_3d', r.status, r.status,
      'Cobrança perto do vencimento (3 dias).'
    )
    on conflict do nothing;
    v_due3 := v_due3 + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'overdue_checked', v_overdue,
    'due_3d_checked', v_due3
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Cobranças bancárias (tesouraria): adicionar permission guards (view/create/update)
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_cobrancas_bancarias_list(
  p_q text default null,
  p_status text default null,
  p_cliente_id uuid default null,
  p_start_venc date default null,
  p_end_venc date default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  conta_receber_id uuid,
  cliente_id uuid,
  cliente_nome text,
  conta_corrente_id uuid,
  conta_nome text,
  documento_ref text,
  descricao text,
  tipo_cobranca text,
  status text,
  data_emissao date,
  data_vencimento date,
  data_liquidacao date,
  valor_original numeric,
  valor_atual numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');

  if p_status is not null and p_status not in (
    'pendente_emissao',
    'emitida',
    'registrada',
    'enviada',
    'liquidada',
    'baixada',
    'cancelada',
    'erro'
  ) then
    raise exception 'Status de cobrança inválido.';
  end if;

  return query
  select
    c.id,
    c.conta_receber_id,
    c.cliente_id,
    cli.nome as cliente_nome,
    c.conta_corrente_id,
    cc.nome  as conta_nome,
    c.documento_ref,
    c.descricao,
    c.tipo_cobranca,
    c.status,
    c.data_emissao,
    c.data_vencimento,
    c.data_liquidacao,
    c.valor_original,
    c.valor_atual,
    count(*) over() as total_count
  from public.financeiro_cobrancas_bancarias c
  left join public.pessoas cli
    on cli.id = c.cliente_id
  left join public.financeiro_contas_correntes cc
    on cc.id = c.conta_corrente_id
   and cc.empresa_id = v_empresa
  where c.empresa_id = v_empresa
    and (p_status     is null or c.status = p_status)
    and (p_cliente_id is null or c.cliente_id = p_cliente_id)
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (
      p_q is null
      or c.descricao ilike ('%' || p_q || '%')
      or c.documento_ref ilike ('%' || p_q || '%')
      or cli.nome ilike ('%' || p_q || '%')
    )
  order by c.data_vencimento desc nulls last, c.created_at desc, c.id desc
  limit greatest(1, least(500, coalesce(p_limit, 50)))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.financeiro_cobrancas_bancarias_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa       uuid := public.current_empresa_id();
  v_res           jsonb;
  v_evt           jsonb;
  v_titulo_numero text;
  v_cr_id         uuid;
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');

  select jsonb_agg(
           jsonb_build_object(
             'id', e.id,
             'tipo_evento', e.tipo_evento,
             'status_anterior', e.status_anterior,
             'status_novo', e.status_novo,
             'mensagem', e.mensagem,
             'criado_em', e.criado_em
           )
           order by e.criado_em desc, e.id
         )
  into v_evt
  from public.financeiro_cobrancas_bancarias_eventos e
  where e.empresa_id = v_empresa
    and e.cobranca_id = p_id;

  select
    c.conta_receber_id
  into v_cr_id
  from public.financeiro_cobrancas_bancarias c
  where c.id = p_id
    and c.empresa_id = v_empresa;

  if v_cr_id is not null then
    begin
      execute $sql$
        select cr.numero_titulo
        from public.financeiro_contas_receber cr
        where cr.id = $1
          and cr.empresa_id = $2
      $sql$
      into v_titulo_numero
      using v_cr_id, v_empresa;
    exception
      when undefined_table then
        v_titulo_numero := null;
    end;
  end if;

  select jsonb_build_object(
           'cobranca', to_jsonb(c),
           'eventos', coalesce(v_evt, '[]'::jsonb),
           'numero_titulo', v_titulo_numero
         )
  into v_res
  from public.financeiro_cobrancas_bancarias c
  where c.id = p_id
    and c.empresa_id = v_empresa;

  if v_res is null then
    raise exception 'Cobrança não encontrada ou acesso negado.' using errcode = 'P0002';
  end if;

  return v_res;
end;
$$;

create or replace function public.financeiro_cobrancas_bancarias_summary(
  p_start_venc date default null,
  p_end_venc date default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa  uuid := public.current_empresa_id();
  v_pend     numeric;
  v_em_aberto numeric;
  v_liq      numeric;
  v_baix     numeric;
  v_erro     numeric;
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');

  select coalesce(sum(valor_atual),0)
  into v_pend
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status in ('pendente_emissao','emitida','registrada','enviada')
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_em_aberto
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status in ('pendente_emissao','emitida','registrada','enviada')
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_liq
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status = 'liquidada'
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_baix
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status = 'baixada'
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  select coalesce(sum(valor_atual),0)
  into v_erro
  from public.financeiro_cobrancas_bancarias c
  where c.empresa_id = v_empresa
    and c.status = 'erro'
    and (p_start_venc is null or c.data_vencimento >= p_start_venc)
    and (p_end_venc   is null or c.data_vencimento <= p_end_venc)
    and (p_status     is null or c.status = p_status);

  return jsonb_build_object(
    'ok', true,
    'pendente', coalesce(v_pend, 0),
    'em_aberto', coalesce(v_em_aberto, 0),
    'liquidada', coalesce(v_liq, 0),
    'baixada', coalesce(v_baix, 0),
    'erro', coalesce(v_erro, 0)
  );
end;
$$;

create or replace function public.financeiro_cobrancas_bancarias_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa    uuid := public.current_empresa_id();
  v_id         uuid;
  v_status     text;
  v_tipo       text;
  v_cr_id      uuid;
  v_cliente    uuid;
  v_cc_id      uuid;
  v_valor_orig numeric;
  v_cr_exists  boolean;
begin
  if p_payload ? 'id' and nullif(btrim(p_payload->>'id'), '') is not null then
    perform public.require_permission_for_current_user('tesouraria', 'update');
  else
    perform public.require_permission_for_current_user('tesouraria', 'create');
  end if;

  if p_payload->>'data_vencimento' is null then
    raise exception 'data_vencimento é obrigatória.';
  end if;

  v_valor_orig := (p_payload->>'valor_original')::numeric;
  if v_valor_orig is null or v_valor_orig < 0 then
    raise exception 'valor_original é obrigatório e deve ser >= 0.';
  end if;

  v_status := coalesce(p_payload->>'status', 'pendente_emissao');
  if v_status not in (
    'pendente_emissao',
    'emitida',
    'registrada',
    'enviada',
    'liquidada',
    'baixada',
    'cancelada',
    'erro'
  ) then
    raise exception 'Status de cobrança inválido.';
  end if;

  v_tipo := coalesce(p_payload->>'tipo_cobranca', 'boleto');
  if v_tipo not in ('boleto','pix','carne','link_pagamento','outro') then
    raise exception 'tipo_cobranca inválido.';
  end if;

  v_cr_id   := (p_payload->>'conta_receber_id')::uuid;
  v_cliente := (p_payload->>'cliente_id')::uuid;
  v_cc_id   := (p_payload->>'conta_corrente_id')::uuid;

  if v_cr_id is not null then
    select exists (
      select 1
      from public.financeiro_contas_receber cr
      where cr.id = v_cr_id
        and cr.empresa_id = v_empresa
    )
    into v_cr_exists;
    if not v_cr_exists then
      raise exception 'Conta a receber não encontrada ou acesso negado.';
    end if;
  end if;

  if v_cliente is not null then
    if not exists (
      select 1 from public.pessoas p
      where p.id = v_cliente
        and p.empresa_id = v_empresa
    ) then
      raise exception 'Cliente não encontrado ou acesso negado.';
    end if;
  end if;

  if v_cc_id is not null then
    if not exists (
      select 1 from public.financeiro_contas_correntes cc
      where cc.id = v_cc_id
        and cc.empresa_id = v_empresa
    ) then
      raise exception 'Conta corrente não encontrada ou acesso negado.';
    end if;
  end if;

  v_id := nullif(p_payload->>'id','')::uuid;

  if v_id is null then
    insert into public.financeiro_cobrancas_bancarias (
      empresa_id, conta_receber_id, cliente_id, conta_corrente_id,
      documento_ref, descricao, tipo_cobranca, status,
      data_emissao, data_vencimento, data_liquidacao,
      valor_original, valor_atual
    ) values (
      v_empresa,
      v_cr_id,
      v_cliente,
      v_cc_id,
      p_payload->>'documento_ref',
      p_payload->>'descricao',
      v_tipo,
      v_status,
      (p_payload->>'data_emissao')::date,
      (p_payload->>'data_vencimento')::date,
      (p_payload->>'data_liquidacao')::date,
      v_valor_orig,
      coalesce((p_payload->>'valor_atual')::numeric, v_valor_orig)
    )
    returning id into v_id;
  else
    update public.financeiro_cobrancas_bancarias
    set
      conta_receber_id = v_cr_id,
      cliente_id = v_cliente,
      conta_corrente_id = v_cc_id,
      documento_ref = p_payload->>'documento_ref',
      descricao = p_payload->>'descricao',
      tipo_cobranca = v_tipo,
      status = v_status,
      data_emissao = (p_payload->>'data_emissao')::date,
      data_vencimento = (p_payload->>'data_vencimento')::date,
      data_liquidacao = (p_payload->>'data_liquidacao')::date,
      valor_original = v_valor_orig,
      valor_atual = coalesce((p_payload->>'valor_atual')::numeric, v_valor_orig),
      updated_at = now()
    where id = v_id
      and empresa_id = v_empresa;
    if not found then
      raise exception 'Cobrança não encontrada ou acesso negado.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Wrappers gerados por SEC-02: adiciona tenant gate explícito no wrapper
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_cobrancas_bancarias_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.current_empresa_id();
  perform public.require_permission_for_current_user('tesouraria', 'delete');
  perform public._financeiro_cobrancas_bancarias_delete(p_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Contas a pagar/receber (wrappers/v2): garantir guard + tenant gate
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_pagar_pagar(p_id uuid, p_data_pagamento date default null, p_valor_pago numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.current_empresa_id();
  perform public.require_permission_for_current_user('contas_a_pagar', 'update');
  return public.financeiro_conta_pagar_pagar_v2(p_id, p_data_pagamento, p_valor_pago, null);
end;
$$;

create or replace function public.financeiro_conta_a_receber_receber(p_id uuid, p_data_pagamento date default null, p_valor_pago numeric default null)
returns contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.current_empresa_id();
  perform public.require_permission_for_current_user('contas_a_receber', 'update');
  return public.financeiro_conta_a_receber_receber_v2(p_id, p_data_pagamento, p_valor_pago, null);
end;
$$;

create or replace function public.financeiro_conta_pagar_estornar(p_id uuid, p_data_estorno date default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.current_empresa_id();
  perform public.require_permission_for_current_user('contas_a_pagar', 'update');
  return public._financeiro_conta_pagar_estornar(p_id, p_data_estorno);
end;
$$;

create or replace function public.financeiro_conta_a_receber_estornar(p_id uuid, p_data_estorno date default null)
returns contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.current_empresa_id();
  perform public.require_permission_for_current_user('contas_a_receber', 'update');
  return public.financeiro_conta_a_receber_estornar_v2(p_id, p_data_estorno, null, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Origem compra/recebimento/OS: adicionar guard (view)
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_a_pagar_from_compra_get(p_compra_id uuid)
returns uuid
language sql
stable security definer
set search_path = pg_catalog, public
as $$
  with _guard as (
    select public.require_permission_for_current_user('contas_a_pagar', 'view')
  )
  select cp.id
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = public.current_empresa_id()
    and cp.origem_tipo = 'COMPRA'
    and cp.origem_id = p_compra_id
  limit 1
$$;

create or replace function public.financeiro_conta_a_pagar_from_recebimento_get(p_recebimento_id uuid)
returns uuid
language sql
stable security definer
set search_path = pg_catalog, public
as $$
  with _guard as (
    select public.require_permission_for_current_user('contas_a_pagar', 'view')
  )
  select cp.id
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = public.current_empresa_id()
    and cp.origem_tipo = 'RECEBIMENTO'
    and cp.origem_id = p_recebimento_id
  limit 1
$$;

create or replace function public.financeiro_conta_a_receber_from_os_get(p_os_id uuid)
returns uuid
language sql
stable security definer
set search_path = pg_catalog, public
as $$
  with _guard as (
    select public.require_permission_for_current_user('contas_a_receber', 'view')
  )
  select c.id
  from public.contas_a_receber c
  where c.empresa_id = public.current_empresa_id()
    and c.origem_tipo = 'OS'
    and c.origem_id = p_os_id
  limit 1
$$;

create or replace function public.financeiro_conta_a_receber_from_os_parcela_get(p_os_parcela_id uuid)
returns uuid
language sql
stable security definer
set search_path = pg_catalog, public
as $$
  with _guard as (
    select public.require_permission_for_current_user('contas_a_receber', 'view')
  )
  select c.id
  from public.contas_a_receber c
  where c.empresa_id = public.current_empresa_id()
    and c.origem_tipo = 'OS_PARCELA'
    and c.origem_id = p_os_parcela_id
  limit 1
$$;

create or replace function public.financeiro_conta_a_receber_from_os_create(p_os_id uuid, p_data_vencimento date default null)
returns contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_os public.ordem_servicos;
  v_existing_id uuid;
  v_due date := coalesce(p_data_vencimento, (current_date + 7));
  v_rec public.contas_a_receber;
begin
  perform public.require_permission_for_current_user('contas_a_receber', 'create');

  if v_empresa is null then
    raise exception '[FIN][A_RECEBER][OS] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  select * into v_os
  from public.ordem_servicos os
  where os.id = p_os_id
    and os.empresa_id = v_empresa
  limit 1;

  if not found then
    raise exception '[FIN][A_RECEBER][OS] Ordem de Serviço não encontrada' using errcode = 'P0002';
  end if;

  if v_os.status <> 'concluida'::public.status_os then
    raise exception '[FIN][A_RECEBER][OS] A OS precisa estar concluída para gerar a conta a receber.' using errcode = '23514';
  end if;

  if v_os.cliente_id is null then
    raise exception '[FIN][A_RECEBER][OS] A OS não possui cliente vinculado.' using errcode = '23514';
  end if;

  select public.financeiro_conta_a_receber_from_os_get(p_os_id) into v_existing_id;
  if v_existing_id is not null then
    select * into v_rec
    from public.contas_a_receber c
    where c.id = v_existing_id
      and c.empresa_id = v_empresa;
    return v_rec;
  end if;

  begin
    insert into public.contas_a_receber (
      empresa_id,
      cliente_id,
      descricao,
      valor,
      data_vencimento,
      status,
      observacoes,
      origem_tipo,
      origem_id
    )
    values (
      v_empresa,
      v_os.cliente_id,
      format('OS #%s - %s', v_os.numero::text, coalesce(v_os.descricao, '')),
      coalesce(v_os.total_geral, 0),
      v_due,
      'pendente'::public.status_conta_receber,
      'Gerado automaticamente a partir de Ordem de Serviço concluída.',
      'OS',
      p_os_id
    )
    returning * into v_rec;
  exception
    when unique_violation then
      select * into v_rec
      from public.contas_a_receber c
      where c.empresa_id = v_empresa
        and c.origem_tipo = 'OS'
        and c.origem_id = p_os_id
      limit 1;
  end;

  return v_rec;
end;
$$;

-- -----------------------------------------------------------------------------
-- Extratos bancários: adicionar permission guards
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_extratos_bancarios_importar(p_conta_corrente_id uuid, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_item jsonb;
  v_count integer := 0;
  v_data date;
  v_desc text;
  v_doc text;
  v_tipo text;
  v_valor numeric;
  v_saldo numeric;
  v_id_banco text;
  v_hash text;
  v_linha text;
begin
  perform public.require_permission_for_current_user('tesouraria', 'create');

  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens deve ser um array JSON.';
  end if;

  if not exists (
    select 1 from public.financeiro_contas_correntes cc
    where cc.id = p_conta_corrente_id
      and cc.empresa_id = v_empresa
  ) then
    raise exception 'Conta corrente não encontrada ou acesso negado.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_data     := (v_item->>'data_lancamento')::date;
    v_desc     := v_item->>'descricao';
    v_doc      := v_item->>'documento_ref';
    v_tipo     := coalesce(v_item->>'tipo_lancamento', 'credito');
    v_valor    := (v_item->>'valor')::numeric;
    v_saldo    := (v_item->>'saldo_apos_lancamento')::numeric;
    v_id_banco := v_item->>'identificador_banco';
    v_hash     := v_item->>'hash_importacao';
    v_linha    := v_item->>'linha_bruta';

    if v_data is null or v_valor is null or v_valor <= 0 then
      continue;
    end if;

    if v_tipo not in ('credito','debito') then
      v_tipo := 'credito';
    end if;

    if v_hash is null or btrim(v_hash) = '' then
      v_hash := md5(
        coalesce(v_data::text,'') || '|' ||
        coalesce(v_desc,'') || '|' ||
        coalesce(v_tipo,'') || '|' ||
        coalesce(v_valor::text,'') || '|' ||
        coalesce(v_doc,'') || '|' ||
        coalesce(v_id_banco,'')
      );
    end if;

    insert into public.financeiro_extratos_bancarios (
      empresa_id, conta_corrente_id, data_lancamento, descricao, identificador_banco, documento_ref,
      tipo_lancamento, valor, saldo_apos_lancamento, origem_importacao, hash_importacao, linha_bruta, conciliado
    ) values (
      v_empresa,
      p_conta_corrente_id,
      v_data,
      v_desc,
      v_id_banco,
      v_doc,
      v_tipo,
      v_valor,
      v_saldo,
      'upload_json',
      v_hash,
      v_linha,
      false
    )
    on conflict (empresa_id, conta_corrente_id, hash_importacao) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.financeiro_extratos_bancarios_vincular_movimentacao(p_extrato_id uuid, p_movimentacao_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov record;
begin
  perform public.require_permission_for_current_user('tesouraria', 'update');

  perform pg_advisory_xact_lock(hashtextextended(p_extrato_id::text, 0));

  select * into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.';
  end if;

  if v_extrato.conciliado is true and v_extrato.movimentacao_id = p_movimentacao_id then
    return;
  end if;

  if v_extrato.conciliado is true and v_extrato.movimentacao_id is not null and v_extrato.movimentacao_id <> p_movimentacao_id then
    raise exception 'Extrato já conciliado com outra movimentação.';
  end if;

  select * into v_mov
  from public.financeiro_movimentacoes m
  where m.id = p_movimentacao_id
    and m.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Movimentação não encontrada ou acesso negado.';
  end if;

  if v_extrato.conta_corrente_id <> v_mov.conta_corrente_id then
    raise exception 'Conta do extrato difere da conta da movimentação.';
  end if;

  if v_extrato.tipo_lancamento = 'credito' and v_mov.tipo_mov <> 'entrada' then
    raise exception 'Lançamento de crédito só pode ser conciliado com movimentação de entrada.';
  end if;

  if v_extrato.tipo_lancamento = 'debito' and v_mov.tipo_mov <> 'saida' then
    raise exception 'Lançamento de débito só pode ser conciliado com movimentação de saída.';
  end if;

  update public.financeiro_extratos_bancarios
  set movimentacao_id = v_mov.id,
      conciliado = true
  where id = v_extrato.id;

  update public.financeiro_movimentacoes
  set conciliado = true
  where id = v_mov.id;

  perform pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato=' || p_extrato_id || ' mov=' || p_movimentacao_id);
end;
$$;

create or replace function public.financeiro_extrato_bancario_summary(p_conta_corrente_id uuid, p_start_date date default null, p_end_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa        uuid := public.current_empresa_id();
  v_saldo_inicial  numeric;
  v_creditos       numeric;
  v_debitos        numeric;
  v_saldo_final    numeric;
  v_creditos_nc    numeric;
  v_debitos_nc     numeric;
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');

  if p_conta_corrente_id is null then
    raise exception 'p_conta_corrente_id é obrigatório para o resumo de extrato.';
  end if;

  select e.saldo_apos_lancamento
  into v_saldo_inicial
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and (p_start_date is not null and e.data_lancamento < p_start_date)
  order by e.data_lancamento desc, e.created_at desc, e.id desc
  limit 1;

  if v_saldo_inicial is null then
    select cc.saldo_inicial
    into v_saldo_inicial
    from public.financeiro_contas_correntes cc
    where cc.id = p_conta_corrente_id
      and cc.empresa_id = v_empresa;

    v_saldo_inicial := coalesce(v_saldo_inicial, 0);
  end if;

  select coalesce(sum(e.valor),0)
  into v_creditos
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'credito'
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  select coalesce(sum(e.valor),0)
  into v_debitos
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'debito'
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  select coalesce(sum(e.valor),0)
  into v_creditos_nc
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'credito'
    and e.conciliado = false
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  select coalesce(sum(e.valor),0)
  into v_debitos_nc
  from public.financeiro_extratos_bancarios e
  where e.empresa_id = v_empresa
    and e.conta_corrente_id = p_conta_corrente_id
    and e.tipo_lancamento = 'debito'
    and e.conciliado = false
    and (p_start_date is null or e.data_lancamento >= p_start_date)
    and (p_end_date   is null or e.data_lancamento <= p_end_date);

  v_saldo_final := coalesce(v_saldo_inicial,0) + coalesce(v_creditos,0) - coalesce(v_debitos,0);

  return jsonb_build_object(
    'ok', true,
    'saldo_inicial', coalesce(v_saldo_inicial,0),
    'creditos', coalesce(v_creditos,0),
    'debitos', coalesce(v_debitos,0),
    'saldo_final', coalesce(v_saldo_final,0),
    'creditos_nao_conciliados', coalesce(v_creditos_nc,0),
    'debitos_nao_conciliados', coalesce(v_debitos_nc,0)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Seed de meios de pagamento: não aceitar empresa arbitrária via app
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_meios_pagamento_seed(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_current uuid := public.current_empresa_id();
  v_empresa uuid;
begin
  -- Chamadas internas (trigger/migration) não devem depender de empresa ativa.
  if pg_trigger_depth() > 0 or v_uid is null then
    v_empresa := p_empresa_id;
  else
    -- Chamadas pelo app: restringe ao tenant atual.
    if v_current is null then
      raise exception 'Nenhuma empresa ativa encontrada.' using errcode = '42501';
    end if;

    perform public.require_permission_for_current_user('contas_a_pagar', 'manage');
    v_empresa := v_current;

    if p_empresa_id is not null and p_empresa_id <> v_empresa then
      raise exception 'empresa_id inválido.' using errcode = '42501';
    end if;
  end if;

  if v_empresa is null then
    return;
  end if;

  insert into public.financeiro_meios_pagamento (empresa_id, tipo, nome, ativo, is_system)
  values
    (v_empresa, 'pagamento', 'Pix', true, true),
    (v_empresa, 'pagamento', 'Boleto', true, true),
    (v_empresa, 'pagamento', 'Cartão de crédito', true, true),
    (v_empresa, 'pagamento', 'Cartão de débito', true, true),
    (v_empresa, 'pagamento', 'Transferência', true, true),
    (v_empresa, 'pagamento', 'Dinheiro', true, true),
    (v_empresa, 'pagamento', 'Cheque', true, true),
    (v_empresa, 'pagamento', 'TED/DOC', true, true)
  on conflict (empresa_id, lower(nome), tipo) do nothing;

  insert into public.financeiro_meios_pagamento (empresa_id, tipo, nome, ativo, is_system)
  values
    (v_empresa, 'recebimento', 'Pix', true, true),
    (v_empresa, 'recebimento', 'Boleto', true, true),
    (v_empresa, 'recebimento', 'Cartão de crédito', true, true),
    (v_empresa, 'recebimento', 'Cartão de débito', true, true),
    (v_empresa, 'recebimento', 'Transferência', true, true),
    (v_empresa, 'recebimento', 'Dinheiro', true, true),
    (v_empresa, 'recebimento', 'Cheque', true, true),
    (v_empresa, 'recebimento', 'TED/DOC', true, true)
  on conflict (empresa_id, lower(nome), tipo) do nothing;
end;
$$;

commit;

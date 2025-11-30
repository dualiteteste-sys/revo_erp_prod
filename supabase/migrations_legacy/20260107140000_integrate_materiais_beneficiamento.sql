-- =========================================================
-- Industria – Material do Cliente em Ordens de Beneficiamento
-- =========================================================

-- 1) Schema changes
alter table public.industria_benef_ordens
  add column if not exists produto_material_cliente_id uuid,
  add column if not exists usa_material_cliente boolean not null default false;

-- FK para o cadastro de materiais de cliente (se ainda não existir)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ind_benef_ordens_matcli_fkey'
      and conrelid = 'public.industria_benef_ordens'::regclass
  ) then
    alter table public.industria_benef_ordens
      add constraint ind_benef_ordens_matcli_fkey
      foreign key (produto_material_cliente_id)
      references public.industria_materiais_cliente(id);
  end if;
end;
$$;

-- Índices úteis (filtragens futuras / joins)
create index if not exists idx_benef_ordens_matcli
  on public.industria_benef_ordens (produto_material_cliente_id);

create index if not exists idx_benef_ordens_usa_matcli
  on public.industria_benef_ordens (usa_material_cliente);

-- 2) Upsert com validações MT e obrigatoriedade condicional
create or replace function public.industria_benef_upsert_ordem(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_id    uuid;
  v_num   bigint;
  v_cli   uuid := (p_payload->>'cliente_id')::uuid;
  v_srv   uuid := (p_payload->>'produto_servico_id')::uuid;
  v_qtd   numeric := (p_payload->>'quantidade_planejada')::numeric;
  v_und   text := nullif(p_payload->>'unidade','');
  v_status text := coalesce(p_payload->>'status','rascunho');
  v_prior  int := coalesce((p_payload->>'prioridade')::int, 0);
  v_dtprev timestamptz := (p_payload->>'data_prevista_entrega')::timestamptz;
  v_pedref text := p_payload->>'pedido_cliente_ref';
  v_lote   text := p_payload->>'lote_cliente';
  v_docref text := p_payload->>'documento_ref';
  v_obs    text := p_payload->>'observacoes';

  v_usa_mc boolean := coalesce((p_payload->>'usa_material_cliente')::boolean, false);
  v_matcli uuid := (p_payload->>'produto_material_cliente_id')::uuid;

  v_status_ok boolean;
begin
  if v_emp is null then
    raise exception 'Sessão sem empresa (current_empresa_id() retornou NULL).';
  end if;

  if v_cli is null then
    raise exception 'cliente_id é obrigatório.';
  end if;

  if v_srv is null then
    raise exception 'produto_servico_id (serviço) é obrigatório.';
  end if;

  if v_qtd is null or v_qtd <= 0 then
    raise exception 'quantidade_planejada deve ser > 0.';
  end if;

  if v_und is null then
    raise exception 'unidade é obrigatória.';
  end if;

  -- valida domínio de status
  v_status_ok := v_status in ('rascunho','aguardando_material','em_beneficiamento','em_inspecao','parcialmente_entregue','concluida','cancelada');
  if not v_status_ok then
    raise exception 'status inválido.';
  end if;

  -- valida serviço (id existe)
  if not exists (select 1 from public.servicos s where s.id = v_srv) then
    raise exception 'Serviço não encontrado.';
  end if;

  -- se usa material do cliente, validar existência e coerência (mesma empresa e mesmo cliente)
  if v_usa_mc then
    if v_matcli is null then
      raise exception 'produto_material_cliente_id é obrigatório quando usa_material_cliente = true.';
    end if;

    if not exists (
      select 1
      from public.industria_materiais_cliente mc
      where mc.id = v_matcli
        and mc.empresa_id = v_emp
        and mc.cliente_id = v_cli
        and mc.ativo = true
    ) then
      raise exception 'Material do cliente inválido para a empresa/cliente informados.';
    end if;
  end if;

  if p_payload->>'id' is not null then
    update public.industria_benef_ordens o
    set
      cliente_id              = v_cli,
      produto_servico_id      = v_srv,
      produto_material_cliente_id = v_matcli,
      usa_material_cliente    = v_usa_mc,
      quantidade_planejada    = v_qtd,
      unidade                 = v_und,
      status                  = v_status,
      prioridade              = v_prior,
      data_prevista_entrega   = v_dtprev,
      pedido_cliente_ref      = v_pedref,
      lote_cliente            = v_lote,
      documento_ref           = v_docref,
      observacoes             = v_obs
    where o.id = (p_payload->>'id')::uuid
      and o.empresa_id = v_emp
    returning o.id, o.numero into v_id, v_num;
  else
    insert into public.industria_benef_ordens (
      empresa_id, cliente_id, produto_servico_id,
      produto_material_cliente_id, usa_material_cliente,
      quantidade_planejada, unidade, status, prioridade,
      data_prevista_entrega, pedido_cliente_ref, lote_cliente,
      documento_ref, observacoes
    ) values (
      v_emp, v_cli, v_srv,
      v_matcli, v_usa_mc,
      v_qtd, v_und, v_status, v_prior,
      v_dtprev, v_pedref, v_lote,
      v_docref, v_obs
    )
    returning id, numero into v_id, v_num;
  end if;

  perform pg_notify('[RPC]', '[RPC] industria_benef_upsert_ordem id='||v_id||' num='||v_num);
  return public.industria_benef_get_ordem_details(v_id);
end;
$$;

revoke all on function public.industria_benef_upsert_ordem(jsonb) from public;
grant execute on function public.industria_benef_upsert_ordem(jsonb) to authenticated, service_role;

-- 3) GET details incluindo nome do material do cliente (com filtros de empresa)
create or replace function public.industria_benef_get_ordem_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_res jsonb;
begin
  select
    to_jsonb(o.*)
    || jsonb_build_object(
         'cliente_nome', c.nome,
         'produto_servico_nome', s.descricao,
         'produto_material_nome', coalesce(mc.nome_cliente, pr.nome)
       )
    || jsonb_build_object(
         'componentes',
         coalesce((
           select jsonb_agg(
                    to_jsonb(comp.*) || jsonb_build_object('produto_nome', p.nome)
                  )
           from public.industria_ordem_componentes comp
           join public.produtos p on p.id = comp.produto_id
           where comp.ordem_id = o.id
         ), '[]'::jsonb),
         'entregas',
         coalesce((
           select jsonb_agg(ent.*)
           from public.industria_ordem_entregas ent
           where ent.ordem_id = o.id
         ), '[]'::jsonb)
       )
  into v_res
  from public.industria_benef_ordens o
  join public.pessoas  c  on c.id  = o.cliente_id
  join public.servicos s  on s.id  = o.produto_servico_id
  left join public.industria_materiais_cliente mc on mc.id = o.produto_material_cliente_id
  left join public.produtos pr on pr.id = mc.produto_id
  where o.id = p_id
    and o.empresa_id = v_emp;

  return v_res;
end;
$$;

revoke all on function public.industria_benef_get_ordem_details(uuid) from public;
grant execute on function public.industria_benef_get_ordem_details(uuid) to authenticated, service_role;

-- 4) Reload PostgREST
notify pgrst, 'reload schema';

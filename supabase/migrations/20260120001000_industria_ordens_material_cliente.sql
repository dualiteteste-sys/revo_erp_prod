/*
  # Indústria - Beneficiamento: persistir Material do Cliente na Ordem (OP/OB)

  ## Objetivo
  - Permitir salvar/editar uma Ordem de Beneficiamento com vínculo explícito ao "Material do Cliente"
  - Habilitar UI moderna (autocomplete) mantendo consistência ao reabrir a ordem

  ## Observações
  - Alterações idempotentes (IF NOT EXISTS) sempre que possível.
  - RPCs são SECURITY DEFINER e search_path restrito.
*/

-- 1) Colunas na ordem
alter table public.industria_ordens
  add column if not exists usa_material_cliente boolean not null default false,
  add column if not exists material_cliente_id uuid;

create index if not exists idx_industria_ordens_material_cliente
  on public.industria_ordens (material_cliente_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'industria_ordens_material_cliente_fkey'
      and conrelid = 'public.industria_ordens'::regclass
  ) then
    alter table public.industria_ordens
      add constraint industria_ordens_material_cliente_fkey
      foreign key (material_cliente_id)
      references public.industria_materiais_cliente (id);
  end if;
end;
$$;

-- 2) Detalhes: enriquecer com informações do material do cliente
create or replace function public.industria_get_ordem_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid := public.current_empresa_id();
  v_ordem       jsonb;
  v_componentes jsonb;
  v_entregas    jsonb;
begin
  select
    to_jsonb(o.*)
    || jsonb_build_object(
         'produto_nome', p.nome,
         'cliente_nome', c.nome,
         'material_cliente_nome', mc.nome_cliente,
         'material_cliente_codigo', mc.codigo_cliente,
         'material_cliente_unidade', mc.unidade
       )
  into v_ordem
  from public.industria_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  left join public.pessoas c
    on o.cliente_id = c.id
  left join public.industria_materiais_cliente mc
    on mc.id = o.material_cliente_id
   and mc.empresa_id = v_empresa_id
  where o.id = p_id
    and o.empresa_id = v_empresa_id;

  if v_ordem is null then
    return null;
  end if;

  select jsonb_agg(
           to_jsonb(comp.*)
           || jsonb_build_object('produto_nome', p2.nome)
         )
  into v_componentes
  from public.industria_ordens_componentes comp
  join public.produtos p2
    on comp.produto_id = p2.id
  where comp.ordem_id = p_id
    and comp.empresa_id = v_empresa_id;

  select jsonb_agg(
           to_jsonb(ent.*)
           order by ent.data_entrega desc, ent.created_at desc
         )
  into v_entregas
  from public.industria_ordens_entregas ent
  where ent.ordem_id = p_id
    and ent.empresa_id = v_empresa_id;

  return v_ordem
         || jsonb_build_object(
              'componentes', coalesce(v_componentes, '[]'::jsonb),
              'entregas',    coalesce(v_entregas,    '[]'::jsonb)
            );
end;
$$;

revoke all on function public.industria_get_ordem_details from public;
grant execute on function public.industria_get_ordem_details to authenticated, service_role;

-- 3) Upsert: aceitar campos de material do cliente
create or replace function public.industria_upsert_ordem(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_payload->>'id' is not null then
    update public.industria_ordens
    set
      tipo_ordem            = p_payload->>'tipo_ordem',
      produto_final_id      = (p_payload->>'produto_final_id')::uuid,
      quantidade_planejada  = (p_payload->>'quantidade_planejada')::numeric,
      unidade               = p_payload->>'unidade',
      cliente_id            = (p_payload->>'cliente_id')::uuid,
      status                = coalesce(p_payload->>'status', 'rascunho'),
      prioridade            = coalesce((p_payload->>'prioridade')::int, 0),
      data_prevista_inicio  = (p_payload->>'data_prevista_inicio')::date,
      data_prevista_fim     = (p_payload->>'data_prevista_fim')::date,
      data_prevista_entrega = (p_payload->>'data_prevista_entrega')::date,
      documento_ref         = p_payload->>'documento_ref',
      observacoes           = p_payload->>'observacoes',
      usa_material_cliente  = coalesce((p_payload->>'usa_material_cliente')::boolean, false),
      material_cliente_id   = (p_payload->>'material_cliente_id')::uuid
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_ordens (
      empresa_id,
      tipo_ordem,
      produto_final_id,
      quantidade_planejada,
      unidade,
      cliente_id,
      status,
      prioridade,
      data_prevista_inicio,
      data_prevista_fim,
      data_prevista_entrega,
      documento_ref,
      observacoes,
      usa_material_cliente,
      material_cliente_id
    ) values (
      v_empresa_id,
      p_payload->>'tipo_ordem',
      (p_payload->>'produto_final_id')::uuid,
      (p_payload->>'quantidade_planejada')::numeric,
      p_payload->>'unidade',
      (p_payload->>'cliente_id')::uuid,
      coalesce(p_payload->>'status', 'rascunho'),
      coalesce((p_payload->>'prioridade')::int, 0),
      (p_payload->>'data_prevista_inicio')::date,
      (p_payload->>'data_prevista_fim')::date,
      (p_payload->>'data_prevista_entrega')::date,
      p_payload->>'documento_ref',
      p_payload->>'observacoes',
      coalesce((p_payload->>'usa_material_cliente')::boolean, false),
      (p_payload->>'material_cliente_id')::uuid
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] industria_upsert_ordem: ' || v_id);
  return public.industria_get_ordem_details(v_id);
end;
$$;

revoke all on function public.industria_upsert_ordem from public;
grant execute on function public.industria_upsert_ordem to authenticated, service_role;


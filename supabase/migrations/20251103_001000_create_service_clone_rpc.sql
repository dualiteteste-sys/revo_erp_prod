-- 20251103_001000_create_service_clone_rpc.sql
-- Clona um serviço da empresa atual. Status inicial 'inativo'.
-- Garante código único por empresa, sufixando -copy, -copy-2, ...
create or replace function public.create_service_clone_for_current_user(
  p_source_service_id uuid,
  p_overrides jsonb default '{}'::jsonb
)
returns public.servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_src public.servicos;
  v_payload jsonb;
  v_base_codigo text;
  v_candidate_codigo text;
  v_i int := 1;
  v_new public.servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][CLONE_SERVICE] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_src
  from public.servicos s
  where s.id = p_source_service_id
    and s.empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][CLONE_SERVICE] serviço não encontrado' using errcode='P0002';
  end if;

  v_payload := to_jsonb(v_src)
    - 'id' - 'empresa_id' - 'created_at' - 'updated_at';

  v_payload := v_payload
    || jsonb_build_object('descricao', coalesce(p_overrides->>'descricao', 'Cópia de ' || coalesce(v_src.descricao,'Serviço')))
    || jsonb_build_object('status', 'inativo');

  -- código único por empresa (se houver)
  v_base_codigo := nullif(coalesce(p_overrides->>'codigo', nullif(v_src.codigo,'') || '-copy'), '');
  if v_base_codigo is not null then
    v_candidate_codigo := v_base_codigo;
    while exists (
      select 1 from public.servicos where empresa_id = v_empresa_id and codigo = v_candidate_codigo
    ) loop
      v_i := v_i + 1;
      v_candidate_codigo := v_base_codigo || '-' || v_i::text;
    end loop;
    v_payload := v_payload || jsonb_build_object('codigo', v_candidate_codigo);
  end if;

  insert into public.servicos (
    empresa_id, descricao, codigo, preco_venda, unidade, status,
    codigo_servico, nbs, nbs_ibpt_required, descricao_complementar, observacoes
  )
  values (
    v_empresa_id,
    v_payload->>'descricao',
    case when v_payload ? 'codigo' then nullif(v_payload->>'codigo','') else null end,
    nullif(v_payload->>'preco_venda','')::numeric,
    v_payload->>'unidade',
    coalesce(nullif(v_payload->>'status','')::public.status_servico, 'inativo'),
    v_payload->>'codigo_servico',
    v_payload->>'nbs',
    coalesce(nullif(v_payload->>'nbs_ibpt_required','')::boolean, false),
    v_payload->>'descricao_complementar',
    v_payload->>'observacoes'
  )
  returning * into v_new;

  perform pg_notify('app_log', '[RPC] [CREATE_SERVICE_CLONE] ' || v_new.id::text);
  return v_new;
end;
$$;

revoke all on function public.create_service_clone_for_current_user(uuid, jsonb) from public;
grant execute on function public.create_service_clone_for_current_user(uuid, jsonb) to authenticated;
grant execute on function public.create_service_clone_for_current_user(uuid, jsonb) to service_role;

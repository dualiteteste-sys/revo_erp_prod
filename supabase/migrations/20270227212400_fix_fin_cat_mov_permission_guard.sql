/*
  FIX — financeiro_categorias_mov RPCs: adicionar permission guard

  O verify_financeiro_rpc_first.sql exige que toda RPC SECURITY DEFINER
  financeiro_* tenha:
    1) current_empresa_id  ✓ (já existia)
    2) permission guard    ✗ (faltava em list/upsert/delete)
    3) search_path fixo    ✓ (já existia)

  Também revoga grant de authenticated no seed (só trigger/service_role usa).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) financeiro_categorias_mov_list — adicionar permission guard
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_categorias_mov_list(text, boolean);
create or replace function public.financeiro_categorias_mov_list(
  p_tipo   text    default null,
  p_ativo  boolean default true
)
returns table (
  id            uuid,
  nome          text,
  tipo          text,
  dre_linha_key text,
  is_system     boolean,
  ativo         boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_permission_for_current_user('financeiro', 'view');

  return query
    select
      c.id,
      c.nome,
      c.tipo,
      c.dre_linha_key,
      c.is_system,
      c.ativo
    from public.financeiro_categorias_mov c
    where c.empresa_id = public.current_empresa_id()
      and (p_ativo is null or c.ativo = p_ativo)
      and (
        p_tipo is null
        or c.tipo = 'ambos'
        or c.tipo = p_tipo
      )
    order by
      case c.tipo
        when 'entrada' then 1
        when 'saida'   then 2
        when 'ambos'   then 3
        else 4
      end,
      c.nome asc;
end;
$$;

revoke all on function public.financeiro_categorias_mov_list(text, boolean) from public;
grant execute on function public.financeiro_categorias_mov_list(text, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) financeiro_categorias_mov_upsert — adicionar permission guard
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_categorias_mov_upsert(text, text, text, uuid);
create or replace function public.financeiro_categorias_mov_upsert(
  p_nome          text,
  p_tipo          text    default 'ambos',
  p_dre_linha_key text    default null,
  p_id            uuid    default null
)
returns table (
  id            uuid,
  nome          text,
  tipo          text,
  dre_linha_key text,
  is_system     boolean,
  ativo         boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_nome    text := nullif(btrim(p_nome), '');
  v_tipo    text := coalesce(nullif(btrim(p_tipo), ''), 'ambos');
  v_key     text := nullif(btrim(p_dre_linha_key), '');
  v_allowed_keys text[] := array[
    'receita_bruta',
    'deducoes_impostos',
    'cmv_cpv_csp',
    'despesas_operacionais_adm',
    'despesas_operacionais_comerciais',
    'despesas_operacionais_gerais',
    'depreciacao_amortizacao',
    'resultado_financeiro',
    'outras_receitas_despesas',
    'irpj_csll'
  ];
  v_id uuid;
begin
  perform public.require_permission_for_current_user('financeiro', 'create');

  if v_empresa is null then
    raise exception '[FIN][CAT] empresa_id inválido' using errcode = '42501';
  end if;

  if v_nome is null then
    raise exception 'nome é obrigatório';
  end if;

  if v_tipo not in ('entrada','saida','ambos') then
    raise exception 'tipo inválido (esperado: entrada|saida|ambos)';
  end if;

  if v_key is not null and not (v_key = any(v_allowed_keys)) then
    raise exception 'dre_linha_key inválida';
  end if;

  -- Não permite editar categorias de sistema via esta RPC pública
  if p_id is not null then
    if exists (
      select 1 from public.financeiro_categorias_mov
      where financeiro_categorias_mov.id = p_id and empresa_id = v_empresa and is_system = true
    ) then
      raise exception 'Categorias de sistema não podem ser editadas';
    end if;
  end if;

  -- Upsert da categoria
  insert into public.financeiro_categorias_mov
    (empresa_id, nome, tipo, dre_linha_key, is_system, ativo)
  values
    (v_empresa, v_nome, v_tipo, v_key, false, true)
  on conflict on constraint fin_cat_mov_empresa_nome_uk
  do update set
    tipo          = excluded.tipo,
    dre_linha_key = excluded.dre_linha_key,
    ativo         = true,
    updated_at    = now()
  returning financeiro_categorias_mov.id into v_id;

  -- Sync: se dre_linha_key definida → upsert em financeiro_dre_mapeamentos
  if v_key is not null then
    insert into public.financeiro_dre_mapeamentos
      (empresa_id, origem_tipo, origem_valor, dre_linha_key)
    values
      (v_empresa, 'mov_categoria', v_nome, v_key)
    on conflict on constraint fin_dre_map_empresa_origem_uk
    do update set
      dre_linha_key = excluded.dre_linha_key,
      updated_at    = now();
  else
    -- Remove mapeamento explícito se existir (deixa fallback por tipo_mov agir)
    delete from public.financeiro_dre_mapeamentos
    where empresa_id = v_empresa
      and origem_tipo = 'mov_categoria'
      and origem_valor = v_nome;
  end if;

  return query
    select c.id, c.nome, c.tipo, c.dre_linha_key, c.is_system, c.ativo
    from public.financeiro_categorias_mov c
    where c.id = v_id;
end;
$$;

revoke all on function public.financeiro_categorias_mov_upsert(text, text, text, uuid) from public;
grant execute on function public.financeiro_categorias_mov_upsert(text, text, text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) financeiro_categorias_mov_delete — adicionar permission guard
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_categorias_mov_delete(uuid);
create or replace function public.financeiro_categorias_mov_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_nome    text;
  v_system  boolean;
begin
  perform public.require_permission_for_current_user('financeiro', 'delete');

  if v_empresa is null then
    raise exception '[FIN][CAT] empresa_id inválido' using errcode = '42501';
  end if;

  select nome, is_system
  into v_nome, v_system
  from public.financeiro_categorias_mov
  where financeiro_categorias_mov.id = p_id and empresa_id = v_empresa;

  if not found then
    raise exception 'Categoria não encontrada';
  end if;

  if v_system then
    raise exception 'Categorias de sistema não podem ser excluídas';
  end if;

  -- Soft delete
  update public.financeiro_categorias_mov
  set ativo = false, updated_at = now()
  where financeiro_categorias_mov.id = p_id and empresa_id = v_empresa;

  -- Remove mapeamento DRE correspondente
  delete from public.financeiro_dre_mapeamentos
  where empresa_id = v_empresa
    and origem_tipo = 'mov_categoria'
    and origem_valor = v_nome;
end;
$$;

revoke all on function public.financeiro_categorias_mov_delete(uuid) from public;
grant execute on function public.financeiro_categorias_mov_delete(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) financeiro_categorias_mov_seed — revogar authenticated (trigger/service_role only)
-- -----------------------------------------------------------------------------

revoke all on function public.financeiro_categorias_mov_seed(uuid) from public, anon, authenticated;
grant execute on function public.financeiro_categorias_mov_seed(uuid) to service_role;

select pg_notify('pgrst', 'reload schema');

commit;

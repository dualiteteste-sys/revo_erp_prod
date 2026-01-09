/*
  FIN-CC: Reclassificação do tipo de Centro de Custo

  Requisito: campo select obrigatório com opções:
    - Receitas
    - Custo Fixo
    - Custo variável
    - Investimentos

  Implementação:
    - Reutiliza a coluna `tipo` em `public.financeiro_centros_custos`
    - Migra valores legados ('despesa','outro') -> 'custo_fixo'
    - Atualiza CHECK constraint, default e validações nos RPCs
*/

-- 1) Migração de dados legados
update public.financeiro_centros_custos
set tipo = 'custo_fixo'
where tipo is null
   or tipo in ('despesa', 'outro');

-- 2) Constraint + default
alter table public.financeiro_centros_custos
  drop constraint if exists financeiro_centros_custos_tipo_check;

alter table public.financeiro_centros_custos
  alter column tipo set default 'custo_fixo';

alter table public.financeiro_centros_custos
  add constraint financeiro_centros_custos_tipo_check
  check (tipo in ('receita', 'custo_fixo', 'custo_variavel', 'investimento'));

-- 2.1) Garantir 4 raízes padrão por empresa (UX intuitiva pai/filho)
create or replace function public.financeiro_centros_custos_ensure_defaults()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if v_empresa is null then
    raise exception 'empresa_id inválido.';
  end if;

  insert into public.financeiro_centros_custos (empresa_id, parent_id, codigo, nome, tipo, nivel, ordem, ativo, observacoes)
  select v_empresa, null, '1', 'RECEITAS', 'receita', 1, 0, true, 'system_root'
  where not exists (
    select 1 from public.financeiro_centros_custos c
    where c.empresa_id = v_empresa and c.parent_id is null and c.codigo = '1'
  );

  insert into public.financeiro_centros_custos (empresa_id, parent_id, codigo, nome, tipo, nivel, ordem, ativo, observacoes)
  select v_empresa, null, '2', 'CUSTOS VARIÁVEIS', 'custo_variavel', 1, 0, true, 'system_root'
  where not exists (
    select 1 from public.financeiro_centros_custos c
    where c.empresa_id = v_empresa and c.parent_id is null and c.codigo = '2'
  );

  insert into public.financeiro_centros_custos (empresa_id, parent_id, codigo, nome, tipo, nivel, ordem, ativo, observacoes)
  select v_empresa, null, '3', 'CUSTOS FIXOS', 'custo_fixo', 1, 0, true, 'system_root'
  where not exists (
    select 1 from public.financeiro_centros_custos c
    where c.empresa_id = v_empresa and c.parent_id is null and c.codigo = '3'
  );

  insert into public.financeiro_centros_custos (empresa_id, parent_id, codigo, nome, tipo, nivel, ordem, ativo, observacoes)
  select v_empresa, null, '4', 'INVESTIMENTOS', 'investimento', 1, 0, true, 'system_root'
  where not exists (
    select 1 from public.financeiro_centros_custos c
    where c.empresa_id = v_empresa and c.parent_id is null and c.codigo = '4'
  );
end;
$$;

revoke all on function public.financeiro_centros_custos_ensure_defaults from public;
grant execute on function public.financeiro_centros_custos_ensure_defaults to authenticated, service_role;

-- 3) RPC: list (validação do filtro)
create or replace function public.financeiro_centros_custos_list(
  p_search text   default null,
  p_tipo   text   default null,   -- 'receita' | 'custo_fixo' | 'custo_variavel' | 'investimento'
  p_ativo  boolean default null,
  p_limit  int    default 200,
  p_offset int    default 0
)
returns table (
  id          uuid,
  parent_id   uuid,
  codigo      text,
  nome        text,
  tipo        text,
  nivel       int,
  ordem       int,
  ativo       boolean,
  observacoes text,
  is_system_root boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.financeiro_centros_custos_ensure_defaults();

  if p_tipo is not null and p_tipo not in ('receita','custo_fixo','custo_variavel','investimento') then
    raise exception 'Tipo de centro de custo inválido.';
  end if;

  return query
  select
    c.id,
    c.parent_id,
    c.codigo,
    c.nome,
    c.tipo,
    c.nivel,
    c.ordem,
    c.ativo,
    c.observacoes,
    (c.parent_id is null and c.codigo in ('1','2','3','4')) as is_system_root,
    count(*) over() as total_count
  from public.financeiro_centros_custos c
  where c.empresa_id = v_empresa
    and (p_tipo  is null or c.tipo  = p_tipo)
    and (p_ativo is null or c.ativo = p_ativo)
    and (
      p_search is null
      or c.nome   ilike '%'||p_search||'%'
      or coalesce(c.codigo,'') ilike '%'||p_search||'%'
      or coalesce(c.observacoes,'') ilike '%'||p_search||'%'
    )
  order by
    c.nivel asc,
    c.parent_id nulls first,
    c.ordem asc,
    c.nome asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_centros_custos_list from public;
grant execute on function public.financeiro_centros_custos_list to authenticated, service_role;

-- 4) RPC: upsert (validação + default)
create or replace function public.financeiro_centros_custos_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_parent  uuid;
  v_tipo    text;
  v_nivel   int;
  v_ordem   int;
  v_parent_tipo text;
begin
  perform public.financeiro_centros_custos_ensure_defaults();

  if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
    raise exception 'Nome do centro de custo é obrigatório.';
  end if;

  v_parent := (p_payload->>'parent_id')::uuid;
  v_tipo   := coalesce(p_payload->>'tipo', 'custo_fixo');

  -- Criar novos itens sempre exige parent_id (evita múltiplas raízes e confusão pai/filho)
  if v_parent is null and (p_payload->>'id') is null then
    raise exception 'Selecione um centro de custo pai (categoria raiz).';
  end if;

  -- Raízes do sistema são somente leitura
  if (p_payload->>'id') is not null then
    if exists (
      select 1
      from public.financeiro_centros_custos c0
      where c0.empresa_id = v_empresa
        and c0.id = (p_payload->>'id')::uuid
        and c0.parent_id is null
        and c0.codigo in ('1','2','3','4')
    ) then
      raise exception 'Centro de custo raiz do sistema é somente leitura.';
    end if;
  end if;

  -- valida parent da mesma empresa (quando informado)
  if v_parent is not null then
    perform 1
    from public.financeiro_centros_custos c
    where c.id = v_parent
      and c.empresa_id = v_empresa;

    if not found then
      raise exception 'Centro de custo pai não encontrado ou acesso negado.';
    end if;
  end if;

  -- Categoria é herdada do pai
  if v_parent is not null then
    select c.tipo into v_parent_tipo
    from public.financeiro_centros_custos c
    where c.id = v_parent and c.empresa_id = v_empresa;
    v_tipo := v_parent_tipo;
  end if;

  if v_tipo not in ('receita','custo_fixo','custo_variavel','investimento') then
    raise exception 'Tipo de centro de custo inválido.';
  end if;

  -- calcula nível
  if v_parent is null then
    v_nivel := 1;
  else
    select coalesce(nivel, 1) + 1
    into v_nivel
    from public.financeiro_centros_custos
    where id = v_parent
      and empresa_id = v_empresa;
  end if;

  v_ordem := coalesce((p_payload->>'ordem')::int, 0);

  if p_payload->>'id' is not null then
    update public.financeiro_centros_custos c
    set
      parent_id   = v_parent,
      codigo      = p_payload->>'codigo',
      nome        = p_payload->>'nome',
      tipo        = v_tipo,
      nivel       = v_nivel,
      ordem       = v_ordem,
      ativo       = coalesce((p_payload->>'ativo')::boolean, ativo),
      observacoes = p_payload->>'observacoes'
    where c.id = (p_payload->>'id')::uuid
      and c.empresa_id = v_empresa
    returning c.id into v_id;
  else
    insert into public.financeiro_centros_custos (
      empresa_id,
      parent_id,
      codigo,
      nome,
      tipo,
      nivel,
      ordem,
      ativo,
      observacoes
    ) values (
      v_empresa,
      v_parent,
      p_payload->>'codigo',
      p_payload->>'nome',
      v_tipo,
      v_nivel,
      v_ordem,
      coalesce((p_payload->>'ativo')::boolean, true),
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_centros_custos_upsert: ' || v_id
  );

  return public.financeiro_centros_custos_get(v_id);
end;
$$;

revoke all on function public.financeiro_centros_custos_upsert from public;
grant execute on function public.financeiro_centros_custos_upsert to authenticated, service_role;

-- 4.1) Get (override: garante defaults e expõe flag de raiz do sistema)
create or replace function public.financeiro_centros_custos_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_result  jsonb;
  v_has_children boolean;
begin
  perform public.financeiro_centros_custos_ensure_defaults();

  select exists (
    select 1
    from public.financeiro_centros_custos c2
    where c2.empresa_id = v_empresa
      and c2.parent_id = p_id
  )
  into v_has_children;

  select
    to_jsonb(c.*)
    || jsonb_build_object(
         'parent_nome', p.nome,
         'has_children', coalesce(v_has_children, false),
         'is_system_root', (c.parent_id is null and c.codigo in ('1','2','3','4'))
       )
  into v_result
  from public.financeiro_centros_custos c
  left join public.financeiro_centros_custos p
    on p.id = c.parent_id
   and p.empresa_id = v_empresa
  where c.id = p_id
    and c.empresa_id = v_empresa;

  return v_result;
end;
$$;

revoke all on function public.financeiro_centros_custos_get from public;
grant execute on function public.financeiro_centros_custos_get to authenticated, service_role;

-- 4.2) Delete (override: protege raízes do sistema)
create or replace function public.financeiro_centros_custos_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_has_children boolean;
begin
  perform public.financeiro_centros_custos_ensure_defaults();

  if exists (
    select 1
    from public.financeiro_centros_custos c0
    where c0.empresa_id = v_empresa
      and c0.id = p_id
      and c0.parent_id is null
      and c0.codigo in ('1','2','3','4')
  ) then
    raise exception 'Centro de custo raiz do sistema não pode ser excluído.';
  end if;

  select exists (
    select 1
    from public.financeiro_centros_custos c
    where c.empresa_id = v_empresa
      and c.parent_id = p_id
  )
  into v_has_children;

  if v_has_children then
    raise exception 'Centro de custo possui sub-centros vinculados. Remova ou remaneje os filhos antes de excluir.';
  end if;

  delete from public.financeiro_centros_custos
  where id = p_id
    and empresa_id = v_empresa;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_centros_custos_delete: ' || p_id
  );
end;
$$;

revoke all on function public.financeiro_centros_custos_delete from public;
grant execute on function public.financeiro_centros_custos_delete to authenticated, service_role;

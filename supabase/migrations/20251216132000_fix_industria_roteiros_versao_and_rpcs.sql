/*
  Fix: Roteiros vazios na UI

  Causa provável:
  - `public.industria_roteiros.versao` em PROD/DEV divergente (text '1.0'), enquanto RPCs legadas
    retornavam/castavam para int, causando erro e listagem vazia.

  Ação:
  - Garante `industria_roteiros.versao` como text (idempotente).
  - Recria `industria_roteiros_list` e `industria_roteiros_upsert` para tratar `versao` como text.
  - Força reload do schema cache via NOTIFY pgrst.
*/

begin;

create schema if not exists public;

-- 1) Convergência de tipo: `industria_roteiros.versao` deve ser text
do $$
declare
  v_typ regtype;
begin
  if to_regclass('public.industria_roteiros') is null then
    raise notice 'Tabela public.industria_roteiros não existe; pulando.';
    return;
  end if;

  select a.atttypid::regtype into v_typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'industria_roteiros'
     and a.attname = 'versao'
     and a.attnum > 0
     and not a.attisdropped;

  if v_typ::text = 'integer' then
    execute 'alter table public.industria_roteiros alter column versao type text using versao::text';
  end if;

  begin
    execute 'alter table public.industria_roteiros alter column versao set default ''1.0''::text';
  exception when others then
    raise notice 'Não foi possível ajustar default de industria_roteiros.versao: %', SQLERRM;
  end;
end $$;

-- 2) RPC: Listar roteiros (versao text)
-- OBS: em alguns ambientes a função existe com OUT params diferentes; `create or replace`
-- não permite mudar o return type, então fazemos DROP antes para manter idempotência.
drop function if exists public.industria_roteiros_list(text, uuid, text, boolean);
drop function if exists public.industria_roteiros_list(text, uuid, text, boolean, int, int);
create or replace function public.industria_roteiros_list(
  p_search     text    default null,
  p_produto_id uuid    default null,
  p_tipo_bom   text    default null, -- 'producao' | 'beneficiamento'
  p_ativo      boolean default null,
  p_limit      int     default 50,
  p_offset     int     default 0
)
returns table (
  id                         uuid,
  produto_id                 uuid,
  produto_nome               text,
  tipo_bom                   text,
  codigo                     text,
  descricao                  text,
  versao                     text,
  ativo                      boolean,
  padrao_para_producao       boolean,
  padrao_para_beneficiamento boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    r.id,
    r.produto_id,
    p.nome as produto_nome,
    r.tipo_bom,
    r.codigo,
    r.descricao,
    r.versao::text as versao,
    r.ativo,
    r.padrao_para_producao,
    r.padrao_para_beneficiamento
  from public.industria_roteiros r
  join public.produtos p
    on r.produto_id = p.id
  where r.empresa_id = v_empresa_id
    and (p_produto_id is null or r.produto_id = p_produto_id)
    and (p_tipo_bom  is null or r.tipo_bom   = p_tipo_bom)
    and (p_ativo     is null or r.ativo      = p_ativo)
    and (
      p_search is null
      or r.codigo    ilike '%' || p_search || '%'
      or r.descricao ilike '%' || p_search || '%'
      or p.nome      ilike '%' || p_search || '%'
    )
  order by
    p.nome asc,
    r.tipo_bom,
    r.versao desc,
    r.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_roteiros_list from public;
grant execute on function public.industria_roteiros_list to authenticated, service_role;

-- 3) RPC: Upsert (versao text)
drop function if exists public.industria_roteiros_upsert(jsonb);
create or replace function public.industria_roteiros_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id                 uuid := public.current_empresa_id();
  v_id                         uuid;
  v_tipo_bom                   text;
  v_padrao_para_producao       boolean;
  v_padrao_para_beneficiamento boolean;
  v_versao                     text;
  v_result                     jsonb;
begin
  v_tipo_bom := p_payload->>'tipo_bom';
  v_versao := nullif(btrim(p_payload->>'versao'), '');

  if v_tipo_bom is null or v_tipo_bom not in ('producao', 'beneficiamento') then
    raise exception 'tipo_bom inválido. Use ''producao'' ou ''beneficiamento''.';
  end if;

  if p_payload->>'produto_id' is null then
    raise exception 'produto_id é obrigatório.';
  end if;

  v_padrao_para_producao :=
    coalesce((p_payload->>'padrao_para_producao')::boolean, false);
  v_padrao_para_beneficiamento :=
    coalesce((p_payload->>'padrao_para_beneficiamento')::boolean, false);

  -- Normaliza flags conforme tipo
  if v_tipo_bom = 'producao' then
    v_padrao_para_beneficiamento := false;
  else
    v_padrao_para_producao := false;
  end if;

  if p_payload->>'id' is not null then
    update public.industria_roteiros
    set
      produto_id                 = (p_payload->>'produto_id')::uuid,
      tipo_bom                   = v_tipo_bom,
      codigo                     = p_payload->>'codigo',
      descricao                  = p_payload->>'descricao',
      versao                     = coalesce(v_versao, versao),
      ativo                      = coalesce((p_payload->>'ativo')::boolean, ativo),
      padrao_para_producao       = v_padrao_para_producao,
      padrao_para_beneficiamento = v_padrao_para_beneficiamento,
      observacoes                = p_payload->>'observacoes'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_roteiros (
      empresa_id,
      produto_id,
      tipo_bom,
      codigo,
      descricao,
      versao,
      ativo,
      padrao_para_producao,
      padrao_para_beneficiamento,
      observacoes
    ) values (
      v_empresa_id,
      (p_payload->>'produto_id')::uuid,
      v_tipo_bom,
      p_payload->>'codigo',
      p_payload->>'descricao',
      coalesce(v_versao, '1.0'),
      coalesce((p_payload->>'ativo')::boolean, true),
      v_padrao_para_producao,
      v_padrao_para_beneficiamento,
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  -- Se marcado como padrão, limpa outros padrões do mesmo produto/tipo
  if v_padrao_para_producao or v_padrao_para_beneficiamento then
    update public.industria_roteiros
    set
      padrao_para_producao = case
        when v_tipo_bom = 'producao' and id <> v_id then false
        else padrao_para_producao
      end,
      padrao_para_beneficiamento = case
        when v_tipo_bom = 'beneficiamento' and id <> v_id then false
        else padrao_para_beneficiamento
      end
    where empresa_id = v_empresa_id
      and produto_id = (p_payload->>'produto_id')::uuid
      and tipo_bom   = v_tipo_bom;
  end if;

  v_result := public.industria_roteiros_get_details(v_id);
  return v_result;
end;
$$;

revoke all on function public.industria_roteiros_upsert from public;
grant execute on function public.industria_roteiros_upsert to authenticated, service_role;

-- 4) Force PostgREST to reload schema cache (evita 404 "schema cache")
notify pgrst, 'reload schema';

commit;

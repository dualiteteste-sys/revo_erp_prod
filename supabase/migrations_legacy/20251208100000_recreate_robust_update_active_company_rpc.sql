-- [RPC] update_active_company — robusta a variações de schema; retorna 1 JSON
-- Padrões: SECURITY DEFINER, search_path fixo, RLS inalterada.

begin;

drop function if exists public.update_active_company(jsonb);

create or replace function public.update_active_company(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  v_user_id    uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
  v_row        public.empresas%rowtype;

  -- pares (json_key, column_name) aceitos; mapeia sinônimos do payload para o nome certo da coluna
  -- ajuste/expanda conforme necessário
  type t_map is record (j text, c text);
  r t_map;

  -- tabela temporária em memória (unnest) com chaves aceitas
  jkeys text[] := array[
    'nome_razao_social','razao_social',
    'nome_fantasia','fantasia',
    'cnpj','inscr_estadual','inscr_municipal',
    'email','telefone',
    'endereco_cep','endereco_logradouro','endereco_numero','endereco_complemento',
    'endereco_bairro','endereco_cidade','endereco_uf',
    'logotipo_url'
  ];

  v_json_key text;
  v_col_name text;
  v_val text;
  v_exists boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa definida para o usuário.' using errcode = '22000';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado à empresa ativa.' using errcode = '42501';
  end if;

  -- 1) Atualiza campos, mapeando sinônimos e checando existência de coluna
  -- regras de mapeamento: payload 'razao_social' -> coluna 'nome_razao_social'; 'fantasia' -> 'nome_fantasia'
  for v_json_key in select unnest(jkeys)
  loop
    -- mapeia para a coluna correta
    v_col_name := case v_json_key
      when 'razao_social'   then 'nome_razao_social'
      when 'fantasia'       then 'nome_fantasia'
      else v_json_key
    end;

    -- pega valor do payload (texto); ignora chaves ausentes
    v_val := p_patch ->> v_json_key;
    if v_val is null then
      continue;
    end if;

    -- ignora string vazia (mantém valor atual)
    if nullif(v_val,'') is null then
      continue;
    end if;

    -- verifica se a coluna existe no schema atual
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'empresas'
        and column_name  = v_col_name
    ) into v_exists;

    if not v_exists then
      continue; -- coluna não existe neste ambiente; tolera silenciosamente
    end if;

    -- aplica update campo a campo (custo irrelevante; garante robustez)
    execute format('update public.empresas set %I = $1, updated_at = timezone(''utc'', now()) where id = $2', v_col_name)
    using v_val, v_empresa_id;
  end loop;

  -- 2) Retorna a linha final como JSON (garante 1 objeto)
  select *
    into v_row
  from public.empresas e
  where e.id = v_empresa_id;

  if not found then
    raise exception 'Empresa não encontrada ou sem autorização.' using errcode = '23503';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.update_active_company(jsonb) from public;
grant  execute on function public.update_active_company(jsonb) to authenticated;

commit;

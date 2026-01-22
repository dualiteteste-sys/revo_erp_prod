/*
  Fix: CompanySettingsForm "Nome Fantasia" não persistia em alguns ambientes.

  Causa provável:
  - Variação histórica de schema em `public.empresas`:
    - `nome_fantasia` (novo) vs `fantasia` (legado)
    - `nome_razao_social` (novo) vs `razao_social` (legado)
  - A RPC `update_active_company` atualizava apenas `nome_fantasia/nome_razao_social` quando presentes no patch,
    e pulava a atualização caso essas colunas não existissem.

  Solução:
  - Tornar a RPC robusta: ao atualizar, escolher a coluna existente entre novo/legado.
  - Ao retornar JSON, sempre expor `nome_fantasia/nome_razao_social` (mesmo se o schema for legado),
    para manter compat com o frontend.
*/

begin;

drop function if exists public.update_active_company(jsonb);

create or replace function public.update_active_company(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id    uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
  v_row        public.empresas%rowtype;

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
  v_alt_exists boolean;
  v_out jsonb;
  v_nome_fantasia text;
  v_nome_razao_social text;
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

  -- Atualiza campo a campo, aceitando sinônimos e schema legado.
  for v_json_key in select unnest(jkeys)
  loop
    v_col_name := case v_json_key
      when 'razao_social' then 'nome_razao_social'
      when 'fantasia'     then 'nome_fantasia'
      else v_json_key
    end;

    v_val := p_patch ->> v_json_key;
    if v_val is null or nullif(v_val,'') is null then
      continue;
    end if;

    if v_col_name = 'cnpj' then
      v_val := regexp_replace(v_val, '\\D', '', 'g');
      if length(v_val) <> 14 then
        raise exception 'CNPJ inválido (precisa ter 14 dígitos).' using errcode='22023';
      end if;
      if exists (
        select 1 from public.empresas e
        where e.cnpj = v_val and e.id <> v_empresa_id
      ) then
        raise exception 'CNPJ já cadastrado.' using errcode='23505';
      end if;
    end if;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'empresas'
        and column_name  = v_col_name
    ) into v_exists;

    -- Compat legado: se colunas novas não existem, tenta colunas antigas.
    if not v_exists and v_col_name = 'nome_fantasia' then
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'empresas'
          and column_name  = 'fantasia'
      ) into v_alt_exists;
      if v_alt_exists then
        v_col_name := 'fantasia';
        v_exists := true;
      end if;
    end if;

    if not v_exists and v_col_name = 'nome_razao_social' then
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'empresas'
          and column_name  = 'razao_social'
      ) into v_alt_exists;
      if v_alt_exists then
        v_col_name := 'razao_social';
        v_exists := true;
      end if;
    end if;

    if not v_exists then
      continue;
    end if;

    execute format(
      'update public.empresas set %I = $1, updated_at = timezone(''utc'', now()) where id = $2',
      v_col_name
    )
    using v_val, v_empresa_id;
  end loop;

  select * into v_row
  from public.empresas e
  where e.id = v_empresa_id;

  if not found then
    raise exception 'Empresa não encontrada ou sem autorização.' using errcode = '23503';
  end if;

  v_out := to_jsonb(v_row);

  -- Normaliza saída: sempre expor chaves `nome_*` mesmo em schema legado.
  v_nome_fantasia := coalesce((v_out ->> 'nome_fantasia'), (v_out ->> 'fantasia'), null);
  v_nome_razao_social := coalesce((v_out ->> 'nome_razao_social'), (v_out ->> 'razao_social'), null);

  if v_out ? 'nome_fantasia' is false and v_nome_fantasia is not null then
    v_out := jsonb_set(v_out, '{nome_fantasia}', to_jsonb(v_nome_fantasia), true);
  end if;
  if v_out ? 'nome_razao_social' is false and v_nome_razao_social is not null then
    v_out := jsonb_set(v_out, '{nome_razao_social}', to_jsonb(v_nome_razao_social), true);
  end if;

  return v_out;
end;
$$;

revoke all on function public.update_active_company(jsonb) from public, anon;
grant execute on function public.update_active_company(jsonb) to authenticated, service_role, postgres;

select pg_notify('pgrst','reload schema');

commit;


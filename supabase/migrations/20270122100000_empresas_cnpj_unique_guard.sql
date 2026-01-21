/*
  Guardrail: evitar CNPJ duplicado em empresas.
  - Normaliza CNPJ (somente dígitos) quando existir máscara.
  - Cria índice UNIQUE (parcial) se não houver duplicados.
  - Atualiza RPC update_active_company para validar duplicidade/formatos.
*/

begin;

update public.empresas
set cnpj = regexp_replace(cnpj, '\\D', '', 'g')
where cnpj is not null
  and cnpj <> ''
  and cnpj ~ '\\D';

do $$
declare
  v_dup_count int;
begin
  select count(*)
  into v_dup_count
  from (
    select cnpj
    from public.empresas
    where cnpj is not null and cnpj <> ''
    group by cnpj
    having count(*) > 1
  ) t;

  if v_dup_count = 0 then
    create unique index if not exists empresas_cnpj_unique_not_null
      on public.empresas (cnpj)
      where cnpj is not null and cnpj <> '';
  else
    raise notice 'CNPJ duplicado detectado. Indice unico nao criado (%).', v_dup_count;
  end if;
end $$;

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

  -- Atualiza campo a campo, aceitando sinônimos
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

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.update_active_company(jsonb) from public, anon;
grant execute on function public.update_active_company(jsonb) to authenticated, service_role, postgres;

select pg_notify('pgrst','reload schema');

commit;

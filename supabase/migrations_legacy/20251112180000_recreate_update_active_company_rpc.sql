-- [RPC] update_active_company — atualiza empresa ATIVA do usuário e retorna 1 JSON
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
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa definida para o usuário.' using errcode = '22000';
  end if;

  -- Segurança extra: usuário precisa ser membro da empresa ativa
  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado à empresa ativa.' using errcode = '42501';
  end if;

  -- Atualiza colunas, incluindo endereço, conforme schema
  update public.empresas e
     set razao_social          = coalesce(nullif(p_patch->>'razao_social',''), e.razao_social),
         fantasia              = coalesce(nullif(p_patch->>'fantasia',''),     e.fantasia),
         cnpj                  = coalesce(nullif(p_patch->>'cnpj',''),              e.cnpj),
         inscr_estadual        = coalesce(nullif(p_patch->>'inscr_estadual',''),    e.inscr_estadual),
         inscr_municipal       = coalesce(nullif(p_patch->>'inscr_municipal',''),   e.inscr_municipal),
         email                 = coalesce(nullif(p_patch->>'email',''),             e.email),
         telefone              = coalesce(nullif(p_patch->>'telefone',''),          e.telefone),
         endereco_cep          = coalesce(nullif(p_patch->>'endereco_cep',''),      e.endereco_cep),
         endereco_logradouro   = coalesce(nullif(p_patch->>'endereco_logradouro',''), e.endereco_logradouro),
         endereco_numero       = coalesce(nullif(p_patch->>'endereco_numero',''),     e.endereco_numero),
         endereco_complemento  = coalesce(nullif(p_patch->>'endereco_complemento',''),e.endereco_complemento),
         endereco_bairro       = coalesce(nullif(p_patch->>'endereco_bairro',''),     e.endereco_bairro),
         endereco_cidade       = coalesce(nullif(p_patch->>'endereco_cidade',''),     e.endereco_cidade),
         endereco_uf           = coalesce(nullif(p_patch->>'endereco_uf',''),         e.endereco_uf),
         logotipo_url          = coalesce(nullif(p_patch->>'logotipo_url',''),      e.logotipo_url),
         updated_at            = timezone('utc', now())
   where e.id = v_empresa_id
   returning e.* into v_row;

  if not found then
    raise exception 'Empresa não encontrada ou sem autorização.' using errcode = '23503';
  end if;

  return to_jsonb(v_row);
end;
$$;

-- Permissões
revoke execute on function public.update_active_company(jsonb) from public;
grant  execute on function public.update_active_company(jsonb) to authenticated;

commit;

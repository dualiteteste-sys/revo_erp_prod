/*
# [RPC][TRANSPORTADORAS] Correção da função create_update_carrier

Esta migração corrige um erro de sintaxe na função `create_update_carrier`. A condição de exceção `not_found` foi substituída pela condição correta `NO_DATA_FOUND`.

## Query Description:
- **Impacto:** Nenhum impacto nos dados existentes. Apenas corrige a definição de uma função.
- **Riscos:** Baixo. A função estava inoperante devido ao erro de compilação. Esta correção a torna funcional.
- **Precauções:** Nenhuma.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true (revertendo para a versão anterior com erro)

## Structure Details:
- Função afetada: `public.create_update_carrier(jsonb)`

## Security Implications:
- RLS Status: Não aplicável (função)
- Policy Changes: Não
- Auth Requirements: A função continua a exigir que o usuário esteja autenticado e seja membro da empresa.

## Performance Impact:
- Indexes: Nenhum
- Triggers: Nenhum
- Estimated Impact: Nenhum.
*/

-- [RPC][TRANSPORTADORAS] Criar ou atualizar transportadora (CORRIGIDO)
create or replace function public.create_update_carrier(p_payload jsonb)
returns public.transportadoras
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid := p_payload->>'id';
  v_carrier public.transportadoras;
begin
  if v_empresa_id is null then
    raise insufficient_privilege using message = '[AUTH] Empresa não definida na sessão.';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise insufficient_privilege using message = '[AUTH] Usuário não é membro da empresa.';
  end if;

  if v_id is not null then
    -- UPDATE
    update public.transportadoras t
    set
      nome_razao_social = p_payload->>'nome_razao_social',
      nome_fantasia = p_payload->>'nome_fantasia',
      cnpj = p_payload->>'cnpj',
      inscr_estadual = p_payload->>'inscr_estadual',
      status = (p_payload->>'status')::public.status_transportadora
    where t.id = v_id and t.empresa_id = v_empresa_id
    returning * into v_carrier;

    if not found then
      raise exception 'Transportadora com ID % não encontrada nesta empresa.', v_id;
    end if;

  else
    -- INSERT
    insert into public.transportadoras (
      empresa_id,
      nome_razao_social,
      nome_fantasia,
      cnpj,
      inscr_estadual,
      status
    )
    values (
      v_empresa_id,
      p_payload->>'nome_razao_social',
      p_payload->>'nome_fantasia',
      p_payload->>'cnpj',
      p_payload->>'inscr_estadual',
      (p_payload->>'status')::public.status_transportadora
    )
    returning * into v_carrier;
  end if;

  return v_carrier;

exception
  when no_data_found then -- CORREÇÃO: "not_found" para "no_data_found"
    raise exception 'Erro inesperado: registro não encontrado após a operação.';
  when unique_violation then
    raise exception 'Já existe uma transportadora com este CNPJ.' using errcode = '23505';
  when others then
    raise;
end;
$$;

-- Permissões não precisam ser regravadas com 'create or replace', mas é boa prática.
grant execute on function public.create_update_carrier(jsonb) to authenticated;
revoke execute on function public.create_update_carrier(jsonb) from public;

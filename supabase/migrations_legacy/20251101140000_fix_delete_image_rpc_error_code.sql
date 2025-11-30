/*
# [RPC][FIX] Corrige o código de erro na função delete_product_image_db
[Descrição da operação]
Esta operação substitui a função `delete_product_image_db` para usar o `RAISE no_data_found` padrão do PostgreSQL em vez de um código de erro customizado, melhorando a conformidade e a previsibilidade do tratamento de erros.

## Query Description: [Este ajuste alinha a função com as melhores práticas do PostgreSQL, sem alterar a lógica de negócio. A mudança é segura e não afeta dados existentes.]

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Function: public.delete_product_image_db

## Security Implications:
- RLS Status: [Enabled]
- Policy Changes: [No]
- Auth Requirements: [authenticated]

## Performance Impact:
- Indexes: [N/A]
- Triggers: [N/A]
- Estimated Impact: [Nenhum impacto de performance esperado.]
*/

-- [RPC][MEDIA] Deleta registro de imagem após remoção no Storage
-- Segurança: confere membresia pela empresa do produto/da imagem
-- Idempotência: se já não existir, ERRO claro (no_data_found)

create or replace function public.delete_product_image_db(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  -- encontra empresa da imagem
  select pi.empresa_id
    into v_empresa_id
    from public.produto_imagens pi
   where pi.id = p_image_id;

  if not found then
    -- SQLSTATE correto para "no data found"
    raise no_data_found;
  end if;

  -- autorização por membresia
  if not public.is_user_member_of(v_empresa_id) then
    raise exception '[AUTH] usuário não é membro da empresa' using errcode = '42501';
  end if;

  -- apaga do DB (RLS ativo; como SECURITY DEFINER, validamos manualmente a empresa)
  delete from public.produto_imagens
   where id = p_image_id
     and empresa_id = v_empresa_id;

  if not found then
    raise no_data_found;
  end if;
end;
$$;

grant execute on function public.delete_product_image_db(uuid) to authenticated;

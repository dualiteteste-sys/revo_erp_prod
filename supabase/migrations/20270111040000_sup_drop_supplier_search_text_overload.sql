/*
  Fix: PROD drift vs VERIFY — remover overload legado de RPC.

  Contexto
  - `public.search_suppliers_for_current_user(text)` existia em migrations antigas.
  - Foi introduzida uma versão nova `(..., p_limit integer default 20)` e o frontend agora sempre envia `p_limit`.
  - Em ambientes já migrados (PROD), adicionar migrations com timestamp antigo pode remover/recriar em ordem diferente,
    gerando drift e falha no RG-02 (compare VERIFY vs PROD).

  O que faz
  - Remove definitivamente o overload de 1 argumento para evitar ambiguidade no PostgREST e manter o schema final estável.
*/

begin;

drop function if exists public.search_suppliers_for_current_user(text);

notify pgrst, 'reload schema';

commit;


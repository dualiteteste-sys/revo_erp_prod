/*
  # [REVERT] Remove a tabela produto_linhas

  ## Query Description: [Esta operação remove a tabela 'produto_linhas' e suas políticas de segurança associadas. Foi criada para reverter completamente a funcionalidade de linhas de produto do banco de dados.]

  ## Metadata:
  - Schema-Category: "Structural"
  - Impact-Level: "Medium"
  - Requires-Backup: false
  - Reversible: false

  ## Structure Details:
  - Tables being dropped: public.produto_linhas

  ## Security Implications:
  - RLS Status: N/A
  - Policy Changes: Yes (Remoção)
  - Auth Requirements: N/A

  ## Performance Impact:
  - Indexes: Removidos com a tabela
  - Triggers: N/A
  - Estimated Impact: Baixo
*/
DROP TABLE IF EXISTS public.produto_linhas;

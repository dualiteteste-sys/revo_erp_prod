/*
  # Fix Beneficiamento FK to Services (Robust)
  
  Updates the foreign key on `industria_benef_ordens` to point to `servicos` instead of `produtos`.
  Also migrates any existing product references to the services table to maintain integrity,
  handling the `empresa_id` column conditionally.
  
  ## Query Description:
  This operation modifies the foreign key constraint on `industria_benef_ordens`.
  It first ensures all referenced IDs exist in the `servicos` table by copying them from `produtos` if missing.
  Then it switches the FK constraint.
  
  ## Metadata:
  - Schema-Category: "Structural"
  - Impact-Level: "Medium"
  - Requires-Backup: false
  - Reversible: true
*/

set local search_path = pg_catalog, public;

-- 1) Inserção idempotente em servicos, incluindo empresa_id quando a coluna existir
DO $$
DECLARE
  v_has_empresa boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'servicos'
      AND column_name  = 'empresa_id'
  ) INTO v_has_empresa;

  IF v_has_empresa THEN
    INSERT INTO public.servicos (
      id, empresa_id, descricao, unidade, preco_venda, status,
      codigo, codigo_servico, nbs, nbs_ibpt_required,
      descricao_complementar, observacoes, created_at, updated_at
    )
    SELECT
      s.id,
      s.empresa_id,
      s.descricao,
      s.unidade,
      s.preco_venda,
      'ativo',
      NULL, NULL, NULL, FALSE,
      NULL,
      'Criado automaticamente a partir de produtos para atender beneficiamento',
      now(), now()
    FROM (
      with faltantes as (
        select distinct o.produto_servico_id as id
        from public.industria_benef_ordens o
        left join public.servicos s on s.id = o.produto_servico_id
        where o.produto_servico_id is not null
          and s.id is null
      ),
      src as (
        select
          p.id,
          p.empresa_id,
          coalesce(nullif(p.nome, ''), 'Serviço sem descrição') as descricao,
          coalesce(nullif(p.unidade, ''), 'UN')                 as unidade,
          nullif(p.preco_venda, 0)::numeric                     as preco_venda
        from faltantes f
        join public.produtos p on p.id = f.id
      )
      select * from src
    ) s
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.servicos (
      id, descricao, unidade, preco_venda, status,
      codigo, codigo_servico, nbs, nbs_ibpt_required,
      descricao_complementar, observacoes, created_at, updated_at
    )
    SELECT
      s.id,
      s.descricao,
      s.unidade,
      s.preco_venda,
      'ativo',
      NULL, NULL, NULL, FALSE,
      NULL,
      'Criado automaticamente a partir de produtos para atender beneficiamento',
      now(), now()
    FROM (
      with faltantes as (
        select distinct o.produto_servico_id as id
        from public.industria_benef_ordens o
        left join public.servicos s on s.id = o.produto_servico_id
        where o.produto_servico_id is not null
          and s.id is null
      ),
      src as (
        select
          p.id,
          p.empresa_id,
          coalesce(nullif(p.nome, ''), 'Serviço sem descrição') as descricao,
          coalesce(nullif(p.unidade, ''), 'UN')                 as unidade,
          nullif(p.preco_venda, 0)::numeric                     as preco_venda
        from faltantes f
        join public.produtos p on p.id = f.id
      )
      select * from src
    ) s
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 2) Remover FK antigo (para produtos) se existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ind_benef_ordens_prod_serv_fkey'
      AND conrelid = 'public.industria_benef_ordens'::regclass
  ) THEN
    ALTER TABLE public.industria_benef_ordens
      DROP CONSTRAINT ind_benef_ordens_prod_serv_fkey;
  END IF;
END $$;

-- 3) Criar FK correto para servicos(id), caso ainda não exista
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ind_benef_ordens_servico_fkey'
      AND conrelid = 'public.industria_benef_ordens'::regclass
  ) THEN
    ALTER TABLE public.industria_benef_ordens
      ADD CONSTRAINT ind_benef_ordens_servico_fkey
      FOREIGN KEY (produto_servico_id) REFERENCES public.servicos(id);
  END IF;
END $$;

-- 4) Forçar reload do cache do PostgREST
NOTIFY pgrst, 'reload schema';


-- 1. Enum for Traceability
DO $$ BEGIN
    CREATE TYPE public.tipo_rastreabilidade AS ENUM ('nenhum', 'lote', 'serial');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.tipo_produto AS ENUM ('produto', 'servico', 'kit', 'materia_prima', 'semiacabado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1.5 Helper Functions (Missing in baseline)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1.6 Core Tables (Missing in baseline)
CREATE TABLE IF NOT EXISTS public.empresas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL,
    cnpj text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    owner_id uuid, -- Link to auth.users if needed
    slug text
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.empresas;
CREATE POLICY "Enable read access for all users" ON public.empresas FOR SELECT USING (true); -- Simplistic for bootstrap

CREATE TABLE IF NOT EXISTS public.empresa_addons (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
    addon_slug text NOT NULL,
    status text DEFAULT 'active',
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.empresa_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON public.empresa_addons;
CREATE POLICY "Enable all access" ON public.empresa_addons USING (empresa_id = public.current_empresa_id());

CREATE TABLE IF NOT EXISTS public.empresa_usuarios (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
    user_id uuid NOT NULL, -- Link to auth.users
    role text DEFAULT 'member', -- owner, admin, member, viewer
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(empresa_id, user_id)
);
ALTER TABLE public.empresa_usuarios ENABLE ROW LEVEL SECURITY;
-- Simple bootstrap policy: allow user to see their own link
DROP POLICY IF EXISTS "Users can see their own memberships" ON public.empresa_usuarios;
CREATE POLICY "Users can see their own memberships" ON public.empresa_usuarios
    FOR SELECT USING (user_id = public.current_user_id() OR user_id = auth.uid());

-- 2. Alter Produtos to support Traceability
-- 2. Create Produtos Table (Missing in baseline)
CREATE TABLE IF NOT EXISTS public.produtos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    nome text NOT NULL,
    descricao text,
    codigo text,
    sku text,
    unidade text DEFAULT 'un',
    preco_custo numeric(15,4) DEFAULT 0,
    preco_venda numeric(15,4) DEFAULT 0,
    tipo text DEFAULT 'produto', -- produto, servico, kit
    ativo boolean DEFAULT true,
    controlar_estoque boolean DEFAULT true,
    controlar_lotes boolean DEFAULT false,
    estoque_minimo numeric(15,4) DEFAULT 0,
    estoque_atual numeric(15,4) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    rastreabilidade public.tipo_rastreabilidade DEFAULT 'nenhum'
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.produtos;
CREATE POLICY "Enable read access for all users" ON public.produtos
    FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.produtos;
CREATE POLICY "Enable insert for authenticated users only" ON public.produtos
    FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.produtos;
CREATE POLICY "Enable update for authenticated users only" ON public.produtos
    FOR UPDATE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.produtos;
CREATE POLICY "Enable delete for authenticated users only" ON public.produtos
    FOR DELETE USING (empresa_id = public.current_empresa_id());

CREATE TABLE IF NOT EXISTS public.produto_imagens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
    url text NOT NULL,
    "position" integer DEFAULT 0, -- Using quotes for reserved word if needed, or mapped to ordem
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.produto_imagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON public.produto_imagens;
CREATE POLICY "Enable all access" ON public.produto_imagens USING (empresa_id = public.current_empresa_id());

-- ALTER TABLE public.produtos
-- ADD COLUMN IF NOT EXISTS rastreabilidade public.tipo_rastreabilidade DEFAULT 'nenhum';

-- Migrate existing 'controlar_lotes' flag to new enum
UPDATE public.produtos 
SET rastreabilidade = 'lote' 
WHERE controlar_lotes = true AND rastreabilidade = 'nenhum';

-- 3. Create Estoque Lotes (Stock Lots Balance)
CREATE TABLE IF NOT EXISTS public.estoque_lotes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
    lote text NOT NULL,
    validade date,
    saldo numeric(15,4) DEFAULT 0 NOT NULL,
    custo_medio numeric(15,4) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(empresa_id, produto_id, lote)
);

ALTER TABLE public.estoque_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.estoque_lotes;
CREATE POLICY "Enable read access for all users" ON public.estoque_lotes
    FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.estoque_lotes;
CREATE POLICY "Enable insert for authenticated users only" ON public.estoque_lotes
    FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.estoque_lotes;
CREATE POLICY "Enable update for authenticated users only" ON public.estoque_lotes
    FOR UPDATE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.estoque_lotes;
CREATE POLICY "Enable delete for authenticated users only" ON public.estoque_lotes
    FOR DELETE USING (empresa_id = public.current_empresa_id());

-- 4. Alter Estoque Movimentos to support Lot/Serial
-- 4. Create Estoque Movimentos (Missing in baseline)
CREATE TABLE IF NOT EXISTS public.estoque_movimentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE NOT NULL,
    tipo text NOT NULL, -- entrada, saida, ajuste
    quantidade numeric(15,4) NOT NULL,
    saldo_anterior numeric(15,4) NOT NULL,
    saldo_atual numeric(15,4) NOT NULL,
    custo_medio numeric(15,4) DEFAULT 0,
    origem text, -- compra, venda, producao, manual
    origem_id uuid,
    observacoes text,
    created_at timestamptz DEFAULT now(),
    lote text,
    seriais jsonb
);

ALTER TABLE public.estoque_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.estoque_movimentos;
CREATE POLICY "Enable read access for all users" ON public.estoque_movimentos
    FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.estoque_movimentos;
CREATE POLICY "Enable insert for authenticated users only" ON public.estoque_movimentos
    FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

-- ALTER TABLE public.estoque_movimentos
-- ADD COLUMN IF NOT EXISTS lote text,
-- ADD COLUMN IF NOT EXISTS seriais jsonb;

-- 5. Create Industria Tables (Missing in baseline)
CREATE TABLE IF NOT EXISTS public.industria_producao_ordens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    numero serial,
    origem_ordem text DEFAULT 'manual',
    produto_final_id uuid REFERENCES public.produtos(id) NOT NULL,
    quantidade_planejada numeric(15,4) NOT NULL DEFAULT 0,
    unidade text DEFAULT 'un',
    status text DEFAULT 'rascunho',
    prioridade integer DEFAULT 0,
    data_prevista_inicio date,
    data_prevista_fim date,
    data_prevista_entrega date,
    documento_ref text,
    observacoes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.industria_producao_ordens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON public.industria_producao_ordens;
CREATE POLICY "Enable all access" ON public.industria_producao_ordens USING (empresa_id = public.current_empresa_id());

CREATE TABLE IF NOT EXISTS public.industria_producao_componentes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    ordem_id uuid REFERENCES public.industria_producao_ordens(id) ON DELETE CASCADE NOT NULL,
    produto_id uuid REFERENCES public.produtos(id) NOT NULL,
    quantidade_planejada numeric(15,4) NOT NULL DEFAULT 0,
    unidade text DEFAULT 'un',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    quantidade_reservada numeric(15,4) DEFAULT 0
);

ALTER TABLE public.industria_producao_componentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON public.industria_producao_componentes;
CREATE POLICY "Enable all access" ON public.industria_producao_componentes USING (empresa_id = public.current_empresa_id());

-- 5.1 Centros de Trabalho (Missing in baseline)
CREATE TABLE IF NOT EXISTS public.industria_centros_trabalho (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    nome text NOT NULL,
    codigo text,
    descricao text,
    custo_hora numeric(15,4) DEFAULT 0,
    ativo boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    tempo_setup_min integer DEFAULT 0,
    requer_inspecao_final boolean DEFAULT false,
    capacidade_horas_dia numeric(15,4) DEFAULT 8
);
ALTER TABLE public.industria_centros_trabalho ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON public.industria_centros_trabalho;
CREATE POLICY "Enable all access" ON public.industria_centros_trabalho USING (empresa_id = public.current_empresa_id());

-- 5.2 Roteiros de Produção (Missing in baseline)
CREATE TABLE IF NOT EXISTS public.industria_roteiros (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
    nome text NOT NULL,
    versao text DEFAULT '1.0',
    padrao boolean DEFAULT false,
    ativo boolean DEFAULT true,
    descricao text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.industria_roteiros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON public.industria_roteiros;
CREATE POLICY "Enable all access" ON public.industria_roteiros USING (empresa_id = public.current_empresa_id());

-- 5.3 Etapas do Roteiro (Missing in baseline)
CREATE TABLE IF NOT EXISTS public.industria_roteiros_etapas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    roteiro_id uuid REFERENCES public.industria_roteiros(id) ON DELETE CASCADE NOT NULL,
    sequencia integer DEFAULT 1,
    nome text NOT NULL,
    centro_trabalho_id uuid REFERENCES public.industria_centros_trabalho(id) ON DELETE SET NULL,
    descricao text,
    tempo_setup numeric(15,4) DEFAULT 0, -- Minutos
    tempo_operacao numeric(15,4) DEFAULT 0, -- Minutos por unidade
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.industria_roteiros_etapas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access" ON public.industria_roteiros_etapas;
CREATE POLICY "Enable all access" ON public.industria_roteiros_etapas USING (empresa_id = public.current_empresa_id());


-- 5. Create Industria Reservas (Allocations)
CREATE TABLE IF NOT EXISTS public.industria_reservas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    ordem_id uuid REFERENCES public.industria_producao_ordens(id) ON DELETE CASCADE NOT NULL,
    componente_id uuid REFERENCES public.industria_producao_componentes(id) ON DELETE CASCADE,
    lote text,
    quantidade numeric(15,4) NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(empresa_id, ordem_id, componente_id, lote) -- Prevent duplicate rows for same lot allocation
);

ALTER TABLE public.industria_reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.industria_reservas;
CREATE POLICY "Enable read access for all users" ON public.industria_reservas
    FOR SELECT USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.industria_reservas;
CREATE POLICY "Enable insert for authenticated users only" ON public.industria_reservas
    FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.industria_reservas;
CREATE POLICY "Enable update for authenticated users only" ON public.industria_reservas
    FOR UPDATE USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.industria_reservas;
CREATE POLICY "Enable delete for authenticated users only" ON public.industria_reservas
    FOR DELETE USING (empresa_id = public.current_empresa_id());

-- 6. Alter Industria Producao Componentes to track reserved quantity
-- ALTER TABLE public.industria_producao_componentes
-- ADD COLUMN IF NOT EXISTS quantidade_reservada numeric(15,4) DEFAULT 0;

-- Trigger to update updated_at on new tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'handle_updated_at_estoque_lotes'
      AND tgrelid = 'public.estoque_lotes'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at_estoque_lotes
      BEFORE UPDATE ON public.estoque_lotes
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'handle_updated_at_industria_reservas'
      AND tgrelid = 'public.industria_reservas'::regclass
  ) THEN
    CREATE TRIGGER handle_updated_at_industria_reservas
      BEFORE UPDATE ON public.industria_reservas
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

-- =============================================================================
-- Migração: Habilitar RLS em Todas as Tabelas Relevantes
-- Data: 2025-11-08
-- Objetivo: Corrigir a vulnerabilidade "RLS Disabled in Public" habilitando
--           e forçando RLS em todas as tabelas multi-tenant.
-- Impacto:
-- - Segurança: Ativa a separação de dados por tenant (empresa) em todo o sistema.
-- - Reversibilidade: Pode ser revertido com `DISABLE ROW LEVEL SECURITY`.
-- =============================================================================

-- Habilita e força RLS para cada tabela da aplicação.
-- Isso garante que as políticas de segurança criadas anteriormente sejam aplicadas.

ALTER TABLE public.atributos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atributos FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ecommerces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecommerces FORCE ROW LEVEL SECURITY;

ALTER TABLE public.empresa_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_addons FORCE ROW LEVEL SECURITY;

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.empresa_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_usuarios FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores FORCE ROW LEVEL SECURITY;

ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos FORCE ROW LEVEL SECURITY;

ALTER TABLE public.produto_anuncios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_anuncios FORCE ROW LEVEL SECURITY;

ALTER TABLE public.produto_atributos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_atributos FORCE ROW LEVEL SECURITY;

ALTER TABLE public.produto_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_componentes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.produto_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_fornecedores FORCE ROW LEVEL SECURITY;

ALTER TABLE public.produto_imagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_imagens FORCE ROW LEVEL SECURITY;

ALTER TABLE public.produto_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_tags FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_active_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_active_empresa FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tabelas_medidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabelas_medidas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags FORCE ROW LEVEL SECURITY;

ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportadoras FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ordem_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_servicos FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ordem_servico_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_servico_itens FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ordem_servico_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_servico_parcelas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos FORCE ROW LEVEL SECURITY;

-- Telemetria
SELECT pg_notify('app_log', '[RLS] Enabled and Forced RLS on all application tables.');

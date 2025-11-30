-- ====================================================================================
-- Migração: Adiciona Policies RLS Faltantes
-- Data: 2025-11-06
-- ------------------------------------------------------------------------------------
-- Impacto (Resumo)
-- - Segurança: Resolve o advisory "RLS Enabled No Policy" ao adicionar políticas de
--   segurança para as tabelas restantes que possuem RLS ativado.
-- - Tabelas afetadas: empresas, empresa_usuarios, profiles, user_active_empresa,
--   empresa_addons, tags.
-- - Regras:
--   - Usuários só podem ver/editar dados de suas próprias empresas.
--   - Usuários só podem gerenciar seus próprios perfis e configurações.
--   - Mutações complexas (como criar/deletar empresas) são bloqueadas para
--     serem tratadas por RPCs seguras.
-- ====================================================================================

-- =========================
-- empresas
-- =========================
-- Usuários podem ver empresas das quais são membros.
-- Podem atualizar SOMENTE a empresa ativa no momento.
alter table public.empresas enable row level security;
drop policy if exists empresas_select_members on public.empresas;
drop policy if exists empresas_update_active on public.empresas;

create policy empresas_select_members on public.empresas
  for select to authenticated
  using (id in (select empresa_id from public.empresa_usuarios where user_id = auth.uid()));

create policy empresas_update_active on public.empresas
  for update to authenticated
  using (id = public.current_empresa_id())
  with check (id = public.current_empresa_id());

-- =========================
-- empresa_usuarios (vínculo usuário-empresa)
-- =========================
-- Usuários só podem ver seus próprios vínculos.
-- Não podem criar, alterar ou remover vínculos diretamente.
alter table public.empresa_usuarios enable row level security;
drop policy if exists emp_usuarios_select_own on public.empresa_usuarios;

create policy emp_usuarios_select_own on public.empresa_usuarios
  for select to authenticated
  using (user_id = auth.uid());

-- =========================
-- profiles (dados do usuário)
-- =========================
-- Usuário só pode gerenciar seu próprio perfil.
alter table public.profiles enable row level security;
drop policy if exists profiles_manage_own on public.profiles;

create policy profiles_manage_own on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =========================
-- user_active_empresa (preferência de empresa ativa)
-- =========================
-- Usuário só pode gerenciar sua própria preferência.
alter table public.user_active_empresa enable row level security;
drop policy if exists user_active_empresa_manage_own on public.user_active_empresa;

create policy user_active_empresa_manage_own on public.user_active_empresa
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================
-- empresa_addons (módulos extras)
-- =========================
-- Usuários podem ver os addons da empresa ativa.
-- Não podem modificar diretamente; isso é feito via webhook/billing.
alter table public.empresa_addons enable row level security;
drop policy if exists empresa_addons_select_active on public.empresa_addons;

create policy empresa_addons_select_active on public.empresa_addons
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- tags (tags genéricas)
-- =========================
-- Usuários podem gerenciar tags da empresa ativa.
alter table public.tags enable row level security;
drop policy if exists tags_manage_own_company on public.tags;

create policy tags_manage_own_company on public.tags
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

-- FIM
select pg_notify('app_log', '[RLS] applied missing policies to system tables');

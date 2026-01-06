import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresa(page: Page, opts?: { role?: 'member' | 'admin' | 'owner' }) {
  const role = opts?.role ?? 'admin';
  const nowIso = new Date().toISOString();

  // Default: devolve vazio para evitar falhas de carregamento nas páginas MVP.
  // Importante: registramos primeiro para permitir que mocks mais específicos (abaixo)
  // "ganhem" prioridade, independente da ordem de matching do Playwright.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      json: {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: {
          id: 'user-123',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'test@example.com',
        },
      },
    });
  });

  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      json: {
        id: 'user-123',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  await page.route('**/rest/v1/user_active_empresa*', async (route) => {
    await route.fulfill({ json: [{ empresa_id: 'empresa-1' }] });
  });

  await page.route('**/rest/v1/empresa_usuarios*', async (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get('select') || '';

    // A tela de usuários busca `select=role` em formato objeto (single).
    if (select === 'role') {
      await route.fulfill({ json: { role } });
      return;
    }

    // Lista de empresas: sempre array com `empresa`.
    await route.fulfill({
      json: [
        {
          role,
          empresa: {
            id: 'empresa-1',
            nome_razao_social: 'Empresa Teste E2E',
            nome_fantasia: 'Fantasia E2E',
            cnpj: '00000000000191',
            endereco_logradouro: 'Rua Teste',
            telefone: '11999999999',
          },
        },
      ],
    });
  });

  await page.route('**/rest/v1/subscriptions*', async (route) => {
    await route.fulfill({
      json: {
        id: 'sub_123',
        empresa_id: 'empresa-1',
        status: 'active',
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
        stripe_price_id: 'price_123',
      },
    });
  });

  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({
      json: {
        id: 'plan_123',
        name: 'Pro',
        stripe_price_id: 'price_123',
      },
    });
  });

  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: role });
  });

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
  });

  // PDV caixas (novo: multi-caixa) — garante que a rota /app/vendas/pdv abre sem depender de seed.
  await page.route('**/rest/v1/rpc/vendas_pdv_ensure_default_caixa', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/rest/v1/rpc/vendas_pdv_caixas_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'cx-1',
          nome: 'Caixa 1',
          ativo: true,
          sessao_id: 'sess-1',
          sessao_status: 'open',
          opened_at: nowIso,
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/secure_bootstrap_empresa_for_current_user', async (route) => {
    await route.fulfill({ json: 'empresa-1' });
  });

  await page.route('**/rest/v1/empresa_features*', async (route) => {
    await route.fulfill({
      json: {
        empresa_id: 'empresa-1',
        revo_send_enabled: false,
        nfe_emissao_enabled: false,
        plano_mvp: 'ambos',
        max_users: 999,
        servicos_enabled: true,
        industria_enabled: true,
      },
    });
  });
}

test('Menu missing modules: rotas principais abrem (MVP)', async ({ page }) => {
  test.setTimeout(60_000);

  await mockAuthAndEmpresa(page, { role: 'admin' });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);

  const cases: Array<{ path: string; heading: string }> = [
    { path: '/app/cadastros/vendedores', heading: 'Vendedores' },
    { path: '/app/vendas/crm', heading: 'CRM - Funil de Vendas' },
    { path: '/app/vendas/propostas', heading: 'Propostas Comerciais' },
    { path: '/app/vendas/pdv', heading: 'PDV' },
    { path: '/app/vendas/expedicao', heading: 'Expedição' },
    { path: '/app/vendas/comissoes', heading: 'Comissões' },
    { path: '/app/vendas/automacoes', heading: 'Automações (Vendas)' },
    { path: '/app/vendas/devolucoes', heading: 'Devoluções de Venda' },
    { path: '/app/vendas/relatorios', heading: 'Relatórios (Vendas)' },
    { path: '/app/servicos/contratos', heading: 'Contratos (Serviços)' },
    { path: '/app/servicos/notas', heading: 'Notas de Serviço' },
    { path: '/app/servicos/cobrancas', heading: 'Cobranças (Serviços)' },
    { path: '/app/suporte', heading: 'Suporte' },
  ];

  for (const c of cases) {
    await page.goto(c.path);
    await expect(page.getByRole('heading', { name: c.heading })).toBeVisible();
  }
});

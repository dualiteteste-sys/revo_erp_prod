import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresa(page: Page, opts?: { role?: 'member' | 'admin' | 'owner' }) {
  const role = opts?.role ?? 'admin';

  // Fallback genérico: tenta respeitar `.single()` retornando objeto, e listas retornando array.
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = req.url();
    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
      return;
    }

    const accept = (req.headers()['accept'] || '').toLowerCase();
    const isSingle = accept.includes('application/vnd.pgrst.object+json');
    const isMutation = ['post', 'patch', 'put', 'delete'].includes(req.method().toLowerCase());

    if (isSingle) {
      await route.fulfill({ json: {} });
      return;
    }

    if (isMutation) {
      await route.fulfill({ json: [] });
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
        user: { id: 'user-123', aud: 'authenticated', role: 'authenticated', email: 'test@example.com' },
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

    if (select === 'role') {
      await route.fulfill({ json: { role } });
      return;
    }

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
    await route.fulfill({ json: { id: 'plan_123', name: 'Pro', stripe_price_id: 'price_123' } });
  });

  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: role });
  });

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
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
  await page.route('**/rest/v1/rpc/empresa_features_get*', async (route) => {
    await route.fulfill({
      json: [
        {
          empresa_id: 'empresa-1',
          revo_send_enabled: false,
          nfe_emissao_enabled: false,
          plano_mvp: 'ambos',
          max_users: 999,
          servicos_enabled: true,
          industria_enabled: true,
        },
      ],
    });
  });
}

test('RG-03: varredura de console (rotas principais)', async ({ page }) => {
  test.setTimeout(120_000);

  await mockAuthAndEmpresa(page, { role: 'admin' });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);

  const routes: Array<{ path: string; allowRedirectPrefix?: string }> = [
    { path: '/app/dashboard' },
    { path: '/app/partners' },
    { path: '/app/products' },
    { path: '/app/carriers' },
    { path: '/app/services' },
    { path: '/app/cadastros/vendedores' },
    { path: '/app/vendas/pedidos' },
    { path: '/app/vendas/propostas' },
    { path: '/app/vendas/pdv' },
    { path: '/app/vendas/expedicao' },
    { path: '/app/vendas/comissoes' },
    { path: '/app/vendas/automacoes' },
    { path: '/app/vendas/devolucoes' },
    { path: '/app/vendas/relatorios' },
    { path: '/app/servicos/contratos' },
    { path: '/app/servicos/notas' },
    { path: '/app/servicos/cobrancas' },
    { path: '/app/financeiro/tesouraria' },
    { path: '/app/financeiro/contas-a-pagar' },
    { path: '/app/financeiro/contas-a-receber' },
    { path: '/app/financeiro/centros-de-custo' },
    { path: '/app/financeiro/extrato' },
    { path: '/app/suprimentos/compras' },
    { path: '/app/suprimentos/recebimentos' },
    { path: '/app/fiscal/nfe' },
    { path: '/app/rh/matriz' },
    // `/app/configuracoes` redireciona para `/app/configuracoes/:section/:page`
    { path: '/app/configuracoes', allowRedirectPrefix: '/app/configuracoes/' },
    { path: '/app/suporte' },
  ];

  for (const r of routes) {
    await page.goto(r.path);

    // Se renderizou o OnboardingGuard de erro, falha.
    await expect(page.getByRole('heading', { name: 'Erro de Configuração' })).toHaveCount(0);

    const expected = r.allowRedirectPrefix || r.path;
    const safe = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(page).toHaveURL(new RegExp(`${safe}`));
  }
});

import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresaNoAppLogs(page: Page, opts?: { role?: 'member' | 'admin' | 'owner' }) {
  const role = opts?.role ?? 'owner';

  // Guardrail: se o app tentar acessar app_logs via REST, este teste deve falhar (simula 403 real).
  await page.route('**/rest/v1/app_logs*', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Forbidden' }) });
  });

  // Billing (RPC-first): precisa ser registrado ANTES do fallback `**/rest/v1/**`.
  await page.route('**/rest/v1/rpc/billing_subscription_with_plan_get', async (route) => {
    await route.fulfill({
      json: {
        subscription: {
          id: 'sub_123',
          empresa_id: 'empresa-1',
          status: 'active',
          current_period_end: new Date(Date.now() + 86400000).toISOString(),
          stripe_price_id: 'price_123',
          stripe_subscription_id: 'stripe_sub_123',
          plan_slug: 'SCALE',
          billing_cycle: 'monthly',
          cancel_at_period_end: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        plan: {
          id: 'plan_123',
          slug: 'SCALE',
          name: 'Scale',
          billing_cycle: 'monthly',
          currency: 'BRL',
          amount_cents: 0,
          stripe_price_id: 'price_123',
          active: true,
          created_at: new Date().toISOString(),
        },
      },
    });
  });

  await page.route('**/rest/v1/rpc/billing_plans_public_list', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('**/rest/v1/rpc/billing_stripe_webhook_events_list', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Fiscal (RPC-first NF-e settings)
  await page.route('**/rest/v1/rpc/fiscal_feature_flags_get', async (route) => {
    await route.fulfill({ json: { empresa_id: 'empresa-1', nfe_emissao_enabled: false } });
  });

  await page.route('**/rest/v1/rpc/fiscal_nfe_emissao_config_get', async (route) => {
    await route.fulfill({ json: null });
  });

  await page.route('**/rest/v1/rpc/fiscal_nfe_emitente_get', async (route) => {
    await route.fulfill({ json: null });
  });

  await page.route('**/rest/v1/rpc/fiscal_nfe_numeracoes_list', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Fiscal (RPC-first NF-e emissões)
  await page.route('**/rest/v1/rpc/fiscal_nfe_emissoes_list', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Fallback genérico: estabiliza no CI sem bater em Supabase real.
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
    await route.fulfill({ json: { id: 'plan_123', name: 'Scale', stripe_price_id: 'price_123' } });
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

  // Dashboard "atividades" (tenant-safe): não pode depender de ops/logs.
  await page.route('**/rest/v1/rpc/dashboard_activity_feed', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Edge Functions: manter CI estável (não bater em Supabase real).
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    // billing-invoices espera { items: [] }
    const url = req.url();
    if (url.includes('/billing-invoices')) {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

test('RG-05: boot sem 403 (login → empresa ativa → navegar 5 módulos)', async ({ page }) => {
  test.setTimeout(90_000);

  await mockAuthAndEmpresaNoAppLogs(page, { role: 'owner' });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);

  const routes: Array<{ path: string; allowRedirectPrefix?: string }> = [
    { path: '/app/dashboard' },
    { path: '/app/partners' },
    { path: '/app/products' },
    { path: '/app/financeiro/tesouraria' },
    { path: '/app/financeiro/contas-a-pagar' },
    { path: '/app/financeiro/contas-a-receber' },
    { path: '/app/financeiro/extrato' },
    { path: '/app/industria/ordens' },
    { path: '/app/fiscal/nfe' },
    { path: '/app/fiscal/nfe/configuracoes' },
    { path: '/app/configuracoes/geral/assinatura' },
    // `/app/configuracoes` redireciona para `/app/configuracoes/:section/:page`
    { path: '/app/configuracoes', allowRedirectPrefix: '/app/configuracoes/' },
  ];

  for (const r of routes) {
    await page.goto(r.path);
    await expect(page.getByRole('heading', { name: 'Erro de Configuração' })).toHaveCount(0);

    const expected = r.allowRedirectPrefix || r.path;
    const safe = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(page).toHaveURL(new RegExp(`${safe}`));
  }
});

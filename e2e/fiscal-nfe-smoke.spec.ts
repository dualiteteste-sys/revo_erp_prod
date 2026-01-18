import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresa(page: Page) {
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

    if (select === 'role') {
      await route.fulfill({ json: { role: 'member' } });
      return;
    }

    await route.fulfill({
      json: [
        {
          role: 'member',
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

  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: 'member' });
  });

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
  });

  await page.route('**/rest/v1/rpc/secure_bootstrap_empresa_for_current_user', async (route) => {
    await route.fulfill({ json: 'empresa-1' });
  });

  // Billing (RPC-first): necessário para SubscriptionGuard não bloquear o app.
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

test('Fiscal: NF-e rascunhos e configurações abrem sem erros de console', async ({ page }) => {
  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  // Fiscal (RPC-first)
  await page.route('**/rest/v1/rpc/fiscal_nfe_emissoes_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'nfe-1',
          status: 'rascunho',
          numero: null,
          serie: null,
          chave_acesso: null,
          destinatario_pessoa_id: null,
          destinatario_nome: null,
          ambiente: 'homologacao',
          natureza_operacao: 'VENDA',
          valor_total: 120.5,
          total_produtos: 120.5,
          total_descontos: 0,
          total_frete: 0,
          total_impostos: 0,
          total_nfe: 120.5,
          payload: {},
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

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

  // Autocomplete de cliente do rascunho
  await page.route('**/rest/v1/rpc/search_clients_for_current_user', async (route) => {
    await route.fulfill({
      json: [{ id: 'cli-1', label: 'Cliente E2E', nome: 'Cliente E2E', doc_unico: '00000000000191' }],
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);

  await page.goto('/app/fiscal/nfe');
  await expect(page.getByRole('heading', { name: 'NF-e (Rascunhos e Histórico)' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('table').getByText('Rascunho', { exact: true })).toBeVisible();

  await page.goto('/app/fiscal/nfe/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações de NF-e' })).toBeVisible();
  await expect(page.getByText('Controle de emissão')).toBeVisible();
});

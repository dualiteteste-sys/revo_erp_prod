import { test, expect } from '../fixtures';

test('dev pages: Stripe dedupe carrega e permite vincular/arquivar (mock)', async ({ page }) => {
  // Evita chamadas não mapeadas ao Supabase real (estabiliza o smoke no CI).
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = route.request().url();
    if (route.request().method() !== 'OPTIONS' && (
      url.includes('/rest/v1/rpc/terms_document_current_get') ||
      url.includes('/rest/v1/rpc/terms_acceptance_status_get') ||
      url.includes('/rest/v1/rpc/terms_accept_current')
    )) {
      await route.fallback();
      return;
    }

    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
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
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-123',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  });

  // Subscription guard (deixa passar)
  await page.route('**/rest/v1/subscriptions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'sub_123',
        empresa_id: 'empresa-1',
        status: 'active',
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
        stripe_price_id: 'price_123',
      }),
    });
  });
  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'plan_123',
        name: 'Scale',
        stripe_price_id: 'price_123',
      }),
    });
  });

  await page.route('**/rest/v1/user_active_empresa*', async (route) => {
    await route.fulfill({ json: [{ empresa_id: 'empresa-1' }] });
  });
  await page.route('**/rest/v1/empresa_usuarios*', async (route) => {
    await route.fulfill({
      json: [
        {
          role: 'owner',
          empresa: { id: 'empresa-1', nome_razao_social: 'Empresa Teste E2E', nome_fantasia: 'Fantasia E2E' },
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
  });
  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: 'owner' });
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

  const inspectResponse = {
    empresa: { id: 'empresa-1', stripe_customer_id: null, cnpj: null },
    query: { empresa_id: 'empresa-1', email: 'test@example.com', cnpj: null },
    customers: [
      { id: 'cus_dup_1', name: 'Empresa sem Nome', email: null, created: 1700000000, metadata: { empresa_id: 'empresa-1' }, subscription: null },
      {
        id: 'cus_main',
        name: 'Empresa Teste E2E',
        email: 'test@example.com',
        created: 1700000100,
        metadata: { empresa_id: 'empresa-1' },
        subscription: { id: 'sub_main', status: 'trialing', current_period_end: 1700000200, price_id: 'price_123', interval: 'month' },
      },
    ],
    recommended_customer_id: 'cus_main',
  };

  await page.route('**/functions/v1/ops-stripe-dedupe', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const body = (await route.request().postDataJSON().catch(() => null)) as any;
    if (body?.action === 'inspect') {
      await route.fulfill({ json: inspectResponse });
      return;
    }
    if (body?.action === 'link') {
      await route.fulfill({ json: { linked: true, synced: true } });
      return;
    }
    if (body?.action === 'delete') {
      await route.fulfill({ json: { deleted: true, safety: 'ok' } });
      return;
    }
    await route.fulfill({ status: 400, json: { error: 'bad_request' } });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto('/app/desenvolvedor/stripe-dedupe');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Stripe: dedupe / vincular Customer')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Buscar no Stripe' }).click();
  await expect(page.getByText('cus_main')).toBeVisible();
  await expect(page.getByText('Recomendado')).toBeVisible();

  // Arquivar só deve estar habilitado no duplicado sem assinatura
  await expect(page.getByText('cus_dup_1')).toBeVisible();
  await page.getByRole('button', { name: 'Arquivar' }).first().click();
  await expect(page.getByText('Arquivar customer duplicado (Stripe)')).toBeVisible();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Arquivar' }).click();
  await expect(dialog).toBeHidden();
});

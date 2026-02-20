import { test, expect } from './fixtures';

test('Integrations: shows Mercado Livre import button and calls sync', async ({ page }) => {
  // Fallback: estabiliza o E2E (qualquer endpoint rest/v1 não mapeado vira "[]").
  // IMPORTANT: deve ser registrado ANTES dos mocks específicos (Playwright usa o último route registrado como mais prioritário).
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // Auth mocks (same strategy used in auth.spec.ts)
  await page.route('**/auth/v1/token?grant_type=password', async route => {
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
  await page.route('**/auth/v1/user', async route => {
    await route.fulfill({ json: { id: 'user-123', aud: 'authenticated', role: 'authenticated', email: 'test@example.com' } });
  });

  await page.route('**/rest/v1/user_active_empresa*', async route => {
    await route.fulfill({ json: [{ empresa_id: 'empresa-1' }] });
  });
	  await page.route('**/rest/v1/empresa_usuarios*', async route => {
	    const url = new URL(route.request().url());
	    const select = url.searchParams.get('select') || '';
	    if (select === 'role' || select.includes('role')) {
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
	            endereco_logradouro: 'Rua Teste, 123',
	            telefone: '(11) 99999-9999',
	          },
	        },
	      ],
	    });
	  });
  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async route => {
    await route.fulfill({ json: true });
  });
  await page.route('**/rest/v1/subscriptions*', async route => {
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
  await page.route('**/rest/v1/plans*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'plan_123', name: 'Pro', stripe_price_id: 'price_123' }) });
  });
  await page.route('**/rest/v1/empresa_features*', async route => {
    await route.fulfill({
      json: {
        empresa_id: 'empresa-1',
        revo_send_enabled: false,
        nfe_emissao_enabled: false,
        plano_mvp: 'ambos',
        max_users: 999,
        max_nfe_monthly: 999,
        servicos_enabled: true,
        industria_enabled: true,
      },
    });
  });
  await page.route('**/rest/v1/rpc/empresa_features_get*', async route => {
    await route.fulfill({
      json: [
        {
          empresa_id: 'empresa-1',
          revo_send_enabled: false,
          nfe_emissao_enabled: false,
          plano_mvp: 'ambos',
          max_users: 999,
          max_nfe_monthly: 999,
          servicos_enabled: true,
          industria_enabled: true,
        },
      ],
    });
  });

  // RPCs used by the Integrations page
  await page.route('**/rest/v1/rpc/ecommerce_connections_list', async route => {
    await route.fulfill({
      json: [
        {
          id: 'eco-1',
          empresa_id: 'empresa-1',
          provider: 'meli',
          nome: 'Mercado Livre',
          status: 'connected',
          external_account_id: '123',
          config: { import_orders: true, sync_stock: false, push_tracking: false, safe_mode: true },
          connected_at: new Date().toISOString(),
          last_sync_at: null,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });
  await page.route('**/rest/v1/rpc/ecommerce_health_summary', async route => {
    await route.fulfill({ json: { pending: 0, failed_24h: 0, last_sync_at: null } });
  });
  await page.route('**/rest/v1/rpc/ecommerce_connection_diagnostics', async route => {
    await route.fulfill({
      json: {
        provider: 'meli',
        has_connection: true,
        status: 'connected',
        external_account_id: '123',
        connected_at: new Date().toISOString(),
        last_sync_at: null,
        last_error: null,
        has_token: true,
        has_refresh_token: true,
        token_expires_at: null,
        token_expired: false,
      },
    });
  });

  // Edge function invoke
  await page.route('**/functions/v1/marketplaces-sync*', async route => {
    await route.fulfill({ json: { ok: true, provider: 'meli', imported: 1, skipped_items: 0 } });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/app/);
  await page.goto('/app/configuracoes/ecommerce/marketplaces');

  await expect(page.getByText('Integrações com marketplaces')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Mercado Livre', { exact: true })).toBeVisible();

  const btn = page.getByRole('button', { name: 'Importar agora' });
  await expect(btn).toBeVisible();
  await btn.click();

  await expect(page.getByText(/Importação concluída/)).toBeVisible({ timeout: 15000 });
});

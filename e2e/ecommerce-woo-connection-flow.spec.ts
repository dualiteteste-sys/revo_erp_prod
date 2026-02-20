import { test, expect, type Page } from './fixtures';

async function mockAuthBasics(page: Page) {
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

  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: 'owner' });
  });

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
  });
}

test('WooCommerce: salvar credenciais + testar conexão (sem estado stale ao trocar empresa)', async ({ page }) => {
  await mockAuthBasics(page);

  let currentEmpresa = 'empresa-1';
  const connectionIdByEmpresa: Record<string, string> = {
    'empresa-1': 'woo-conn-a',
    'empresa-2': 'woo-conn-b',
  };
  const storeUrlByEmpresa: Record<string, string> = {
    'empresa-1': '',
    'empresa-2': '',
  };
  const secretsByEmpresa: Record<string, { has_ck: boolean; has_cs: boolean }> = {
    'empresa-1': { has_ck: false, has_cs: false },
    'empresa-2': { has_ck: false, has_cs: false },
  };
  const verificationByEmpresa: Record<string, { status: 'pending' | 'connected' | 'error'; verified_at: string | null; error: string | null }> = {
    'empresa-1': { status: 'pending', verified_at: null, error: null },
    'empresa-2': { status: 'pending', verified_at: null, error: null },
  };

  await page.route('**/rest/v1/rpc/empresas_list_for_current_user', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'empresa-1',
          nome_razao_social: 'Empresa A',
          nome_fantasia: 'Empresa A',
          cnpj: '00000000000191',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'empresa-2',
          nome_razao_social: 'Empresa B',
          nome_fantasia: 'Empresa B',
          cnpj: '00000000000272',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/active_empresa_get_for_current_user', async (route) => {
    await route.fulfill({ json: currentEmpresa });
  });

  await page.route('**/rest/v1/rpc/set_active_empresa_for_current_user', async (route) => {
    let body: any = {};
    try {
      body = route.request().postDataJSON() as any;
    } catch {
      body = {};
    }
    const next = body?.p_empresa_id as string | undefined;
    if (next) currentEmpresa = next;
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/rest/v1/rpc/ecommerce_health_summary', async (route) => {
    await route.fulfill({ json: { pending: 0, failed_24h: 0, last_sync_at: null } });
  });

  await page.route('**/rest/v1/rpc/ecommerce_connections_list', async (route) => {
    const id = connectionIdByEmpresa[currentEmpresa];
    await route.fulfill({
      json: [
        {
          id,
          empresa_id: currentEmpresa,
          provider: 'woo',
          nome: 'WooCommerce',
          status: verificationByEmpresa[currentEmpresa].status,
          external_account_id: null,
          config: storeUrlByEmpresa[currentEmpresa] ? { store_url: storeUrlByEmpresa[currentEmpresa] } : {},
          connected_at: verificationByEmpresa[currentEmpresa].status === 'connected' ? new Date().toISOString() : null,
          last_sync_at: null,
          last_error: verificationByEmpresa[currentEmpresa].error,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/ecommerce_connection_diagnostics', async (route) => {
    // payload: { p_provider: 'woo' }
    const diag = {
      provider: 'woo',
      has_connection: true,
      status: verificationByEmpresa[currentEmpresa].status,
      connection_status: verificationByEmpresa[currentEmpresa].status,
      error_message: verificationByEmpresa[currentEmpresa].error,
      last_verified_at: verificationByEmpresa[currentEmpresa].verified_at,
      external_account_id: null,
      connected_at: verificationByEmpresa[currentEmpresa].status === 'connected' ? new Date().toISOString() : null,
      last_sync_at: null,
      last_error: verificationByEmpresa[currentEmpresa].error,
      has_token: secretsByEmpresa[currentEmpresa].has_ck && secretsByEmpresa[currentEmpresa].has_cs,
      has_consumer_key: secretsByEmpresa[currentEmpresa].has_ck,
      has_consumer_secret: secretsByEmpresa[currentEmpresa].has_cs,
      has_refresh_token: false,
      token_expires_at: null,
      token_expired: false,
    };
    await route.fulfill({ json: diag });
  });

  await page.route('**/rest/v1/rpc/ecommerce_woo_set_store_url', async (route) => {
    const body = route.request().postDataJSON() as any;
    const expected = connectionIdByEmpresa[currentEmpresa];
    const got = String(body?.p_ecommerce_id ?? '');

    if (got !== expected) {
      await route.fulfill({
        status: 400,
        json: { code: '22023', message: 'Conexão Woo não encontrada para a empresa ativa. Recarregue a página e tente novamente.' },
      });
      return;
    }

    const storeUrl = String(body?.p_store_url ?? '');
    storeUrlByEmpresa[currentEmpresa] = storeUrl;
    await route.fulfill({ json: { store_url: storeUrl } });
  });

  await page.route('**/rest/v1/rpc/ecommerce_woo_set_secrets_v2', async (route) => {
    const body = route.request().postDataJSON() as any;
    const expected = connectionIdByEmpresa[currentEmpresa];
    const got = String(body?.p_ecommerce_id ?? '');
    if (got !== expected) {
      await route.fulfill({
        status: 400,
        json: { code: '22023', message: 'Conexão Woo não encontrada para a empresa ativa. Recarregue a página e tente novamente.' },
      });
      return;
    }

    secretsByEmpresa[currentEmpresa] = { has_ck: true, has_cs: true };
    verificationByEmpresa[currentEmpresa] = { status: 'pending', verified_at: null, error: null };
    await route.fulfill({
      json: { has_consumer_key: true, has_consumer_secret: true, connection_status: 'pending', last_verified_at: null, error_message: null },
    });
  });

  await page.route('**/rest/v1/rpc/ecommerce_connections_update_config', async (route) => {
    await route.fulfill({ json: {} });
  });

  await page.route('**/rest/v1/rpc/ecommerce_sync_state_upsert', async (route) => {
    await route.fulfill({
      json: {
        id: 'sync-state-1',
        ecommerce_id: connectionIdByEmpresa[currentEmpresa],
        provider: 'woo',
        entity: 'products',
        direction: 'bidirectional',
        conflict_policy: 'erp_wins',
        auto_sync_enabled: false,
        sync_interval_minutes: 15,
        cursor: null,
        last_sync_at: null,
        last_success_at: null,
        last_error_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
    });
  });

  await page.route('**/rest/v1/rpc/ecommerce_sync_state_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'sync-state-1',
          ecommerce_id: connectionIdByEmpresa[currentEmpresa],
          provider: 'woo',
          entity: 'products',
          direction: 'bidirectional',
          conflict_policy: 'erp_wins',
          auto_sync_enabled: false,
          sync_interval_minutes: 15,
          cursor: null,
          last_sync_at: null,
          last_success_at: null,
          last_error_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  // Override global function mock so "Testar conexão" can be asserted deterministically.
  await page.route('**/functions/v1/woocommerce-test-connection', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    verificationByEmpresa[currentEmpresa] = { status: 'connected', verified_at: new Date().toISOString(), error: null };
    await route.fulfill({
      json: {
        ok: true,
        status: 'connected',
        store_url: storeUrlByEmpresa[currentEmpresa] || 'https://example.com',
        message: 'Conexão com WooCommerce validada com sucesso.',
        http_status: 200,
        endpoint: '/wp-json/wc/v3/system_status',
        last_verified_at: new Date().toISOString(),
        latency_ms: 10,
      },
    });
  });

  // Fallback para estabilizar chamadas restantes.
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = req.url();
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
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user') ||
      url.includes('/rest/v1/rpc/set_active_empresa_for_current_user') ||
      url.includes('/rest/v1/rpc/current_empresa_role') ||
      url.includes('/rest/v1/rpc/has_permission_for_current_user') ||
      url.includes('/rest/v1/rpc/ecommerce_health_summary') ||
      url.includes('/rest/v1/rpc/ecommerce_connections_list') ||
      url.includes('/rest/v1/rpc/ecommerce_connection_diagnostics') ||
      url.includes('/rest/v1/rpc/ecommerce_woo_set_store_url') ||
      url.includes('/rest/v1/rpc/ecommerce_woo_set_secrets_v2')
    ) {
      await route.fallback();
      return;
    }
    const accept = (req.headers()['accept'] || '').toLowerCase();
    const isSingle = accept.includes('application/vnd.pgrst.object+json');
    await route.fulfill({ json: isSingle ? {} : [] });
  });

  // Auth: login
  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('12345678');
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto('/app/configuracoes/ecommerce/marketplaces');
  await expect(page.getByText('Integrações com marketplaces')).toBeVisible();

  // Abrir assistente do Woo
  await page.locator('div', { hasText: 'WooCommerce' }).locator('button:has-text("Configurar")').first().click();
  await expect(page.getByText('Assistente de integração')).toBeVisible();

  await page.getByLabel('URL da loja').fill('example.com');
  await page.getByLabel('Consumer Key').fill('ck_test');
  await page.getByLabel('Consumer Secret').fill('cs_test');
  await page.getByRole('button', { name: 'Salvar credenciais' }).click();

  // Badge de persistência (sem exibir segredo)
  await expect(page.getByText('Salvo')).toBeVisible();

  await page.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(page.getByText(/validada com sucesso/i)).toBeVisible();

  // Bug fix regression test: clicar "Salvar" no modal não pode derrubar para "faltam credenciais".
  await page.getByRole('button', { name: /^Salvar$/ }).click();
  await expect(page.getByText('Assistente de integração')).not.toBeVisible();
  await expect(page.locator('div', { hasText: 'WooCommerce' }).getByText('Conectado')).toBeVisible();
  await expect(page.getByText(/Faltam credenciais/i)).not.toBeVisible();

  // Troca de empresa deve limpar estado e evitar usar `ecommerce_id` antigo.
  await page.getByRole('button', { name: 'Empresa A' }).click();
  await page.getByText('Empresa B').click();

  await expect(page.getByText('Assistente de integração')).not.toBeVisible();

  // Reabrir config em Empresa B funciona sem 4xx/5xx.
  await page.locator('div', { hasText: 'WooCommerce' }).locator('button:has-text("Configurar")').first().click();
  await expect(page.getByText('Assistente de integração')).toBeVisible();
});

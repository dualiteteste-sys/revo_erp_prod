import { test, expect } from '../fixtures';

test('dev pages: Ops 403 e Inventário RLS carregam sem erro', async ({ page }) => {
  // Evita chamadas não mapeadas ao Supabase real (estabiliza o smoke no CI).
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
    const url = new URL(route.request().url());
    const select = url.searchParams.get('select') || '';
    if (select === 'role' || select.includes('role')) {
      await route.fulfill({ json: { role: 'owner' } });
      return;
    }
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

  await page.route('**/rest/v1/rpc/ops_403_events_count', async (route) => {
    await route.fulfill({ json: 0 });
  });
  await page.route('**/rest/v1/rpc/ops_403_events_list', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/rpc/ops_403_events_top_kind', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/rpc/ops_403_events_top_rpc', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/rpc/ops_context_snapshot', async (route) => {
    await route.fulfill({
      json: {
        at: new Date().toISOString(),
        user_id: 'user-123',
        empresa_id: 'empresa-1',
        role: 'owner',
        plano_mvp: 'ambos',
        max_users: 999,
      },
    });
  });
  await page.route('**/rest/v1/rpc/ops_403_events_export_sample', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/rpc/ops_app_errors_count', async (route) => {
    await route.fulfill({ json: 0 });
  });
  await page.route('**/rest/v1/rpc/ops_app_errors_list', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/rest/v1/rpc/ops_app_errors_set_resolved', async (route) => {
    await route.fulfill({ json: null });
  });
  await page.route('**/rest/v1/rpc/ops_app_errors_log_v1', async (route) => {
    await route.fulfill({ json: null });
  });
  await page.route('**/rest/v1/rpc/ops_rls_inventory_list', async (route) => {
    await route.fulfill({
      json: [
        {
          schema_name: 'public',
          table_name: 'empresas',
          rls_enabled: true,
          has_empresa_id: false,
          has_current_empresa_policy: false,
          policies_count: 2,
          grants_select: false,
          grants_insert: false,
          grants_update: false,
          grants_delete: false,
        },
      ],
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto('/app/desenvolvedor/403');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Diagnóstico: 403 (Empresa ativa)')).toBeVisible({ timeout: 15000 });

  await page.goto('/app/desenvolvedor/erros');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Erros no Sistema' })).toBeVisible({ timeout: 15000 });

  await page.goto('/app/desenvolvedor/rls');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Diagnóstico: Inventário RLS (multi-tenant)')).toBeVisible({ timeout: 15000 });
});

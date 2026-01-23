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

test('não reaproveita cache de dados entre empresas (produtos)', async ({ page }) => {
  await mockAuthBasics(page);

  let currentEmpresa = 'empresa-1';

  // Override dos mocks globais (fixtures) — última rota registrada vence.
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

  await page.route('**/rest/v1/rpc/produtos_count_for_current_user', async (route) => {
    await route.fulfill({ json: currentEmpresa === 'empresa-1' ? 1 : 1 });
  });

  await page.route('**/rest/v1/rpc/produtos_list_for_current_user', async (route) => {
    const rows =
      currentEmpresa === 'empresa-1'
        ? [
            {
              id: 'prod-a',
              nome: 'Produto A',
              sku: 'A',
              slug: null,
              status: 'ativo',
              preco_venda: 10,
              unidade: 'UNID',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]
        : [
            {
              id: 'prod-b',
              nome: 'Produto B',
              sku: 'B',
              slug: null,
              status: 'ativo',
              preco_venda: 20,
              unidade: 'UNID',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
    await route.fulfill({ json: rows });
  });

  // Subscription guard (passa)
  await page.route('**/rest/v1/subscriptions*', async (route) => {
    await route.fulfill({
      json: {
        id: 'sub_123',
        empresa_id: currentEmpresa,
        status: 'active',
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
        stripe_price_id: 'price_123',
      },
    });
  });

  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({ json: { id: 'plan_123', name: 'Scale', stripe_price_id: 'price_123' } });
  });

  // Fallback genérico para estabilizar chamadas restantes.
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = req.url();
    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user') ||
      url.includes('/rest/v1/rpc/set_active_empresa_for_current_user') ||
      url.includes('/rest/v1/rpc/produtos_count_for_current_user') ||
      url.includes('/rest/v1/rpc/produtos_list_for_current_user')
    ) {
      await route.fallback();
      return;
    }
    const accept = (req.headers()['accept'] || '').toLowerCase();
    const isSingle = accept.includes('application/vnd.pgrst.object+json');
    await route.fulfill({ json: isSingle ? {} : [] });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('12345678');
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto('/app/products');
  await expect(page.getByText('Produto A')).toBeVisible();
  await expect(page.getByText('Produto B')).not.toBeVisible();

  // Troca de empresa (menu superior/sidebar). Fallback: usa o seletor de empresa no sidebar/header.
  await page.getByRole('button', { name: 'Empresa A' }).click();
  await page.getByText('Empresa B').click();

  // Ao trocar empresa, o cache deve ser limpo e a lista deve refletir a nova empresa.
  await expect(page.getByText('Produto B')).toBeVisible();
  await expect(page.getByText('Produto A')).not.toBeVisible();
});

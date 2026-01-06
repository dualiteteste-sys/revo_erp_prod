import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresa(page: Page) {
  // Fallback first (routes registered later have precedence)
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
    if (select === 'role' || select.includes('role')) {
      await route.fulfill({ json: { role: 'owner' } });
      return;
    }
    await route.fulfill({
      json: [
        {
          role: 'owner',
          empresa: {
            id: 'empresa-1',
            nome_razao_social: 'Empresa Teste',
            nome_fantasia: 'Fantasia',
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
      json: { id: 'sub_123', empresa_id: 'empresa-1', status: 'active', current_period_end: new Date(Date.now() + 86400000).toISOString(), stripe_price_id: 'price_123' },
    });
  });

  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({ json: { id: 'plan_123', name: 'Essencial', stripe_price_id: 'price_123' } });
  });

  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: 'owner' });
  });

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
  });

  await page.route('**/rest/v1/empresa_features*', async (route) => {
    await route.fulfill({
      json: { empresa_id: 'empresa-1', revo_send_enabled: false, nfe_emissao_enabled: false, plano_mvp: 'ambos', max_users: 999, servicos_enabled: true, industria_enabled: true },
    });
  });
}

test('UX-01: Command Palette abre com Ctrl+K e navega; não abre em inputs', async ({ page }) => {
  test.setTimeout(90_000);

  await mockAuthAndEmpresa(page);

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app(\/|$)/);

  // garante layout montado
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await page.click('body');

  // Abre palette e navega para pedidos
  await page.keyboard.press('Control+K');
  const paletteInput = page.getByPlaceholder('Buscar páginas… (Ctrl/Cmd + K)');
  await expect(paletteInput).toBeVisible({ timeout: 20000 });
  await paletteInput.fill('Pedidos de Venda');
  await page.getByRole('option', { name: /Pedidos de Venda/i }).click();
  await expect(page).toHaveURL(/\/app\/vendas\/pedidos/);
  await expect(paletteInput).toBeHidden({ timeout: 20000 });

  // Em um input de busca, Ctrl+K não deve abrir
  const searchInput = page.getByPlaceholder('Buscar por número ou cliente...');
  await searchInput.click();
  await page.keyboard.press('Control+K');
  await expect(page.getByPlaceholder('Buscar páginas… (Ctrl/Cmd + K)')).toBeHidden();
});

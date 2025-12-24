import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresaOwner(page: Page) {
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
          email: 'owner@example.com',
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
        email: 'owner@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  await page.route('**/rest/v1/user_active_empresa*', async (route) => {
    await route.fulfill({ json: { empresa_id: 'empresa-1' } });
  });

  await page.route('**/rest/v1/empresa_usuarios*', async (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get('select') || '';

    // useEmpresaRole() faz `.select('role, roles:roles(slug)')...maybeSingle()` e espera OBJETO.
    if (select.includes('roles:roles') || select.includes('role')) {
      await route.fulfill({ json: { role: 'owner', roles: { slug: 'OWNER' } } });
      return;
    }

    // useEmpresas() lista empresas do usuário e espera ARRAY.
    await route.fulfill({
      json: [
        {
          role: 'owner',
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

  // Subscription guard (deixa passar)
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

  // Se algum trecho ainda tentar validar permissão via RPC, forçamos erro — owner deve passar pelo bypass.
  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ status: 500, json: { message: 'should-not-be-called-for-owner' } });
  });
}

test('Owner: abre Configurações e acessa Papéis/Permissões', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ui:sidebarCollapsed', 'false');
  });

  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresaOwner(page);

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('owner@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  // Abre painel de configurações
  await page.getByRole('button', { name: 'Configurações' }).click({ force: true });

  // Vai para "Papéis e Permissões"
  await page.getByRole('button', { name: 'Papéis e Permissões' }).click();

  await expect(page.getByText('Papéis')).toBeVisible();
  await expect(page.getByText('Acesso Negado')).toHaveCount(0);
});

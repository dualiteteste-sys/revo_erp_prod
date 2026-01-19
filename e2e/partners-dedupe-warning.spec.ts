import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresa(page: Page) {
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
    await route.fulfill({ json: 'member' });
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

test('Partners: alerta de duplicidade por e-mail/telefone (best-effort)', async ({ page }) => {
  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = route.request().url();
    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  await page.route('**/rest/v1/rpc/count_partners_v2', async (route) => {
    await route.fulfill({ json: 0 });
  });

  await page.route('**/rest/v1/rpc/list_partners_v2', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Dedupe query (direct table select)
  await page.route('**/rest/v1/pessoas*', async (route) => {
    const url = new URL(route.request().url());
    const email = url.searchParams.get('email') || '';
    if (route.request().method() === 'GET' && email.startsWith('ilike.')) {
      await route.fulfill({
        json: [
          {
            id: 'p-dup',
            nome: 'Cliente Duplicado',
            doc_unico: '00000000000191',
            email: 'dup@example.com',
            telefone: '11999999999',
            celular: null,
          },
        ],
      });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.route('**/rest/v1/rpc/create_update_partner', async (route) => {
    await route.fulfill({
      json: {
        id: 'p-new',
        empresa_id: 'empresa-1',
        tipo: 'cliente',
        tipo_pessoa: 'juridica',
        nome: 'Cliente Criado E2E',
        doc_unico: null,
        email: 'dup@example.com',
        telefone: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contato_tags: [],
        enderecos: [],
        contatos: [],
      },
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/partners');
  await expect(page.getByRole('heading', { name: 'Clientes e Fornecedores' })).toBeVisible();

  await page.getByRole('button', { name: 'Novo' }).click();
  await page.getByRole('menuitem', { name: 'Novo cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Novo Cliente' })).toBeVisible();

  await page.getByLabel('Nome / Razão Social').fill('Cliente Criado E2E');
  await page.getByRole('button', { name: 'Contato', exact: true }).click();
  await page.getByLabel('E-mail Principal').fill('dup@example.com');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText('Possível duplicidade')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Salvar mesmo assim' }).click();

  await expect(page.getByRole('heading', { name: 'Novo Cliente' })).toBeHidden({ timeout: 15000 });
});

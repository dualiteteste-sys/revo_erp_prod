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
    await route.fulfill({
      json: {
        id: 'plan_123',
        name: 'Pro',
        stripe_price_id: 'price_123',
      },
    });
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

test('Cadastro de Clientes/Fornecedores: listar e criar sem erros de console', async ({ page }) => {
  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = route.request().url();
    if (
      url.includes('/rest/v1/rpc/terms_document_current_get') ||
      url.includes('/rest/v1/rpc/terms_acceptance_status_get') ||
      url.includes('/rest/v1/rpc/terms_accept_current')
    ) {
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

  await mockAuthAndEmpresa(page);

  // Partners list/count (v2)
  await page.route('**/rest/v1/rpc/count_partners_v2', async (route) => {
    await route.fulfill({ json: 1 });
  });

  await page.route('**/rest/v1/rpc/list_partners_v2', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'p-1',
          nome: 'Cliente E2E',
          tipo: 'cliente',
          doc_unico: '00000000000191',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/create_update_partner', async (route) => {
    let body: any = {};
    try {
      body = route.request().postDataJSON();
    } catch {
      body = {};
    }
    const nome = body?.p_payload?.pessoa?.nome || 'Novo Cliente';

    await route.fulfill({
      json: {
        id: 'p-2',
        empresa_id: 'empresa-1',
        tipo: 'cliente',
        tipo_pessoa: 'juridica',
        nome,
        doc_unico: null,
        email: null,
        telefone: null,
        inscr_estadual: null,
        isento_ie: false,
        inscr_municipal: null,
        observacoes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pessoa_search: null,
        fantasia: null,
        codigo_externo: null,
        contribuinte_icms: '9',
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
  await expect(page.getByText('Cliente E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Novo' }).click();
  await page.getByRole('menuitem', { name: 'Novo cliente' }).click();

  await expect(page.getByRole('heading', { name: 'Novo Cliente' })).toBeVisible();
  await page.getByLabel('Nome / Razão Social').fill('Cliente Criado E2E');
  await page.getByRole('button', { name: 'Salvar' }).click();

  // Fecha modal após salvar com sucesso
  await expect(page.getByRole('heading', { name: 'Novo Cliente' })).toBeHidden();
});

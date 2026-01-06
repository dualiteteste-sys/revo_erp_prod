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
}

test('Serviços: listar e criar sem erros de console', async ({ page }) => {
  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  await page.route('**/rest/v1/rpc/count_services_for_current_user', async (route) => {
    await route.fulfill({ json: 1 });
  });

  await page.route('**/rest/v1/rpc/list_services_for_current_user_v2', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'srv-1',
          empresa_id: 'empresa-1',
          descricao: 'Serviço E2E',
          codigo: 'SRV-01',
          preco_venda: 120.5,
          unidade: 'H',
          status: 'ativo',
          codigo_servico: null,
          nbs: null,
          nbs_ibpt_required: false,
          descricao_complementar: null,
          observacoes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/create_service_for_current_user', async (route) => {
    let body: any = {};
    try {
      body = route.request().postDataJSON();
    } catch {
      body = {};
    }
    const descricao = body?.payload?.descricao || 'Novo Serviço';
    await route.fulfill({
      json: {
        id: 'srv-2',
        empresa_id: 'empresa-1',
        descricao,
        codigo: body?.payload?.codigo || null,
        preco_venda: body?.payload?.preco_venda || null,
        unidade: body?.payload?.unidade || null,
        status: body?.payload?.status || 'ativo',
        codigo_servico: body?.payload?.codigo_servico || null,
        nbs: body?.payload?.nbs || null,
        nbs_ibpt_required: body?.payload?.nbs_ibpt_required || false,
        descricao_complementar: body?.payload?.descricao_complementar || null,
        observacoes: body?.payload?.observacoes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/services');
  await expect(page.getByRole('heading', { name: 'Serviços' })).toBeVisible();
  await expect(page.getByText('Serviço E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Novo serviço' }).click();
  await expect(page.getByRole('heading', { name: 'Novo Serviço' })).toBeVisible();
  await page.getByLabel('Descrição').fill('Serviço Criado E2E');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Novo Serviço' })).toBeHidden();
});

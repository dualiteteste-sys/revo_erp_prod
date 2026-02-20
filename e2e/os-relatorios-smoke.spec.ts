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

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
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

test('Serviços: relatórios abrem sem erros de console', async ({ page }) => {
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

  await mockAuthAndEmpresa(page);

  await page.route('**/rest/v1/rpc/os_relatorios_resumo', async (route) => {
    await route.fulfill({
      json: {
        periodo: { inicio: '2026-01-01', fim: '2026-01-31' },
        kpis: {
          total_os: 12,
          total_orcamento: 4,
          total_aberta: 3,
          total_concluida: 4,
          total_cancelada: 1,
          faturamento: 12500.5,
          custo_real: 6400,
          margem: 6100.5,
          recebido: 3200,
          a_receber: 9300.5,
        },
        por_status: [
          { status: 'orcamento', qtd: 4, total: 1000, custo: 0 },
          { status: 'aberta', qtd: 3, total: 2300, custo: 500 },
          { status: 'concluida', qtd: 4, total: 12500.5, custo: 6400 },
          { status: 'cancelada', qtd: 1, total: 0, custo: 0 },
        ],
        top_clientes: [
          { cliente_id: 'cli-1', cliente_nome: 'Cliente A', qtd: 3, faturamento: 9000, custo: 4500 },
          { cliente_id: 'cli-2', cliente_nome: 'Cliente B', qtd: 1, faturamento: 3500.5, custo: 1900 },
        ],
        faturamento_mensal: [
          { mes: '2025-12', faturamento: 2000, custo_real: 900, margem: 1100, recebido: 500 },
          { mes: '2026-01', faturamento: 10500.5, custo_real: 5500, margem: 5000.5, recebido: 2700 },
        ],
      },
    });
  });

  await page.route('**/rest/v1/rpc/os_relatorios_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'os-1',
          numero: 10,
          descricao: 'OS Relatório E2E',
          status: 'concluida',
          data_ref: '2026-01-10',
          cliente_nome: 'Cliente A',
          total_geral: 1000,
          custo_real: 400,
          margem: 600,
          total_count: 1,
        },
      ],
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  // Acesso direto evita flakiness por itens com nomes repetidos ("Relatórios") em múltiplos grupos.
  await page.goto('/app/servicos/relatorios');
  await expect(page).toHaveURL(/\/app\/servicos\/relatorios/);

  await expect(page.getByRole('heading', { name: 'Relatórios de Serviços' })).toBeVisible();
  await expect(page.getByText('Top clientes (por faturamento no período)')).toBeVisible();
  await expect(page.getByText('Lista detalhada')).toBeVisible();
  await expect(page.getByText('#10')).toBeVisible();
});

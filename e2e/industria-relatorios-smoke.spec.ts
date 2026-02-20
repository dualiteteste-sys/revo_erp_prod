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

test('Indústria: relatórios abrem sem erros (PCP + rupturas)', async ({ page }) => {
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

  await page.route('**/rest/v1/rpc/pcp_carga_capacidade', async (route) => {
    await route.fulfill({
      json: [
        {
          dia: '2026-01-10',
          centro_trabalho_id: 'ct-1',
          centro_trabalho_nome: 'Prensa',
          capacidade_horas: 8,
          carga_total_horas: 10,
          carga_setup_horas: 1,
          carga_producao_horas: 9,
          carga_em_execucao_horas: 2,
        },
        {
          dia: '2026-01-10',
          centro_trabalho_id: 'ct-2',
          centro_trabalho_nome: 'Solda',
          capacidade_horas: 8,
          carga_total_horas: 6,
          carga_setup_horas: 0.5,
          carga_producao_horas: 5.5,
          carga_em_execucao_horas: 1,
        },
        {
          dia: '2026-01-11',
          centro_trabalho_id: 'ct-1',
          centro_trabalho_nome: 'Prensa',
          capacidade_horas: 8,
          carga_total_horas: 7,
          carga_setup_horas: 0.5,
          carga_producao_horas: 6.5,
          carga_em_execucao_horas: 0,
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/pcp_kpis_execucao', async (route) => {
    await route.fulfill({
      json: [
        {
          periodo_dias: 30,
          ordens_concluidas: 12,
          otif_percent: 91.7,
          lead_time_planejado_horas: 48,
          lead_time_real_horas: 52,
          percentual_refugo: 1.2,
          aderencia_ciclo: 93.5,
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/suprimentos_relatorio_baixo_estoque', async (route) => {
    await route.fulfill({
      json: [
        {
          produto_id: 'p-1',
          nome: 'Parafuso 10mm',
          sku: 'PF10',
          unidade: 'un',
          saldo: 5,
          estoque_min: 20,
          estoque_max: 100,
          sugestao_compra: 95,
          fornecedor_nome: 'Fornecedor A',
        },
        {
          produto_id: 'p-2',
          nome: 'Chapa aço 1mm',
          sku: 'CH1',
          unidade: 'kg',
          saldo: 0,
          estoque_min: 50,
          estoque_max: 200,
          sugestao_compra: 200,
          fornecedor_nome: null,
        },
      ],
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  // Acesso direto evita flakiness de navegação via menu (variações de markup/estado do sidebar).
  await page.goto('/app/industria/relatorios');
  await expect(page).toHaveURL(/\/app\/industria\/relatorios/);

  await expect(page.getByRole('heading', { name: 'Relatórios de Indústria' })).toBeVisible();
  await expect(page.getByText('Rupturas / Baixo estoque')).toBeVisible();
  await expect(page.getByText('Parafuso 10mm')).toBeVisible();
});

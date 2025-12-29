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
    await route.fulfill({ json: { empresa_id: 'empresa-1' } });
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
}

test('RG-04 (Serviços): concluir OS → gerar Conta a Receber (happy path)', async ({ page }) => {
  test.setTimeout(90_000);

  const today = new Date().toISOString().slice(0, 10);

  const osList: any[] = [
    {
      id: 'os-1',
      empresa_id: 'empresa-1',
      numero: 1001,
      cliente_id: 'cli-1',
      descricao: 'Manutenção preventiva',
      status: 'aberta',
      data_inicio: today,
      data_prevista: today,
      hora: '08:00',
      total_itens: 1,
      desconto_valor: 0,
      total_geral: 150,
      forma_recebimento: null,
      condicao_pagamento: null,
      observacoes: null,
      observacoes_internas: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ordem: 1,
      cliente_nome: 'Cliente Teste',
    },
  ];

  const contasReceber: any[] = [];

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    // OS
    if (url.includes('/rest/v1/rpc/list_os_for_current_user')) {
      await route.fulfill({ json: osList });
      return;
    }

    if (url.includes('/rest/v1/rpc/os_set_status_for_current_user')) {
      const body = (await route.request().postDataJSON()) as any;
      const osId = body?.p_os_id;
      const next = body?.p_next;
      if (osId === 'os-1' && next === 'concluida') {
        osList[0] = { ...osList[0], status: 'concluida', updated_at: new Date().toISOString() };
        contasReceber.push({
          id: 'car-1',
          empresa_id: 'empresa-1',
          cliente_id: 'cli-1',
          descricao: `OS #${osList[0].numero}`,
          valor: 150,
          data_vencimento: today,
          status: 'pendente',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          cliente_nome: osList[0].cliente_nome,
          observacoes: null,
          data_pagamento: null,
          valor_pago: null,
        });
      }
      await route.fulfill({ json: osList[0] });
      return;
    }

    // Financeiro - Contas a Receber
    if (url.includes('/rest/v1/rpc/count_contas_a_receber_v2')) {
      await route.fulfill({ json: contasReceber.length });
      return;
    }

    if (url.includes('/rest/v1/rpc/list_contas_a_receber_v2')) {
      await route.fulfill({ json: contasReceber });
      return;
    }

    if (url.includes('/rest/v1/rpc/get_contas_a_receber_summary_v2')) {
      const totalPendente = contasReceber
        .filter((c) => c.status === 'pendente' || c.status === 'vencido')
        .reduce((sum, c) => sum + Number(c.valor), 0);
      await route.fulfill({
        json: [{ total_pendente: totalPendente, total_pago_mes: 0, total_vencido: 0 }],
      });
      return;
    }

    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  // Login
  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  // Concluir OS
  await page.goto('/app/ordens-de-servico');
  await expect(page.getByText('Ordens de Serviço')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Manutenção preventiva')).toBeVisible({ timeout: 15000 });

  await page.getByTitle('Mais ações').click();
  await page.getByRole('menuitem', { name: 'Concluir' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('Status atualizado para “Concluída”.')).toBeVisible();

  // Verificar que o financeiro “enxerga” a origem
  await page.goto('/app/financeiro/contas-a-receber');
  await expect(page.getByRole('heading', { name: 'Contas a Receber' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('OS #1001')).toBeVisible({ timeout: 20000 });
});


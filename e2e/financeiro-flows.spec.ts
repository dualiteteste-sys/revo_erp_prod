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
    await route.fulfill({ json: { empresa_id: 'empresa-1' } });
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
}

test('Financeiro: registrar recebimento e pagamento (fluxo básico)', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);

  const contasReceber = [
    {
      id: 'car-1',
      empresa_id: 'empresa-1',
      cliente_id: 'cli-1',
      descricao: 'OS #10',
      valor: 100,
      data_vencimento: today,
      status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cliente_nome: 'Cliente E2E',
      observacoes: null,
      data_pagamento: null,
      valor_pago: null,
    },
  ];

  const contasPagar = [
    {
      id: 'cp-1',
      empresa_id: 'empresa-1',
      fornecedor_id: 'for-1',
      fornecedor_nome: 'Fornecedor E2E',
      documento_ref: 'NF-123',
      descricao: 'Compra insumos',
      data_emissao: today,
      data_vencimento: today,
      data_pagamento: null,
      valor_total: 250,
      valor_pago: 0,
      multa: 0,
      juros: 0,
      desconto: 0,
      saldo: 250,
      forma_pagamento: 'Pix',
      centro_custo: null,
      categoria: null,
      status: 'aberta',
      observacoes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_count: 1,
    },
  ];

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.includes('/rest/v1/rpc/count_contas_a_receber_v2')) {
      await route.fulfill({ json: contasReceber.length });
      return;
    }

    if (url.includes('/rest/v1/rpc/list_contas_a_receber_v2')) {
      await route.fulfill({ json: contasReceber });
      return;
    }

    if (url.includes('/rest/v1/rpc/get_contas_a_receber_summary_v2')) {
      await route.fulfill({
        json: [
          {
            total_pendente: contasReceber.filter((c) => c.status === 'pendente' || c.status === 'vencido').reduce((s, c) => s + Number(c.valor), 0),
            total_pago_mes: contasReceber.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor_pago || 0), 0),
            total_vencido: contasReceber.filter((c) => c.status === 'vencido').reduce((s, c) => s + Number(c.valor), 0),
          },
        ],
      });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_conta_a_receber_receber')) {
      contasReceber[0] = {
        ...contasReceber[0],
        status: 'pago',
        data_pagamento: today,
        valor_pago: contasReceber[0].valor,
        updated_at: new Date().toISOString(),
      };
      await route.fulfill({ json: contasReceber[0] });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_pagar_list')) {
      await route.fulfill({ json: contasPagar });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_pagar_summary')) {
      await route.fulfill({ json: { abertas: 1, parciais: 0, pagas: 0, vencidas: 0 } });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_conta_pagar_pagar')) {
      contasPagar[0] = {
        ...contasPagar[0],
        status: 'paga',
        data_pagamento: today,
        valor_pago: contasPagar[0].valor_total,
        saldo: 0,
        updated_at: new Date().toISOString(),
      };
      await route.fulfill({ json: contasPagar[0] });
      return;
    }

    // Default: responder vazio para não travar navegação.
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/financeiro/contas-a-receber');
  await expect(page.getByRole('heading', { name: 'Contas a Receber' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar recebimento' }).first().click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Registrar recebimento' })
    .getByRole('button', { name: 'Registrar recebimento' })
    .click();
  await expect(page.getByRole('table').getByText('Pago')).toBeVisible();

  await page.goto('/app/financeiro/contas-a-pagar');
  await expect(page.getByRole('heading', { name: 'Contas a Pagar' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar pagamento' }).first().click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Registrar pagamento' })
    .getByRole('button', { name: 'Registrar pagamento' })
    .click();
  await expect(page.getByRole('table').getByText('Paga')).toBeVisible();
});

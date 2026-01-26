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

test('Financeiro: registrar recebimento e pagamento (fluxo básico)', async ({ page }) => {
  test.setTimeout(60000);
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
    {
      id: 'car-2',
      empresa_id: 'empresa-1',
      cliente_id: 'cli-2',
      descricao: 'Venda #20',
      valor: 50,
      data_vencimento: today,
      status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cliente_nome: 'Cliente E2E 2',
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
    {
      id: 'cp-2',
      empresa_id: 'empresa-1',
      fornecedor_id: 'for-2',
      fornecedor_nome: 'Fornecedor E2E 2',
      documento_ref: 'NF-222',
      descricao: 'Serviço terceirizado',
      data_emissao: today,
      data_vencimento: today,
      data_pagamento: null,
      valor_total: 120,
      valor_pago: 0,
      multa: 0,
      juros: 0,
      desconto: 0,
      saldo: 120,
      forma_pagamento: 'Boleto',
      centro_custo: null,
      categoria: null,
      status: 'aberta',
      observacoes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_count: 2,
    },
  ];

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
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
      const body = (await req.postDataJSON()) as any;
      const id = body?.p_id;
      const idx = contasReceber.findIndex((c) => c.id === id);
      if (idx >= 0) {
        contasReceber[idx] = {
          ...contasReceber[idx],
          status: 'pago',
          data_pagamento: today,
          valor_pago: contasReceber[idx].valor,
          updated_at: new Date().toISOString(),
        };
        await route.fulfill({ json: contasReceber[idx] });
        return;
      }
      await route.fulfill({ json: contasReceber[0] });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_conta_a_receber_cancelar')) {
      const body = (await req.postDataJSON()) as any;
      const id = body?.p_id;
      const idx = contasReceber.findIndex((c) => c.id === id);
      if (idx >= 0) {
        contasReceber[idx] = { ...contasReceber[idx], status: 'cancelado', updated_at: new Date().toISOString() };
        await route.fulfill({ json: contasReceber[idx] });
        return;
      }
      await route.fulfill({ json: contasReceber[0] });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_conta_a_receber_estornar_v2') || url.includes('/rest/v1/rpc/financeiro_conta_a_receber_estornar')) {
      const body = (await req.postDataJSON()) as any;
      const id = body?.p_id;
      const idx = contasReceber.findIndex((c) => c.id === id);
      if (idx >= 0) {
        contasReceber[idx] = {
          ...contasReceber[idx],
          status: 'pendente',
          data_pagamento: null,
          valor_pago: null,
          updated_at: new Date().toISOString(),
        };
        await route.fulfill({ json: contasReceber[idx] });
        return;
      }
      await route.fulfill({ json: contasReceber[0] });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_pagar_list')) {
      await route.fulfill({ json: contasPagar });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_pagar_summary')) {
      await route.fulfill({ json: { abertas: 2, parciais: 0, pagas: 0, vencidas: 0 } });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_conta_pagar_pagar')) {
      const body = (await req.postDataJSON()) as any;
      const id = body?.p_id;
      const idx = contasPagar.findIndex((c) => c.id === id);
      if (idx >= 0) {
        contasPagar[idx] = {
          ...contasPagar[idx],
          status: 'paga',
          data_pagamento: today,
          valor_pago: contasPagar[idx].valor_total,
          saldo: 0,
          updated_at: new Date().toISOString(),
        };
        await route.fulfill({ json: contasPagar[idx] });
        return;
      }
      await route.fulfill({ json: contasPagar[0] });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_conta_pagar_cancelar')) {
      const body = (await req.postDataJSON()) as any;
      const id = body?.p_id;
      const idx = contasPagar.findIndex((c) => c.id === id);
      if (idx >= 0) {
        contasPagar[idx] = { ...contasPagar[idx], status: 'cancelada', updated_at: new Date().toISOString() };
      }
      await route.fulfill({ json: {} });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_conta_pagar_estornar_v2') || url.includes('/rest/v1/rpc/financeiro_conta_pagar_estornar')) {
      const body = (await req.postDataJSON()) as any;
      const id = body?.p_id;
      const idx = contasPagar.findIndex((c) => c.id === id);
      if (idx >= 0) {
        contasPagar[idx] = {
          ...contasPagar[idx],
          status: 'aberta',
          data_pagamento: null,
          valor_pago: 0,
          saldo: contasPagar[idx].valor_total,
          updated_at: new Date().toISOString(),
        };
      }
      await route.fulfill({ json: {} });
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
  await expect(page.getByRole('heading', { name: 'Contas a Receber' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Registrar recebimento' }).first().click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Registrar recebimento' })
    .getByRole('button', { name: 'Registrar recebimento' })
    .click();
  await expect(page.getByRole('table').getByText('Pago')).toBeVisible();

  // Estornar recebimento (volta para pendente)
  await page.getByRole('button', { name: 'Estornar recebimento' }).click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Estornar recebimento' })
    .getByRole('button', { name: 'Estornar' })
    .click();
  await expect(page.getByRole('table').getByText('Pendente')).toBeVisible();

  // Cancelar conta a receber (segunda linha)
  await page.getByRole('button', { name: 'Cancelar' }).last().click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Cancelar conta a receber' })
    .getByRole('button', { name: 'Cancelar' })
    .nth(1)
    .click();
  await expect(page.getByRole('table').getByText('Cancelado')).toBeVisible();

  await page.goto('/app/financeiro/contas-a-pagar');
  await expect(page.getByRole('heading', { name: 'Contas a Pagar' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Registrar pagamento' }).first().click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Registrar pagamento' })
    .getByRole('button', { name: 'Registrar pagamento' })
    .click();
  await expect(page.getByRole('table').getByText('Paga')).toBeVisible();

  // Estornar pagamento (volta para aberta)
  await page.getByRole('button', { name: 'Estornar pagamento' }).click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Estornar pagamento' })
    .getByRole('button', { name: 'Estornar' })
    .click();
  await expect(page.getByRole('table').getByText('Aberta')).toBeVisible();

  // Cancelar conta a pagar (segunda linha)
  await page.getByRole('button', { name: 'Cancelar' }).last().click();
  await page
    .locator('div.fixed.inset-0')
    .filter({ hasText: 'Cancelar conta a pagar' })
    .getByRole('button', { name: 'Cancelar conta' })
    .click();
  await expect(page.getByRole('table').getByText('Cancelada')).toBeVisible();
});

test('Financeiro: tesouraria conciliação (score + conciliar)', async ({ page }) => {
  test.setTimeout(60000);
  const today = new Date().toISOString().slice(0, 10);

  const contas = [
    {
      id: 'cc-1',
      empresa_id: 'empresa-1',
      nome: 'Conta E2E',
      apelido: null,
      banco_codigo: '001',
      banco_nome: 'Banco Teste',
      agencia: '0001',
      conta: '12345',
      digito: '6',
      tipo_conta: 'corrente',
      moeda: 'BRL',
      saldo_inicial: 0,
      data_saldo_inicial: null,
      limite_credito: 0,
      permite_saldo_negativo: false,
      ativo: true,
      padrao_para_pagamentos: false,
      padrao_para_recebimentos: false,
      observacoes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_count: 1,
    },
  ];

  const extratos: any[] = [
    {
      id: 'ext-1',
      data_lancamento: today,
      descricao: 'Pagamento fornecedor ABC',
      documento_ref: 'DOC123',
      tipo_lancamento: 'debito',
      valor: 220,
      saldo_apos_lancamento: null,
      conciliado: false,
      movimentacao_id: null,
      movimentacao_data: null,
      movimentacao_descricao: null,
      movimentacao_valor: null,
      total_count: 1,
    },
  ];

  const movimentacoes: any[] = [
    {
      id: 'mov-1',
      empresa_id: 'empresa-1',
      conta_corrente_id: 'cc-1',
      data_movimento: today,
      data_competencia: null,
      tipo_mov: 'saida',
      valor: 220,
      descricao: 'Pagto fornecedor ABC',
      documento_ref: 'DOC123',
      origem_tipo: null,
      origem_id: null,
      categoria: null,
      centro_custo: null,
      centro_de_custo_id: null,
      conciliado: false,
      observacoes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_count: 2,
    },
    {
      id: 'mov-2',
      empresa_id: 'empresa-1',
      conta_corrente_id: 'cc-1',
      data_movimento: today,
      data_competencia: null,
      tipo_mov: 'saida',
      valor: 180,
      descricao: 'Compra qualquer',
      documento_ref: null,
      origem_tipo: null,
      origem_id: null,
      categoria: null,
      centro_custo: null,
      centro_de_custo_id: null,
      conciliado: false,
      observacoes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_count: 2,
    },
  ];

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_correntes_list')) {
      await route.fulfill({ json: contas });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_extratos_bancarios_list')) {
      await route.fulfill({ json: extratos });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_movimentacoes_list')) {
      await route.fulfill({ json: movimentacoes });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_extratos_bancarios_vincular_movimentacao')) {
      const body = (await req.postDataJSON()) as any;
      const extratoId = body?.p_extrato_id;
      const movId = body?.p_movimentacao_id;
      const extIdx = extratos.findIndex((e) => e.id === extratoId);
      const mov = movimentacoes.find((m) => m.id === movId);
      if (extIdx >= 0 && mov) {
        extratos[extIdx] = {
          ...extratos[extIdx],
          conciliado: true,
          movimentacao_id: mov.id,
          movimentacao_data: mov.data_movimento,
          movimentacao_descricao: mov.descricao,
          movimentacao_valor: mov.valor,
        };
        const movIdx = movimentacoes.findIndex((m) => m.id === movId);
        if (movIdx >= 0) movimentacoes[movIdx] = { ...movimentacoes[movIdx], conciliado: true };
      }
      await route.fulfill({ json: null });
      return;
    }

    if (url.includes('/rest/v1/financeiro_conciliacao_regras')) {
      await route.fulfill({ json: [] });
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

  await page.goto('/app/financeiro/tesouraria');
  await expect(page.getByRole('heading', { name: 'Tesouraria' })).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Conciliação' }).click();
  const contaSelect = page.locator('label:has-text("Conta Corrente")').locator('..').locator('select');
  await contaSelect.selectOption('cc-1');

  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('table').getByRole('button', { name: 'Conciliar', exact: true }).click();

  // Drawer abre em "Títulos" (padrão). Para este cenário, vamos para "Movimentações".
  const drawer = page.locator('div.fixed.inset-0.z-50');
  await drawer.getByRole('button', { name: 'Movimentações' }).click();

  const autoBtn = page.getByRole('button', { name: /Conciliar melhor sugestão/i });
  await expect(autoBtn).toBeVisible();
  await expect(autoBtn).toContainText('Score');
  await autoBtn.click();

  await expect(page.getByText('Conciliação realizada!')).toBeVisible();
  await expect(page.getByRole('table').getByText('Pendente')).not.toBeVisible();
});

test('Financeiro: tesouraria auto-conciliar (página)', async ({ page }) => {
  test.setTimeout(60000);
  const today = new Date().toISOString().slice(0, 10);

  const contas = [
    {
      id: 'cc-1',
      empresa_id: 'empresa-1',
      nome: 'Conta E2E',
      apelido: null,
      banco_codigo: '001',
      banco_nome: 'Banco Teste',
      agencia: '0001',
      conta: '12345',
      digito: '6',
      tipo_conta: 'corrente',
      moeda: 'BRL',
      saldo_inicial: 0,
      data_saldo_inicial: null,
      limite_credito: 0,
      permite_saldo_negativo: false,
      ativo: true,
      padrao_para_pagamentos: false,
      padrao_para_recebimentos: false,
      observacoes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_count: 1,
    },
  ];

  const extratos: any[] = [
    {
      id: 'ext-1',
      data_lancamento: today,
      descricao: 'Pagamento fornecedor ABC',
      documento_ref: 'DOC123',
      tipo_lancamento: 'debito',
      valor: 220,
      saldo_apos_lancamento: null,
      conciliado: false,
      movimentacao_id: null,
      movimentacao_data: null,
      movimentacao_descricao: null,
      movimentacao_valor: null,
      total_count: 1,
    },
  ];

  const movimentacoes: any[] = [
    {
      id: 'mov-1',
      empresa_id: 'empresa-1',
      conta_corrente_id: 'cc-1',
      data_movimento: today,
      data_competencia: null,
      tipo_mov: 'saida',
      valor: 220,
      descricao: 'Pagto fornecedor ABC',
      documento_ref: 'DOC123',
      origem_tipo: null,
      origem_id: null,
      categoria: null,
      centro_custo: null,
      centro_de_custo_id: null,
      conciliado: false,
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

    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_correntes_list')) {
      await route.fulfill({ json: contas });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_extratos_bancarios_list')) {
      await route.fulfill({ json: extratos });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_movimentacoes_list')) {
      await route.fulfill({ json: movimentacoes });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_extratos_bancarios_vincular_movimentacao')) {
      const body = (await req.postDataJSON()) as any;
      const extratoId = body?.p_extrato_id;
      const movId = body?.p_movimentacao_id;
      const extIdx = extratos.findIndex((e) => e.id === extratoId);
      const mov = movimentacoes.find((m) => m.id === movId);
      if (extIdx >= 0 && mov) {
        extratos[extIdx] = {
          ...extratos[extIdx],
          conciliado: true,
          movimentacao_id: mov.id,
          movimentacao_data: mov.data_movimento,
          movimentacao_descricao: mov.descricao,
          movimentacao_valor: mov.valor,
        };
        const movIdx = movimentacoes.findIndex((m) => m.id === movId);
        if (movIdx >= 0) movimentacoes[movIdx] = { ...movimentacoes[movIdx], conciliado: true };
      }
      await route.fulfill({ json: null });
      return;
    }

    if (url.includes('/rest/v1/financeiro_conciliacao_regras')) {
      await route.fulfill({ json: [] });
      return;
    }

    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/financeiro/tesouraria');
  await expect(page.getByRole('heading', { name: 'Tesouraria' })).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Conciliação' }).click();
  const contaSelect = page.locator('label:has-text("Conta Corrente")').locator('..').locator('select');
  await contaSelect.selectOption('cc-1');

  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: /Auto conciliar \(página\)/i }).click();

  await expect(page.getByText(/Auto-conciliação:/i)).toBeVisible();
  await expect(page.getByRole('table').getByText('Pendente')).not.toBeVisible();
});

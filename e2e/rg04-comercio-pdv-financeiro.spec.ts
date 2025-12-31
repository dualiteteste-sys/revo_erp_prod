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
        name: 'Essencial',
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
        plano_mvp: 'servicos',
        max_users: 2,
        servicos_enabled: false,
        industria_enabled: false,
      },
    });
  });
}

test('RG-04 (Comércio): finalizar PDV gera movimento financeiro + baixa de estoque (happy path)', async ({ page }) => {
  test.setTimeout(90_000);

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const pdvPedido = {
    id: 'ped-1',
    numero: 9001,
    status: 'orcamento',
    total_geral: 150,
    data_emissao: today,
    updated_at: nowIso,
  };

  const vendaDetails = {
    id: pdvPedido.id,
    numero: pdvPedido.numero,
    cliente_id: 'cli-1',
    cliente_nome: 'Cliente PDV',
    data_emissao: today,
    data_entrega: null,
    status: pdvPedido.status,
    total_produtos: 150,
    frete: 0,
    desconto: 0,
    total_geral: pdvPedido.total_geral,
    condicao_pagamento: null,
    observacoes: null,
    itens: [
      {
        id: 'it-1',
        pedido_id: pdvPedido.id,
        produto_id: 'prod-1',
        produto_nome: 'Produto PDV',
        quantidade: 1,
        preco_unitario: 150,
        desconto: 0,
        total: 150,
      },
    ],
  };

  let movimentoGerado = false;
  let estoqueBaixado = false;

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    // PDV list (REST)
    if (url.includes('/rest/v1/vendas_pedidos')) {
      await route.fulfill({ json: [pdvPedido] });
      return;
    }

    // Contas correntes (RPC) — service listContasCorrentes espera total_count no 1o item.
    if (url.includes('/rest/v1/rpc/financeiro_contas_correntes_list')) {
      await route.fulfill({
        json: [
          {
            total_count: 1,
            id: 'cc-1',
            empresa_id: 'empresa-1',
            nome: 'Caixa Principal',
            apelido: null,
            banco_codigo: null,
            banco_nome: null,
            agencia: null,
            conta: null,
            digito: null,
            tipo_conta: 'caixa',
            moeda: 'BRL',
            saldo_inicial: 0,
            data_saldo_inicial: null,
            limite_credito: 0,
            permite_saldo_negativo: true,
            ativo: true,
            padrao_para_pagamentos: false,
            padrao_para_recebimentos: true,
            observacoes: null,
            created_at: nowIso,
            updated_at: nowIso,
          },
        ],
      });
      return;
    }

    // Venda details (RPC)
    if (url.includes('/rest/v1/rpc/vendas_get_pedido_details')) {
      await route.fulfill({ json: vendaDetails });
      return;
    }

    // Upsert venda (RPC) — PDV finaliza marcando canal + status concluído
    if (url.includes('/rest/v1/rpc/vendas_upsert_pedido')) {
      const body = (await req.postDataJSON()) as any;
      const payload = body?.p_payload || {};
      if (payload?.id === pdvPedido.id && payload?.status) {
        pdvPedido.status = payload.status;
        pdvPedido.updated_at = new Date().toISOString();
        (vendaDetails as any).status = payload.status;
      }
      await route.fulfill({ json: vendaDetails });
      return;
    }

    // Financeiro movement (RPC)
    if (url.includes('/rest/v1/rpc/financeiro_movimentacoes_upsert')) {
      movimentoGerado = true;
      await route.fulfill({
        json: {
          id: 'mov-1',
          empresa_id: 'empresa-1',
          conta_corrente_id: 'cc-1',
          data_movimento: today,
          tipo_mov: 'entrada',
          valor: pdvPedido.total_geral,
          descricao: `Venda PDV #${pdvPedido.numero}`,
          documento_ref: `PDV-${pdvPedido.numero}`,
          created_at: nowIso,
          updated_at: nowIso,
        },
      });
      return;
    }

    // Estoque movement (RPC)
    if (url.includes('/rest/v1/rpc/suprimentos_registrar_movimento')) {
      estoqueBaixado = true;
      await route.fulfill({ json: {} });
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

  // PDV
  await page.goto('/app/vendas/pdv');
  await expect(page.getByRole('heading', { name: 'PDV' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(`#${pdvPedido.numero}`)).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page.getByText('PDV finalizado (financeiro + estoque).')).toBeVisible({ timeout: 20000 });

  // Reloaded list should reflect new status
  await expect(page.getByText('concluido')).toBeVisible({ timeout: 20000 });

  expect(movimentoGerado).toBeTruthy();
  expect(estoqueBaixado).toBeTruthy();
});


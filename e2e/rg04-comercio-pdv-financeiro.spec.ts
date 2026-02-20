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
  await page.route('**/rest/v1/rpc/empresa_features_get*', async (route) => {
    await route.fulfill({
      json: [
        {
          empresa_id: 'empresa-1',
          revo_send_enabled: false,
          nfe_emissao_enabled: false,
          plano_mvp: 'servicos',
          max_users: 2,
          servicos_enabled: false,
          industria_enabled: false,
        },
      ],
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
    if (
      url.includes('/rest/v1/rpc/terms_document_current_get') ||
      url.includes('/rest/v1/rpc/terms_acceptance_status_get') ||
      url.includes('/rest/v1/rpc/terms_accept_current')
    ) {
      await route.fallback();
      return;
    }


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

    // PDV caixas (novo: multi-caixa). Mantemos um caixa "aberto" para não criar fricção no RG-04.
    if (url.includes('/rest/v1/rpc/vendas_pdv_ensure_default_caixa')) {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.includes('/rest/v1/rpc/vendas_pdv_caixas_list')) {
      await route.fulfill({
        json: [
          {
            id: 'cx-1',
            nome: 'Caixa 1',
            ativo: true,
            sessao_id: 'sess-1',
            sessao_status: 'open',
            opened_at: nowIso,
          },
        ],
      });
      return;
    }

    // PDV list (RPC-first)
    if (url.includes('/rest/v1/rpc/vendas_pdv_pedidos_list')) {
      await route.fulfill({ json: [{ ...pdvPedido, pdv_estornado_at: null }] });
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

    // Finalize PDV (RPC idempotente server-side)
    if (url.includes('/rest/v1/rpc/vendas_pdv_finalize_v2')) {
      movimentoGerado = true;
      estoqueBaixado = true;
      pdvPedido.status = 'concluido';
      pdvPedido.updated_at = new Date().toISOString();
      (vendaDetails as any).status = 'concluido';
      await route.fulfill({ json: { ok: true, pedido_id: pdvPedido.id } });
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

  // Comprovante (modal) abre automaticamente após finalizar
  await expect(page.getByText(`Comprovante PDV #${pdvPedido.numero}`)).toBeVisible({ timeout: 20000 });

  // Imprimir (iframe) não deve bloquear fluxo
  await page.getByRole('button', { name: 'Imprimir' }).click();

  await page.getByText('Fechar').click();

  // Reloaded list should reflect new status
  await expect(page.getByText('concluido')).toBeVisible({ timeout: 20000 });

  expect(movimentoGerado).toBeTruthy();
  expect(estoqueBaixado).toBeTruthy();
});

test('VEN-STA-02: PDV offline-lite enfileira e sincroniza depois (sem duplicar)', async ({ page }) => {
  test.setTimeout(90_000);

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const pdvPedido = {
    id: 'ped-2',
    numero: 9002,
    status: 'orcamento',
    total_geral: 200,
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
    total_produtos: 200,
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
        preco_unitario: 200,
        desconto: 0,
        total: 200,
      },
    ],
  };

  let failFinalize = true;
  let finalizeCalls = 0;

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

    // PDV caixas (novo: multi-caixa). Mantemos um caixa "aberto" para não criar fricção no VEN-STA-02.
    if (url.includes('/rest/v1/rpc/vendas_pdv_ensure_default_caixa')) {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.includes('/rest/v1/rpc/vendas_pdv_caixas_list')) {
      await route.fulfill({
        json: [
          {
            id: 'cx-1',
            nome: 'Caixa 1',
            ativo: true,
            sessao_id: 'sess-1',
            sessao_status: 'open',
            opened_at: nowIso,
          },
        ],
      });
      return;
    }

    if (url.includes('/rest/v1/rpc/vendas_pdv_pedidos_list')) {
      await route.fulfill({ json: [{ ...pdvPedido, pdv_estornado_at: null }] });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_correntes_list')) {
      await route.fulfill({
        json: [
          {
            total_count: 1,
            id: 'cc-1',
            empresa_id: 'empresa-1',
            nome: 'Caixa Principal',
            ativo: true,
            padrao_para_pagamentos: false,
            padrao_para_recebimentos: true,
            created_at: nowIso,
            updated_at: nowIso,
          },
        ],
      });
      return;
    }

    if (url.includes('/rest/v1/rpc/vendas_get_pedido_details')) {
      await route.fulfill({ json: vendaDetails });
      return;
    }

    if (url.includes('/rest/v1/rpc/vendas_pdv_finalize_v2')) {
      finalizeCalls += 1;
      if (failFinalize) {
        await route.fulfill({ status: 503, json: { message: 'Service Unavailable' } });
        return;
      }

      pdvPedido.status = 'concluido';
      pdvPedido.updated_at = new Date().toISOString();
      (vendaDetails as any).status = 'concluido';
      await route.fulfill({ json: { ok: true, pedido_id: pdvPedido.id } });
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

  await page.goto('/app/vendas/pdv');
  await expect(page.getByRole('heading', { name: 'PDV' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(`#${pdvPedido.numero}`)).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page.getByText('Sem conexão: o PDV ficou pendente e será sincronizado automaticamente.')).toBeVisible({
    timeout: 20000,
  });

  // Queue badge
  await expect(page.getByText('pendente', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(finalizeCalls).toBeGreaterThan(0);

  // "volta a internet"
  failFinalize = false;
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByText('Sincronizado: 1 PDV(s).')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('pendente', { exact: true })).toHaveCount(0, { timeout: 20000 });
  await expect(page.getByText('concluido', { exact: true })).toBeVisible({ timeout: 20000 });
});

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
            nome_razao_social: 'Empresa Teste',
            nome_fantasia: 'Fantasia',
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
      json: { id: 'sub_123', empresa_id: 'empresa-1', status: 'active', current_period_end: new Date(Date.now() + 86400000).toISOString(), stripe_price_id: 'price_123' },
    });
  });

  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({ json: { id: 'plan_123', name: 'Essencial', stripe_price_id: 'price_123' } });
  });

  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: 'owner' });
  });

  await page.route('**/rest/v1/rpc/has_permission_for_current_user', async (route) => {
    await route.fulfill({ json: true });
  });

  await page.route('**/rest/v1/empresa_features*', async (route) => {
    await route.fulfill({
      json: { empresa_id: 'empresa-1', revo_send_enabled: false, nfe_emissao_enabled: false, plano_mvp: 'ambos', max_users: 999, servicos_enabled: true, industria_enabled: true },
    });
  });
  await page.route('**/rest/v1/rpc/empresa_features_get*', async (route) => {
    await route.fulfill({
      json: [
        { empresa_id: 'empresa-1', revo_send_enabled: false, nfe_emissao_enabled: false, plano_mvp: 'ambos', max_users: 999, servicos_enabled: true, industria_enabled: true },
      ],
    });
  });
}

test('Vendas: pedido (VEN-01/02) happy path (CRUD + itens + impostos básicos + aprovação)', async ({ page }) => {
  test.setTimeout(90_000);

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const clientHit = { id: 'cli-1', label: 'Cliente E2E', nome: 'Cliente E2E', doc_unico: '00000000000191' };
  const productHit = { id: 'prod-1', descricao: 'Produto E2E', unidade: 'un', preco_venda: 100, type: 'product', codigo: 'SKU-1' };
  const vendedor = { id: 'ven-1', empresa_id: 'empresa-1', nome: 'Vendedor E2E', email: null, telefone: null, comissao_percent: 5, ativo: true, created_at: nowIso, updated_at: nowIso };

  let pedido: any = null;
  let itens: any[] = [];

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (route.request().method() !== 'OPTIONS' && (
      url.includes('/rest/v1/rpc/terms_document_current_get') ||
      url.includes('/rest/v1/rpc/terms_acceptance_status_get') ||
      url.includes('/rest/v1/rpc/terms_accept_current')
    )) {
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

    // Listagem de pedidos
    if (url.includes('/rest/v1/rpc/vendas_list_pedidos')) {
      await route.fulfill({ json: pedido ? [{ ...pedido, total_count: 1 }] : [] });
      return;
    }

    // Autocomplete cliente
    if (url.includes('/rest/v1/rpc/search_clients_for_current_user')) {
      await route.fulfill({ json: [clientHit] });
      return;
    }

    // Autocomplete item (produto)
    if (url.includes('/rest/v1/rpc/search_items_for_os')) {
      await route.fulfill({ json: [productHit] });
      return;
    }

    // Vendedores (RPC-first)
    if (url.includes('/rest/v1/rpc/vendedores_list_full_for_current_empresa')) {
      await route.fulfill({ json: [vendedor] });
      return;
    }

    // Details
    if (url.includes('/rest/v1/rpc/vendas_get_pedido_details')) {
      await route.fulfill({
        json: pedido
          ? {
              ...pedido,
              itens,
            }
          : null,
      });
      return;
    }

    // Upsert
    if (url.includes('/rest/v1/rpc/vendas_upsert_pedido')) {
      const body = (await req.postDataJSON()) as any;
      const payload = body?.p_payload || {};

      if (!pedido) {
        pedido = {
          id: 'ped-1',
          numero: 9002,
          cliente_id: payload.cliente_id,
          cliente_nome: clientHit.nome,
          vendedor_id: payload.vendedor_id ?? null,
          comissao_percent: payload.comissao_percent ?? 0,
          data_emissao: payload.data_emissao || today,
          data_entrega: payload.data_entrega || null,
          status: payload.status || 'orcamento',
          total_produtos: 0,
          frete: payload.frete ?? 0,
          desconto: payload.desconto ?? 0,
          total_geral: 0,
          condicao_pagamento: payload.condicao_pagamento ?? null,
          observacoes: payload.observacoes ?? null,
          created_at: nowIso,
          updated_at: nowIso,
        };
      } else {
        pedido = { ...pedido, ...payload, updated_at: new Date().toISOString() };
      }

      await route.fulfill({ json: { ...pedido, itens } });
      return;
    }

    // Itens
    if (url.includes('/rest/v1/rpc/vendas_manage_item')) {
      const body = (await req.postDataJSON()) as any;
      const action = body?.p_action;

      if (action === 'add') {
        const itemId = `it-${itens.length + 1}`;
        itens.push({
          id: itemId,
          pedido_id: 'ped-1',
          produto_id: 'prod-1',
          produto_nome: productHit.descricao,
          produto_ncm: '1234.56.78',
          produto_cfop: '5102',
          produto_cst: '00',
          produto_csosn: null,
          quantidade: 1,
          preco_unitario: 100,
          desconto: 0,
          total: 100,
        });
      }
      pedido = {
        ...pedido,
        total_produtos: itens.reduce((s, it) => s + Number(it.total || 0), 0),
        total_geral: itens.reduce((s, it) => s + Number(it.total || 0), 0) + Number(pedido?.frete || 0) - Number(pedido?.desconto || 0),
        updated_at: new Date().toISOString(),
      };

      await route.fulfill({ json: {} });
      return;
    }

    // Aprovar
    if (url.includes('/rest/v1/rpc/vendas_aprovar_pedido')) {
      pedido = { ...pedido, status: 'aprovado', updated_at: new Date().toISOString() };
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

  await page.goto('/app/vendas/pedidos');
  await expect(page.getByRole('heading', { name: 'Pedidos de Venda' })).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Novo Pedido' }).click();
  await expect(page.getByText('Dados do Pedido')).toBeVisible({ timeout: 20000 });

  // Selecionar vendedor (opcional)
  await page.getByLabel('Vendedor (opcional)').selectOption(vendedor.id);

  // Selecionar cliente via autocomplete (precisa >= 2 chars)
  await page.getByPlaceholder(/Nome\/CPF\/CNPJ/).fill('Cl');
  await page.getByText(clientHit.nome).click();

  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Pedido criado! Agora adicione os itens.')).toBeVisible({ timeout: 20000 });

  // O fluxo atual fecha o modal ao criar (novo). Reabrir o pedido para adicionar itens.
  // O botão é icon-only; o atributo "title" vira nome acessível.
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByText('Dados do Pedido')).toBeVisible({ timeout: 20000 });

  // Adicionar item via autocomplete
  const itemSearch = page.getByPlaceholder(/Buscar produto ou servi[cç]o/);
  await itemSearch.click();
  await itemSearch.fill('Pr');
  await page.waitForResponse((resp) => resp.url().includes('/rest/v1/rpc/search_items_for_os') && resp.status() === 200);
  // O dropdown é renderizado via portal e pode ficar "fora do viewport" no CI.
  // Evitar flake: aguardar o item existir no DOM e clicar com force.
  const hitButton = page.locator('button', { hasText: productHit.descricao }).first();
  await expect
    .poll(async () => await hitButton.count(), { timeout: 20000 })
    .toBeGreaterThan(0);
  // Alguns selects usam onMouseDown para selecionar (evita blur/re-render).
  await hitButton.dispatchEvent('mousedown');
  // Evitar flake: `locator.click()` pode ficar aguardando "actionability" em portais/renders rápidos.
  // Como já garantimos que existe no DOM, disparamos o evento diretamente.
  await hitButton.dispatchEvent('click');
  await expect(page.getByText('Item adicionado.')).toBeVisible({ timeout: 20000 });

  // Aprovar
  await page.getByRole('button', { name: 'Aprovar Venda' }).click();
  await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(page.getByText('Pedido aprovado com sucesso!')).toBeVisible({ timeout: 20000 });
});

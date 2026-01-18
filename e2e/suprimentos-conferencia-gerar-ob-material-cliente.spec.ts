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
        plano_mvp: 'industria',
        max_users: 2,
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
          plano_mvp: 'industria',
          max_users: 2,
          servicos_enabled: true,
          industria_enabled: true,
        },
      ],
    });
  });
}

test('SUP-04: recebimento (material_cliente) concluído → gerar OB e manter rastreio', async ({ page }) => {
  test.setTimeout(120_000);

  await mockAuthAndEmpresa(page);

  const context = page.context();
  const nowIso = new Date().toISOString();

  const recebimentoId = 'rec-1';
  const clienteId = 'cli-1';
  const produtoId = 'prod-1';
  const fiscalItemId = 'it-fiscal-1';
  const materialClienteId = 'matcli-1';
  const ordemId = 'ord-1';

  await context.route('**/rest/v1/recebimentos*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();

    await route.fulfill({
      json: {
        id: recebimentoId,
        empresa_id: 'empresa-1',
        fiscal_nfe_import_id: 'import-1',
        status: 'concluido',
        classificacao: 'material_cliente',
        cliente_id: clienteId,
        data_recebimento: nowIso,
        responsavel_id: null,
        observacao: null,
        created_at: nowIso,
        updated_at: nowIso,
        fiscal_nfe_imports: {
          chave_acesso: 'NFe123',
          emitente_nome: 'Fornecedor XML',
          emitente_cnpj: '12345678000199',
          numero: '123',
          serie: '1',
          total_nf: 150.5,
          pedido_numero: null,
        },
      },
    });
  });

  await context.route('**/rest/v1/recebimento_itens*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();

    await route.fulfill({
      json: [
        {
          id: 'rec-it-1',
          recebimento_id: recebimentoId,
          fiscal_nfe_item_id: fiscalItemId,
          produto_id: produtoId,
          quantidade_xml: 2,
          quantidade_conferida: 2,
          status: 'ok',
          produtos: { nome: 'Produto Sistema', sku: 'SKU-1', unidade: 'UN' },
          fiscal_nfe_import_items: { xprod: 'Produto XML', cprod: 'P001', ean: 'SEM GTIN', ucom: 'UN' },
        },
      ],
    });
  });

  await context.route('**/rest/v1/rpc/industria_materiais_cliente_find_id', async (route) => {
    await route.fulfill({ json: materialClienteId });
  });

  await context.route('**/rest/v1/rpc/log_app_event', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await context.route('**/rest/v1/rpc/industria_upsert_ordem', async (route) => {
    const body = (await route.request().postDataJSON()) as any;
    const payload = body?.p_payload ?? {};

    expect(payload.tipo_ordem).toBe('beneficiamento');
    expect(payload.cliente_id).toBe(clienteId);
    expect(payload.produto_final_id).toBe(produtoId);
    expect(payload.usa_material_cliente).toBe(true);
    expect(payload.material_cliente_id).toBe(materialClienteId);
    expect(payload.origem_fiscal_nfe_item_id).toBe(fiscalItemId);
    expect(payload.numero_nf).toBe('123');

    await route.fulfill({
      json: {
        id: ordemId,
        empresa_id: 'empresa-1',
        numero: 1001,
        tipo_ordem: 'beneficiamento',
        produto_final_id: produtoId,
        produto_nome: 'Produto Sistema',
        quantidade_planejada: 2,
        unidade: 'UN',
        cliente_id: clienteId,
        cliente_nome: 'Cliente Teste',
        status: 'rascunho',
        prioridade: 0,
        usa_material_cliente: true,
        material_cliente_id: materialClienteId,
        material_cliente_nome: 'Produto XML',
        material_cliente_codigo: 'P001',
        material_cliente_unidade: 'UN',
        documento_ref: 'NF-e 123/1 — NFe123',
        numero_nf: '123',
        pedido_numero: null,
        origem_fiscal_nfe_import_id: 'import-1',
        origem_fiscal_nfe_item_id: fiscalItemId,
        origem_qtd_xml: 2,
        origem_unidade_xml: 'UN',
        created_at: nowIso,
        updated_at: nowIso,
        componentes: [],
        entregas: [],
      },
    });
  });

  await context.route('**/rest/v1/rpc/industria_list_ordens', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Fallback: não deixa chamadas Supabase escaparem para a rede real (evita 401/404 e mantém "Network limpo")
  await context.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    // Deixa os mocks específicos (registrados antes) responderem.
    if (
      url.includes('/rest/v1/user_active_empresa') ||
      url.includes('/rest/v1/empresa_usuarios') ||
      url.includes('/rest/v1/subscriptions') ||
      url.includes('/rest/v1/plans') ||
      url.includes('/rest/v1/empresa_features') ||
      url.includes('/rest/v1/rpc/current_empresa_role') ||
      url.includes('/rest/v1/rpc/has_permission_for_current_user') ||
      url.includes('/rest/v1/recebimentos') ||
      url.includes('/rest/v1/recebimento_itens') ||
      url.includes('/rest/v1/rpc/log_app_event') ||
      url.includes('/rest/v1/rpc/industria_materiais_cliente_find_id') ||
      url.includes('/rest/v1/rpc/industria_upsert_ordem') ||
      url.includes('/rest/v1/rpc/industria_list_ordens')
    ) {
      await route.fallback();
      return;
    }

    // Se algum endpoint não estiver explicitamente mockado acima, devolve shape mínimo.
    const accept = req.headers()['accept'] || '';
    const wantsObject = accept.includes('application/vnd.pgrst.object+json');

    if (url.includes('/rest/v1/rpc/')) {
      await route.fulfill({ json: wantsObject ? {} : null });
      return;
    }

    await route.fulfill({ json: wantsObject ? {} : [] });
  });

  // Login
  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto(`/app/suprimentos/recebimento/${recebimentoId}`);

  await expect(page.getByRole('button', { name: 'Gerar OB(s)' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar OB(s)' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.locator('input[type="checkbox"]').first().check();

  await dialog.getByRole('button', { name: 'Gerar OB(s)' }).click();

  // Confirmação
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog.getByRole('button', { name: 'Gerar OB', exact: true })).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Gerar OB', exact: true }).click();

  await expect(page).toHaveURL(/\/app\/industria\/ordens\?tipo=beneficiamento/);
});

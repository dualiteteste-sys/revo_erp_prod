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
        name: 'Indústria',
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
        max_users: 10,
        servicos_enabled: true,
        industria_enabled: true,
      },
    });
  });
}

test('IND-04: Importar XML (Materiais do Cliente) → auto finalizar recebimento + sync (happy path)', async ({ page }) => {
  test.setTimeout(120_000);

  const nowIso = new Date().toISOString();
  const context = page.context();

  const importId = 'import-1';
  const recebimentoId = 'rec-1';
  const produtoId = 'prod-1';
  const clienteId = 'cli-1';
  const emitenteCnpj = '12345678000199';

  const preview = {
    import: {
      id: importId,
      emitente_nome: 'Cliente XML (Terceiros)',
      emitente_cnpj: emitenteCnpj,
      numero: '123',
      serie: '1',
      total_nf: 150.5,
      chave_acesso: 'NFe123',
    },
    itens: [
      {
        item_id: 'it-fiscal-1',
        n_item: 1,
        cprod: 'P001',
        ean: 'SEM GTIN',
        xprod: 'Material do Cliente',
        ucom: 'UN',
        qcom: 2,
        vuncom: 10,
        vprod: 20,
        match_produto_id: produtoId,
        match_strategy: 'codigo',
      },
    ],
  };

  let recebimentos: any[] = [];
  let recebimentoItens: any[] = [];
  let setClassificacaoSeen = false;
  let finalizarSeen = false;

  await context.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    // RPC: registrar import
    if (url.includes('/rest/v1/rpc/fiscal_nfe_import_register')) {
      await route.fulfill({ json: importId });
      return;
    }

    // RPC: preview (auto match)
    if (url.includes('/rest/v1/rpc/beneficiamento_preview')) {
      await route.fulfill({ json: preview });
      return;
    }

    // RPC: criar recebimento a partir do import
    if (url.includes('/rest/v1/rpc/create_recebimento_from_xml')) {
      recebimentos = [
        {
          id: recebimentoId,
          empresa_id: 'empresa-1',
          fiscal_nfe_import_id: importId,
          status: 'em_conferencia',
          classificacao: null,
          cliente_id: null,
          data_recebimento: nowIso,
          responsavel_id: null,
          observacao: null,
          created_at: nowIso,
          updated_at: nowIso,
          fiscal_nfe_imports: {
            chave_acesso: 'NFe123',
            emitente_nome: 'Cliente XML (Terceiros)',
            emitente_cnpj: emitenteCnpj,
            numero: '123',
            serie: '1',
            total_nf: 150.5,
            pedido_numero: null,
          },
        },
      ];

      recebimentoItens = [
        {
          id: 'rec-it-1',
          recebimento_id: recebimentoId,
          fiscal_nfe_item_id: 'it-fiscal-1',
          produto_id: null,
          quantidade_xml: 2,
          quantidade_conferida: 0,
          status: 'pendente',
          produtos: { nome: 'Produto Interno', sku: 'SKU-1', unidade: 'UN' },
          fiscal_nfe_import_items: { xprod: 'Material do Cliente', cprod: 'P001', ean: 'SEM GTIN', ucom: 'UN' },
        },
      ];

      await route.fulfill({ json: { id: recebimentoId, status: 'created' } });
      return;
    }

    // RPC: procura cliente pelo CNPJ (para auto-finalize material_cliente)
    if (url.includes('/rest/v1/rpc/search_clients_for_current_user')) {
      await route.fulfill({
        json: [{ id: clienteId, label: 'Cliente E2E', nome: 'Cliente E2E', doc_unico: emitenteCnpj }],
      });
      return;
    }

    // RPC: set classificação
    if (url.includes('/rest/v1/rpc/recebimento_set_classificacao')) {
      setClassificacaoSeen = true;
      recebimentos = recebimentos.map((r) =>
        r.id === recebimentoId ? { ...r, classificacao: 'material_cliente', cliente_id: clienteId } : r
      );
      await route.fulfill({ json: { status: 'ok', classificacao: 'material_cliente', cliente_id: clienteId } });
      return;
    }

    // RPC: conferir item
    if (url.includes('/rest/v1/rpc/conferir_item_recebimento')) {
      const body = req.postDataJSON?.() || {};
      const itemId = body?.p_recebimento_item_id;
      const qty = Number(body?.p_quantidade || 0);
      recebimentoItens = recebimentoItens.map((it) =>
        it.id === itemId ? { ...it, quantidade_conferida: qty, status: qty >= it.quantidade_xml ? 'ok' : 'divergente' } : it
      );
      await route.fulfill({ json: null });
      return;
    }

    // RPC: finalizar recebimento
    if (url.includes('/rest/v1/rpc/finalizar_recebimento')) {
      finalizarSeen = true;
      recebimentos = recebimentos.map((r) => (r.id === recebimentoId ? { ...r, status: 'concluido', updated_at: new Date().toISOString() } : r));
      await route.fulfill({
        json: {
          status: 'concluido',
          message: 'Recebimento concluído.',
          materiais_cliente_sync: { status: 'ok', cliente_id: clienteId, upserted: 1 },
        },
      });
      return;
    }

    // REST: recebimento_itens list + update
    if (url.includes('/rest/v1/recebimento_itens')) {
      if (req.method() === 'GET') {
        await route.fulfill({ json: recebimentoItens });
        return;
      }
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON?.() || {};
        const desired = body?.produto_id ?? null;
        const itemId = new URL(url).searchParams.get('id')?.replace('eq.', '') || 'rec-it-1';
        recebimentoItens = recebimentoItens.map((it) => (it.id === itemId ? { ...it, produto_id: desired } : it));
        await route.fulfill({ json: recebimentoItens });
        return;
      }
    }

    // REST: recebimentos get/list
    if (url.includes('/rest/v1/recebimentos')) {
      if (req.method() === 'GET') {
        if (url.includes('id=eq.')) {
          await route.fulfill({ json: recebimentos[0] || null });
          return;
        }
        await route.fulfill({ json: recebimentos });
        return;
      }
    }

    // REST: Materiais do cliente list (refresh no final)
    if (url.includes('/rest/v1/rpc/industria_materiais_cliente_list')) {
      await route.fulfill({ json: [] });
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

  // Abertura
  await page.goto('/app/industria/materiais-cliente');
  await expect(page.getByRole('heading', { name: 'Materiais de Clientes' })).toBeVisible({ timeout: 15000 });

  // Abre modal de import
  await page.getByRole('button', { name: 'Importar XML (NF-e)' }).click();
  const modalHeading = page.getByRole('heading', { name: 'Importar XML (NF-e)' });
  await expect(modalHeading).toBeVisible({ timeout: 15000 });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe>
  <infNFe>
    <ide>
      <nNF>123</nNF>
      <serie>1</serie>
    </ide>
    <emit>
      <CNPJ>${emitenteCnpj}</CNPJ>
      <xNome>Cliente XML (Terceiros)</xNome>
    </emit>
    <det nItem="1">
      <prod>
        <cProd>P001</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>Material do Cliente</xProd>
        <uCom>UN</uCom>
        <qCom>2</qCom>
        <vUnCom>10</vUnCom>
        <vProd>20</vProd>
      </prod>
      <imposto>
        <ICMS>
          <ICMS00>
            <CST>00</CST>
          </ICMS00>
        </ICMS>
      </imposto>
    </det>
    <total>
      <ICMSTot>
        <vProd>20</vProd>
        <vNF>150.50</vNF>
      </ICMSTot>
    </total>
  </infNFe>
</NFe>`;

  await page.setInputFiles('input[type="file"]', {
    name: 'nfe.xml',
    mimeType: 'text/xml',
    buffer: Buffer.from(xml),
  });

  await expect(page.getByText('Resumo da Nota')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Confirmar e Importar' }).click();

  await expect(page.getByText('Vincular Produtos')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Conferir Quantidades' }).click();

  await expect(page.getByText('Conferência de Quantidades')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Concluir e Sincronizar' }).click();

  // Auto-finalize exibe toast e fecha modal.
  await expect(page.getByText('Recebimento concluído e Materiais de Clientes sincronizados.')).toBeVisible({ timeout: 15000 });
  await expect(modalHeading).toBeHidden({ timeout: 15000 });

  expect(setClassificacaoSeen).toBeTruthy();
  expect(finalizarSeen).toBeTruthy();
});

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
        servicos_enabled: true,
        industria_enabled: true,
      },
    });
  });
}

test('SUP-03: importar XML → criar recebimento → finalizar (happy path)', async ({ page }) => {
  test.setTimeout(120_000);

  const nowIso = new Date().toISOString();
  const context = page.context();

  const importId = 'import-1';
  const recebimentoId = 'rec-1';

  const preview = {
    import: {
      id: importId,
      emitente_nome: 'Fornecedor XML',
      emitente_cnpj: '12345678000199',
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
        xprod: 'Produto XML',
        ucom: 'UN',
        qcom: 2,
        vuncom: 10,
        vprod: 20,
        match_produto_id: 'prod-1',
        match_strategy: 'codigo',
      },
    ],
  };

  let recebimentos: any[] = [];
  let recebimentoItens: any[] = [];
  let cancelReqSeen = false;

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
            emitente_nome: 'Fornecedor XML',
            emitente_cnpj: '12345678000199',
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
          produtos: { nome: 'Produto PDV', sku: 'SKU-1', unidade: 'UN' },
          fiscal_nfe_import_items: { xprod: 'Produto XML', cprod: 'P001', ean: 'SEM GTIN', ucom: 'UN' },
        },
      ];

      await route.fulfill({ json: { id: recebimentoId, status: 'created' } });
      return;
    }

    // REST: recebimento_itens list
    if (url.includes('/rest/v1/recebimento_itens')) {
      if (req.method() === 'GET') {
        await route.fulfill({ json: recebimentoItens });
        return;
      }
      if (req.method() === 'PATCH') {
        // updateRecebimentoItemProduct
        const body = (await req.postDataJSON()) as any;
        const produtoId = body?.produto_id ?? null;
        recebimentoItens = recebimentoItens.map((it) => (it.id === 'rec-it-1' ? { ...it, produto_id: produtoId } : it));
        await route.fulfill({ json: recebimentoItens });
        return;
      }
    }

    // RPC: conferir item
    if (url.includes('/rest/v1/rpc/conferir_item_recebimento')) {
      const body = (await req.postDataJSON()) as any;
      const itemId = body?.p_recebimento_item_id;
      const qty = body?.p_quantidade;
      recebimentoItens = recebimentoItens.map((it) =>
        it.id === itemId
          ? { ...it, quantidade_conferida: qty, status: qty >= it.quantidade_xml ? 'ok' : 'divergente' }
          : it
      );
      await route.fulfill({ json: {} });
      return;
    }

    // REST: recebimentos list/get
    if (url.includes('/rest/v1/recebimentos')) {
      if (req.method() === 'GET') {
        const u = new URL(url);
        const idEq = u.searchParams.get('id') || '';
        if (idEq.includes('eq.')) {
          await route.fulfill({ json: recebimentos[0] || null });
          return;
        }
        await route.fulfill({ json: recebimentos });
        return;
      }
    }

    // RPC: finalizar recebimento
    if (url.includes('/rest/v1/rpc/finalizar_recebimento')) {
      recebimentos = recebimentos.map((r) => (r.id === recebimentoId ? { ...r, status: 'concluido', updated_at: new Date().toISOString() } : r));
      await route.fulfill({ json: { status: 'concluido', message: 'Recebimento concluído.' } });
      return;
    }

    // Demais: retorno vazio para manter fluxo estável
    await route.fulfill({ json: [] });
  });

  // RPC: cancelar recebimento (SUP-04) — rota específica para não depender de ordem/prioridade
  await context.route('**/rest/v1/rpc/recebimento_cancelar*', async (route) => {
    cancelReqSeen = true;
    recebimentos = recebimentos.map((r) =>
      r.id === recebimentoId ? { ...r, status: 'cancelado', updated_at: new Date().toISOString() } : r
    );
    await route.fulfill({ json: { status: 'ok' } });
  });

  await mockAuthAndEmpresa(page);

  // Login
  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  // Importar XML (NfeInput)
  await page.goto('/app/nfe-input');
  await expect(page.getByText('Entrada de Beneficiamento (NF-e)')).toBeVisible({ timeout: 15000 });

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<NFe>
  <infNFe Id="NFe123">
    <ide>
      <nNF>123</nNF>
      <serie>1</serie>
      <dhEmi>${nowIso}</dhEmi>
    </ide>
    <emit>
      <CNPJ>12345678000199</CNPJ>
      <xNome>Fornecedor XML</xNome>
    </emit>
    <dest>
      <CNPJ>00000000000191</CNPJ>
      <xNome>Destinatario</xNome>
    </dest>
    <det nItem="1">
      <prod>
        <cProd>P001</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>Produto XML</xProd>
        <NCM>12345678</NCM>
        <CFOP>5102</CFOP>
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
  await page.getByRole('button', { name: 'Salvar Conferência e Criar Recebimento' }).click();

  await expect(page.getByText('Importação Concluída!')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Voltar para Recebimentos' }).click();

  // Listagem de recebimentos
  await expect(page.getByRole('heading', { name: 'Recebimento de Mercadorias' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Fornecedor XML')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Conferir' }).click();

  // Conferência (finalização)
  await expect(page.getByText(/Confer[iê]ncia de Recebimento|Detalhes do Recebimento/)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Finalizar Recebimento' }).click();
  await expect(page.getByText('Recebimento concluído.', { exact: true })).toBeVisible({ timeout: 15000 });

  // Volta e cancela (estorno) — SUP-04
  await page.goto('/app/suprimentos/recebimentos');
  await expect(page.getByRole('heading', { name: 'Recebimento de Mercadorias' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Fornecedor XML')).toBeVisible({ timeout: 15000 });
  await page.getByTitle('Cancelar recebimento (estorno)').click();
  await expect(page.getByText('Cancelar recebimento (estorno)')).toBeVisible({ timeout: 15000 });
  const cancelReq = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/rest/v1/rpc/recebimento_cancelar')
  );
  const cancelRes = page.waitForResponse((r) => r.url().includes('/rest/v1/rpc/recebimento_cancelar'));
  await page.getByRole('button', { name: 'Cancelar recebimento', exact: true }).click();
  await cancelReq;
  await cancelRes;

  expect(cancelReqSeen).toBeTruthy();
});

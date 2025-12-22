import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresa(page: Page) {
  // Auth: login
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

  // Auth: session validation / user fetch
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

  // Empresa ativa
  await page.route('**/rest/v1/user_active_empresa*', async (route) => {
    await route.fulfill({ json: { empresa_id: 'empresa-1' } });
  });

  // Empresas do usuário
  await page.route('**/rest/v1/empresa_usuarios*', async (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get('select') || '';

    // useEmpresaRole() faz `.select('role')...maybeSingle()` e espera OBJETO.
    if (select === 'role' || select.includes('role')) {
      await route.fulfill({ json: { role: 'member' } });
      return;
    }

    // useEmpresas() lista empresas do usuário e espera ARRAY.
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

  // Subscription guard (deixa passar)
  await page.route('**/rest/v1/subscriptions*', async (route) => {
    // Supabase .maybeSingle() costuma pedir objeto
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
    // Supabase .single() pede objeto
    await route.fulfill({
      json: {
        id: 'plan_123',
        name: 'Pro',
        stripe_price_id: 'price_123',
      },
    });
  });
}

test('Beneficiamento: criar OB e gerar operações na Execução', async ({ page }) => {
  let execucaoGerada = false;
  let bomAplicada = false;

  // Fallback primeiro: evita que chamadas não mapeadas batam no Supabase real durante o E2E.
  // (Importante: em Playwright, a rota registrada por último tem prioridade.)
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  // Aceita confirmações (BOM, etc.)
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  // Autocomplete: Cliente
  await page.route('**/rest/v1/rpc/search_clients_for_current_user', async (route) => {
    await route.fulfill({
      json: [
        { id: 'cli-1', label: 'Cliente E2E', nome: 'Cliente E2E', doc_unico: '00000000000191' },
      ],
    });
  });

  // Autocomplete: Produto/Serviço (usado por OP/OB)
  await page.route('**/rest/v1/rpc/search_items_for_os', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'prod-1',
          type: 'product',
          descricao: 'Parafuso M6',
          codigo: 'PARAF-M6',
          preco_venda: 10,
          unidade: 'un',
        },
      ],
    });
  });

  // Materiais do cliente (opcional)
  await page.route('**/rest/v1/rpc/industria_materiais_cliente_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'mat-cli-1',
          cliente_id: 'cli-1',
          cliente_nome: 'Cliente E2E',
          produto_id: 'prod-1',
          produto_nome: 'Parafuso M6',
          codigo_cliente: 'CLI-PARAF-001',
          nome_cliente: 'Parafuso do Cliente M6 (bruto)',
          unidade: 'un',
          ativo: true,
          total_count: 1,
        },
      ],
    });
  });

  // BOM list (auto-abre após salvar OB nova)
  await page.route('**/rest/v1/rpc/industria_bom_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'bom-1',
          produto_final_id: 'prod-1',
          produto_nome: 'Parafuso M6',
          tipo_bom: 'beneficiamento',
          codigo: 'FT-PARAF-M6',
          versao: 1,
          ativo: true,
          padrao_para_producao: false,
          padrao_para_beneficiamento: true,
          data_inicio_vigencia: new Date().toISOString(),
          data_fim_vigencia: null,
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/industria_aplicar_bom_em_ordem_beneficiamento', async (route) => {
    bomAplicada = true;
    await route.fulfill({ json: null });
  });

  // Roteiros (ponta + rosca)
  await page.route('**/rest/v1/rpc/industria_roteiros_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'rot-1',
          produto_id: 'prod-1',
          produto_nome: 'Parafuso M6',
          tipo_bom: 'beneficiamento',
          codigo: 'ROT-PARAF-PR',
          descricao: 'Ponta + Rosca',
          versao: 1,
          ativo: true,
          padrao_para_producao: false,
          padrao_para_beneficiamento: true,
        },
      ],
    });
  });

  // Lista de ordens (página)
  await page.route('**/rest/v1/rpc/industria_list_ordens', async (route) => {
    await route.fulfill({ json: [] });
  });

  // Salvar ordem (criação)
  await page.route('**/rest/v1/rpc/industria_upsert_ordem', async (route) => {
    const body = route.request().postDataJSON?.() as any;
    const roteiroId = body?.p_payload?.roteiro_aplicado_id ?? null;
    await route.fulfill({
      json: {
        id: 'ord-1',
        empresa_id: 'empresa-1',
        numero: 9001,
        tipo_ordem: 'beneficiamento',
        produto_final_id: 'prod-1',
        produto_nome: 'Parafuso M6',
        quantidade_planejada: 5,
        unidade: 'un',
        cliente_id: 'cli-1',
        cliente_nome: 'Cliente E2E',
        status: 'rascunho',
        prioridade: 0,
        data_prevista_inicio: null,
        data_prevista_fim: null,
        data_prevista_entrega: null,
        documento_ref: null,
        observacoes: null,
        usa_material_cliente: false,
        material_cliente_id: null,
        material_cliente_nome: null,
        material_cliente_codigo: null,
        material_cliente_unidade: null,
        roteiro_aplicado_id: roteiroId,
        roteiro_aplicado_desc: roteiroId ? 'ROT-PARAF-PR (v1) - Ponta + Rosca' : null,
        execucao_ordem_id: null,
        execucao_ordem_numero: null,
        execucao_gerada_em: null,
        componentes: [],
        entregas: [],
      },
    });
  });

  // Bridge: gerar execução
  await page.route('**/rest/v1/rpc/industria_ordem_gerar_execucao', async (route) => {
    const body = route.request().postDataJSON?.() as any;
    expect(body?.p_roteiro_id).toBe('rot-1');
    execucaoGerada = true;
    await route.fulfill({
      json: {
        producao_ordem_id: 'prod-ord-1',
        producao_ordem_numero: 500,
        operacoes: 2,
      },
    });
  });

  // Recarregar detalhes após gerar execução
  await page.route('**/rest/v1/rpc/industria_get_ordem_details', async (route) => {
    await route.fulfill({
      json: {
        id: 'ord-1',
        empresa_id: 'empresa-1',
        numero: 9001,
        tipo_ordem: 'beneficiamento',
        produto_final_id: 'prod-1',
        produto_nome: 'Parafuso M6',
        quantidade_planejada: 5,
        unidade: 'un',
        cliente_id: 'cli-1',
        cliente_nome: 'Cliente E2E',
        status: 'rascunho',
        prioridade: 0,
        data_prevista_inicio: null,
        data_prevista_fim: null,
        data_prevista_entrega: null,
        documento_ref: null,
        observacoes: null,
        usa_material_cliente: false,
        material_cliente_id: null,
        material_cliente_nome: null,
        material_cliente_codigo: null,
        material_cliente_unidade: null,
        roteiro_aplicado_id: 'rot-1',
        roteiro_aplicado_desc: 'ROT-PARAF-PR (v1) - Ponta + Rosca',
        execucao_ordem_id: execucaoGerada ? 'prod-ord-1' : null,
        execucao_ordem_numero: execucaoGerada ? 500 : null,
        execucao_gerada_em: execucaoGerada ? new Date().toISOString() : null,
        componentes: bomAplicada
          ? [
              {
                id: 'comp-1',
                ordem_id: 'ord-1',
                produto_id: 'ins-1',
                produto_nome: 'Parafuso bruto (cliente)',
                quantidade_planejada: 5,
                quantidade_consumida: 0,
                unidade: 'un',
                origem: 'bom_padrao',
              },
            ]
          : [],
        entregas: [],
      },
    });
  });

  // Execução: lista de operações
  await page.route('**/rest/v1/rpc/industria_operacoes_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'op-1',
          ordem_id: 'prod-ord-1',
          ordem_numero: 500,
          tipo_ordem: 'beneficiamento',
          produto_nome: 'Parafuso M6',
          cliente_nome: 'Cliente E2E',
          centro_trabalho_id: 'ct-1',
          centro_trabalho_nome: 'CT Ponta',
          status: 'liberada',
          prioridade: 0,
          data_prevista_inicio: new Date().toISOString(),
          data_prevista_fim: null,
          percentual_concluido: 0,
          atrasada: false,
          updated_at: new Date().toISOString(),
        },
        {
          id: 'op-2',
          ordem_id: 'prod-ord-1',
          ordem_numero: 500,
          tipo_ordem: 'beneficiamento',
          produto_nome: 'Parafuso M6',
          cliente_nome: 'Cliente E2E',
          centro_trabalho_id: 'ct-2',
          centro_trabalho_nome: 'CT Rosca',
          status: 'planejada',
          prioridade: 0,
          data_prevista_inicio: new Date().toISOString(),
          data_prevista_fim: null,
          percentual_concluido: 0,
          atrasada: false,
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  // Centros de trabalho (Execução)
  await page.route('**/rest/v1/rpc/industria_centros_trabalho_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'ct-1',
          nome: 'CT Ponta',
          codigo: 'CT-PONTA',
          descricao: null,
          ativo: true,
          capacidade_unidade_hora: 100,
          capacidade_horas_dia: 8,
          tipo_uso: 'beneficiamento',
          tempo_setup_min: 5,
          requer_inspecao_final: false,
        },
        {
          id: 'ct-2',
          nome: 'CT Rosca',
          codigo: 'CT-ROSCA',
          descricao: null,
          ativo: true,
          capacidade_unidade_hora: 100,
          capacidade_horas_dia: 8,
          tipo_uso: 'beneficiamento',
          tempo_setup_min: 5,
          requer_inspecao_final: false,
        },
      ],
    });
  });

  // 1) Login
  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app/);

  // 2) Criar OB via deep-link (abre modal)
  await page.goto('/app/industria/ordens?tipo=beneficiamento&new=1');
  await expect(page.getByRole('heading', { name: 'Nova Ordem de Beneficiamento' }).first()).toBeVisible();

  // 2.1) Cliente
  const clienteInput = page.getByPlaceholder('Nome/CPF/CNPJ...');
  await clienteInput.fill('Cl');
  await page.getByText('Cliente E2E').first().click();

  // Wizard: vai para o passo de Material/Qtd
  await page.getByRole('button', { name: 'Próximo' }).click();

  // 2.2) Produto/Serviço interno (Parafuso)
  const itemInput = page.getByPlaceholder('Buscar produto ou serviço...');
  await itemInput.fill('Par');
  await page.getByText('Parafuso M6').first().click();

  // 2.2.1) Material do cliente (Parafuso bruto)
  const materialInput = page.getByPlaceholder('Buscar material do cliente...');
  await materialInput.click();
  await page.getByText('Parafuso do Cliente M6 (bruto)').first().click();

  // 2.3) Quantidade
  await page.getByLabel('Quantidade Planejada').fill('5');

  // Wizard: vai para o passo de Revisão (Processo)
  await page.getByRole('button', { name: 'Próximo' }).click();

  // Seleciona roteiro (ponta + rosca)
  await page.getByRole('button', { name: 'Selecionar Roteiro' }).click();
  await expect(page.getByRole('heading', { name: 'Selecionar Roteiro de Produção' })).toBeVisible();
  await page.getByText('ROT-PARAF-PR').first().click();
  await expect(page.getByText('ROT-PARAF-PR (v1) - Ponta + Rosca')).toBeVisible();

  // 2.4) Salvar (Wizard)
  await page.getByRole('button', { name: 'Salvar e continuar' }).click();

  // 2.5) BOM auto-abre; aplica FT
  const bomHeading = page.getByRole('heading', { name: 'Selecionar Ficha Técnica (BOM)' });
  await expect(bomHeading).toBeVisible();
  await page.getByRole('button', { name: 'Substituir' }).click();
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(bomHeading).toBeHidden();
  await expect(page.getByText('Parafuso bruto (cliente)')).toBeVisible();

  // 3) Gerar operações e ir para Execução
  await page.getByRole('button', { name: 'Gerar operações' }).click();
  await page.getByRole('button', { name: 'Gerar e abrir Execução' }).click();
  await expect(page).toHaveURL(/\/app\/industria\/execucao/);

  // 4) Validar que operações aparecem (tipo + produto + cliente)
  await expect(page.getByPlaceholder('Buscar por ordem, produto ou cliente...')).toHaveValue('500');
  await expect(page.getByText('beneficiamento').first()).toBeVisible();
  await expect(page.getByText('Parafuso M6').first()).toBeVisible();
  await expect(page.getByText('Cliente E2E').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'CT Ponta' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'CT Rosca' })).toBeVisible();
});

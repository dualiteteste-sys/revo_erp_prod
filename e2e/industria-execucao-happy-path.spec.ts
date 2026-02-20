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

test('IND-02: Execução (iniciar → concluir) sem erros', async ({ page }) => {
  test.setTimeout(90_000);

  const nowIso = new Date().toISOString();

  const centros = [
    {
      id: 'ct-1',
      nome: 'CT Corte',
      codigo: 'CT-001',
      descricao: null,
      ativo: true,
      capacidade_unidade_hora: 100,
      capacidade_horas_dia: 8,
      tipo_uso: 'ambos',
      tempo_setup_min: 10,
      requer_inspecao_final: false,
    },
  ];

  const operacoes: any[] = [
    {
      id: 'op-1',
      ordem_id: 'ord-1',
      ordem_numero: 2001,
      tipo_ordem: 'producao',
      produto_nome: 'Produto Teste',
      cliente_nome: 'Cliente Indústria',
      centro_trabalho_id: 'ct-1',
      centro_trabalho_nome: 'CT Corte',
      status: 'liberada',
      prioridade: 1,
      data_prevista_inicio: nowIso,
      data_prevista_fim: nowIso,
      percentual_concluido: 0,
      atrasada: false,
      updated_at: nowIso,
    },
  ];

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

    if (url.includes('/rest/v1/rpc/industria_centros_trabalho_list')) {
      await route.fulfill({ json: centros });
      return;
    }

    if (url.includes('/rest/v1/rpc/industria_operacoes_list')) {
      await route.fulfill({ json: operacoes });
      return;
    }

    if (url.includes('/rest/v1/rpc/industria_operacao_apontar_execucao')) {
      const body = (await req.postDataJSON()) as any;
      const action = body?.p_acao;
      if (action === 'iniciar') {
        operacoes[0] = { ...operacoes[0], status: 'em_execucao', updated_at: new Date().toISOString() };
      } else if (action === 'concluir') {
        operacoes[0] = { ...operacoes[0], status: 'concluida', percentual_concluido: 100, updated_at: new Date().toISOString() };
      } else if (action === 'pausar') {
        operacoes[0] = { ...operacoes[0], status: 'em_espera', updated_at: new Date().toISOString() };
      }
      await route.fulfill({ json: {} });
      return;
    }

    if (url.includes('/rest/v1/rpc/industria_operacao_update_status')) {
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

  // Execução
  await page.goto('/app/industria/execucao');
  await expect(page.getByRole('heading', { name: 'Execução de Operações' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Produto Teste')).toBeVisible();

  // Iniciar
  await page.getByTitle('Mais ações').click();
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await expect(page.getByText('Operação iniciada.')).toBeVisible();

  // Concluir
  await page.getByTitle('Mais ações').click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await page.getByLabel('Quantidade Boa').fill('10');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Operação concluída.')).toBeVisible();
});

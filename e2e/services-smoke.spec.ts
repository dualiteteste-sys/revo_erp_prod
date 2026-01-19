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

test('Serviços: listar e criar sem erros de console', async ({ page }) => {
  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = route.request().url();
    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  await page.route('**/rest/v1/rpc/count_services_for_current_user', async (route) => {
    await route.fulfill({ json: 1 });
  });

  await page.route('**/rest/v1/rpc/list_services_for_current_user_v2', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'srv-1',
          empresa_id: 'empresa-1',
          descricao: 'Serviço E2E',
          codigo: 'SRV-01',
          preco_venda: 120.5,
          unidade: 'H',
          status: 'ativo',
          codigo_servico: null,
          nbs: null,
          nbs_ibpt_required: false,
          descricao_complementar: null,
          observacoes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/create_service_for_current_user', async (route) => {
    let body: any = {};
    try {
      body = route.request().postDataJSON();
    } catch {
      body = {};
    }
    const descricao = body?.payload?.descricao || 'Novo Serviço';
    await route.fulfill({
      json: {
        id: 'srv-2',
        empresa_id: 'empresa-1',
        descricao,
        codigo: body?.payload?.codigo || null,
        preco_venda: body?.payload?.preco_venda || null,
        unidade: body?.payload?.unidade || null,
        status: body?.payload?.status || 'ativo',
        codigo_servico: body?.payload?.codigo_servico || null,
        nbs: body?.payload?.nbs || null,
        nbs_ibpt_required: body?.payload?.nbs_ibpt_required || false,
        descricao_complementar: body?.payload?.descricao_complementar || null,
        observacoes: body?.payload?.observacoes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/services');
  await expect(page.getByRole('heading', { name: 'Serviços' })).toBeVisible();
  await expect(page.getByText('Serviço E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Novo serviço' }).click();
  await expect(page.getByRole('heading', { name: 'Novo Serviço' })).toBeVisible();
  await page.getByLabel('Descrição').fill('Serviço Criado E2E');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Novo Serviço' })).toBeHidden();
});

test('Serviços > Contratos: gerar agenda de faturamento (MVP2) sem erros', async ({ page }) => {
  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const url = route.request().url();
    if (
      url.includes('/rest/v1/rpc/empresas_list_for_current_user') ||
      url.includes('/rest/v1/rpc/active_empresa_get_for_current_user')
    ) {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  // Partners (clientes) usados no select.
  await page.route('**/rest/v1/rpc/count_partners_v2', async (route) => {
    await route.fulfill({ json: 1 });
  });
  await page.route('**/rest/v1/rpc/list_partners_v2', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'cli-1',
          nome: 'Cliente E2E',
          tipo: 'cliente',
          doc_unico: null,
          email: null,
          telefone: null,
          deleted_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  // Lista de contratos
  await page.route('**/rest/v1/servicos_contratos*', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'ctr-1',
          empresa_id: 'empresa-1',
          cliente_id: 'cli-1',
          numero: 'C-001',
          descricao: 'Contrato E2E',
          valor_mensal: 150,
          status: 'ativo',
          data_inicio: '2026-01-01',
          data_fim: null,
          observacoes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  // Billing rule (sempre retorna uma regra para evitar comportamento de maybeSingle com 0 rows).
  await page.route('**/rest/v1/servicos_contratos_billing_rules*', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      json: {
        id: 'rule-1',
        empresa_id: 'empresa-1',
        contrato_id: 'ctr-1',
        tipo: 'mensal',
        ativo: true,
        valor_mensal: 150,
        dia_vencimento: 5,
        primeira_competencia: '2026-01-01',
        centro_de_custo_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  let scheduleGenerated = false;
  await page.route('**/rest/v1/servicos_contratos_billing_schedule*', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (!scheduleGenerated) {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fulfill({
      json: [
        {
          id: 'sch-1',
          empresa_id: 'empresa-1',
          contrato_id: 'ctr-1',
          rule_id: 'rule-1',
          kind: 'mensal',
          competencia: '2026-01-01',
          data_vencimento: '2026-01-05',
          valor: 150,
          status: 'previsto',
          conta_a_receber_id: null,
          cobranca_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  });

  await page.route('**/rest/v1/rpc/servicos_contratos_billing_generate_schedule', async (route) => {
    scheduleGenerated = true;
    await route.fulfill({ json: { ok: true, inserted: 12, tipo: 'mensal', months_ahead: 12 } });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/servicos/contratos');
  await expect(page.getByRole('heading', { name: 'Contratos (Serviços)' })).toBeVisible();
  await expect(page.getByText('Contrato E2E')).toBeVisible();

  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByRole('heading', { name: 'Contrato', exact: true })).toBeVisible();

  const gerarAgenda = page.getByRole('button', { name: 'Gerar agenda (12 meses)' });
  await expect(gerarAgenda).toBeEnabled();
  await gerarAgenda.click();
  await expect(page.getByRole('cell', { name: '2026-01', exact: true })).toBeVisible();
});

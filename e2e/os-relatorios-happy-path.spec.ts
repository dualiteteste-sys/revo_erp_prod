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
}

test('OS-02: concluir OS e ver refletir nos relatórios', async ({ page }) => {
  test.setTimeout(90_000);

  const today = new Date().toISOString().slice(0, 10);

  const osList: any[] = [
    {
      id: 'os-1',
      empresa_id: 'empresa-1',
      numero: 1001,
      cliente_id: 'cli-1',
      descricao: 'Manutenção preventiva',
      status: 'aberta',
      data_inicio: today,
      data_prevista: today,
      hora: '08:00',
      total_itens: 1,
      desconto_valor: 0,
      total_geral: 150,
      forma_recebimento: null,
      condicao_pagamento: null,
      observacoes: null,
      observacoes_internas: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ordem: 1,
      cliente_nome: 'Cliente Teste',
    },
  ];

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.includes('/rest/v1/rpc/list_os_for_current_user_v2') || url.includes('/rest/v1/rpc/list_os_for_current_user')) {
      await route.fulfill({ json: osList });
      return;
    }

    if (url.includes('/rest/v1/rpc/os_set_status_for_current_user')) {
      const body = (await req.postDataJSON()) as any;
      const osId = body?.p_os_id;
      const next = body?.p_next;
      if (osId === 'os-1' && next === 'concluida') {
        osList[0] = { ...osList[0], status: 'concluida', updated_at: new Date().toISOString() };
      }
      await route.fulfill({ json: osList[0] });
      return;
    }

    if (url.includes('/rest/v1/rpc/os_relatorios_resumo')) {
      const totalOs = osList.length;
      const totalConcluida = osList.filter((o) => o.status === 'concluida').length;
      const totalAberta = osList.filter((o) => o.status === 'aberta').length;
      const faturamento = osList.filter((o) => o.status === 'concluida').reduce((sum, o) => sum + Number(o.total_geral || 0), 0);
      const custo = 0;
      const margem = faturamento - custo;

      await route.fulfill({
        json: {
          periodo: { inicio: today, fim: today },
          kpis: {
            total_os: totalOs,
            total_orcamento: 0,
            total_aberta: totalAberta,
            total_concluida: totalConcluida,
            total_cancelada: 0,
            faturamento,
            custo_real: custo,
            margem,
            recebido: 0,
            a_receber: faturamento,
          },
          por_status: [
            { status: 'aberta', qtd: totalAberta, total: 0, custo: 0 },
            { status: 'concluida', qtd: totalConcluida, total: faturamento, custo: 0 },
          ],
          top_clientes: [
            { cliente_id: 'cli-1', cliente_nome: 'Cliente Teste', qtd: totalConcluida, faturamento, custo: 0 },
          ],
          faturamento_mensal: [
            { mes: today.slice(0, 7), faturamento, custo_real: 0, margem, recebido: 0 },
          ],
        },
      });
      return;
    }

    if (url.includes('/rest/v1/rpc/os_relatorios_list')) {
      const rows = osList.map((o) => ({
        id: o.id,
        numero: o.numero,
        descricao: o.descricao,
        status: o.status,
        data_ref: today,
        cliente_nome: o.cliente_nome,
        total_geral: o.total_geral,
        custo_real: 0,
        margem: Number(o.total_geral || 0),
        total_count: osList.length,
      }));
      await route.fulfill({ json: rows });
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

  // Concluir OS
  await page.goto('/app/ordens-de-servico');
  await expect(page.getByRole('heading', { name: 'Ordens de Serviço' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Manutenção preventiva')).toBeVisible({ timeout: 15000 });

  await page.getByTitle('Mais ações').click();
  await page.getByRole('menuitem', { name: 'Concluir' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('Status atualizado para “Concluída”.')).toBeVisible();

  // Validar relatórios refletindo dados da OS concluída
  await page.goto('/app/servicos/relatorios');
  await expect(page.getByRole('heading', { name: 'Relatórios de Serviços' })).toBeVisible();
  await expect(page.getByText('1 Concluídas')).toBeVisible();
  await expect(page.getByText('#1001')).toBeVisible();
});

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

test('OS: lista e abre modal de criação', async ({ page }) => {
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

  await page.route('**/rest/v1/rpc/list_os_for_current_user*', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'os-1',
          empresa_id: 'empresa-1',
          numero: 1001,
          cliente_id: 'cli-1',
          descricao: 'Manutenção preventiva',
          status: 'aberta',
          data_inicio: '2025-01-02',
          data_prevista: '2025-01-03',
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
      ],
    });
  });

  await page.route('**/rest/v1/rpc/os_set_status_for_current_user', async (route) => {
    const body = (await route.request().postDataJSON()) as any;
    expect(body).toMatchObject({ p_os_id: 'os-1', p_next: 'concluida' });
    await route.fulfill({
      json: {
        id: 'os-1',
        empresa_id: 'empresa-1',
        numero: 1001,
        cliente_id: 'cli-1',
        descricao: 'Manutenção preventiva',
        status: 'concluida',
      },
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/ordens-de-servico');
  await expect(page.getByRole('heading', { name: 'Ordens de Serviço' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Cliente Teste')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Manutenção preventiva')).toBeVisible({ timeout: 15000 });

  await page.getByTitle('Mais ações').click();
  await page.getByRole('menuitem', { name: 'Concluir' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('Status atualizado para “Concluída”.')).toBeVisible();

  await page.getByRole('button', { name: 'Nova O.S.' }).click();
  await expect(page.getByText('Nova Ordem de Serviço')).toBeVisible();
});

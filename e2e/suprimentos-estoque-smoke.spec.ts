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
    await route.fulfill({
      json: [
        {
          role: 'owner',
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
    await route.fulfill({ json: { id: 'plan_123', name: 'Pro', stripe_price_id: 'price_123' } });
  });

  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: 'owner' });
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

test('Suprimentos: Estoque abre, mostra lista e kardex sem erros de console', async ({ page }) => {
  test.setTimeout(60000);
  const now = new Date().toISOString();

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.includes('/rest/v1/rpc/suprimentos_list_posicao_estoque')) {
      await route.fulfill({
        json: [
          {
            produto_id: 'prod-1',
            nome: 'Produto Estoque E2E',
            sku: 'SKU-001',
            unidade: 'un',
            saldo: 120,
            custo_medio: 10.5,
            estoque_min: 20,
            status_estoque: 'ok',
          },
        ],
      });
      return;
    }

    if (url.includes('/rest/v1/rpc/suprimentos_get_kardex')) {
      await route.fulfill({
        json: [
          {
            id: 'mov-1',
            tipo: 'entrada',
            quantidade: 100,
            saldo_anterior: 0,
            saldo_novo: 100,
            documento_ref: 'NF-123',
            observacao: 'Entrada de teste',
            created_at: now,
            usuario_email: 'test@example.com',
          },
          {
            id: 'mov-2',
            tipo: 'saida',
            quantidade: 10,
            saldo_anterior: 100,
            saldo_novo: 90,
            documento_ref: 'OP-1',
            observacao: 'Consumo de teste',
            created_at: now,
            usuario_email: 'test@example.com',
          },
        ],
      });
      return;
    }

    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/suprimentos/estoque');
  await expect(page.getByRole('heading', { name: 'Controle de Estoque' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Produto Estoque E2E')).toBeVisible({ timeout: 15000 });

  await page.getByTitle('Histórico (Kardex)').click();
  await expect(page.getByText('Kardex: Produto Estoque E2E')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('NF-123')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('OP-1')).toBeVisible({ timeout: 15000 });

  expect(errors).toEqual([]);
});

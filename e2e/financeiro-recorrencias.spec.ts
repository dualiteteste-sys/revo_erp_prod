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

test('Financeiro: criar conta a pagar recorrente (mensal) sem erros', async ({ page }) => {
  test.setTimeout(60000);
  const now = new Date();
  const dateToPick = new Date(now.getFullYear(), now.getMonth(), 15);
  const dueISO = dateToPick.toISOString().slice(0, 10);
  const dayOfMonth = '15';

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_pagar_list')) {
      await route.fulfill({ json: [] });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_contas_pagar_summary')) {
      await route.fulfill({ json: { abertas: 0, parciais: 0, pagas: 0, vencidas: 0 } });
      return;
    }

    if (url.includes('/rest/v1/rpc/search_clients_for_current_user')) {
      await route.fulfill({
        json: [
          { id: 'for-1', label: 'Fornecedor E2E', nome: 'Fornecedor E2E', doc_unico: '00000000000191' },
        ],
      });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_recorrencias_upsert')) {
      await route.fulfill({
        json: {
          id: 'rec-1',
          empresa_id: 'empresa-1',
          tipo: 'pagar',
          ativo: true,
          frequencia: 'mensal',
          ajuste_dia_util: 'proximo_dia_util',
          start_date: dueISO,
          end_date: null,
          descricao: 'Conta recorrente E2E',
          fornecedor_id: 'for-1',
          valor_total: 100,
        },
      });
      return;
    }

    if (url.includes('/rest/v1/rpc/financeiro_recorrencias_generate')) {
      await route.fulfill({ json: { status: 'ok', ocorrencias_novas: 12, contas_geradas: 12, contas_reparadas: 0 } });
      return;
    }

    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/financeiro/contas-a-pagar');
  await expect(page.getByRole('heading', { name: 'Contas a Pagar' })).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Nova Conta' }).click();
  await expect(page.getByRole('heading', { name: 'Nova Conta a Pagar' })).toBeVisible();

  await page.getByLabel('Descrição').fill('Conta recorrente E2E');
  await page.getByLabel('Valor Total').fill('10000'); // padrão: sem vírgula

  // Data de vencimento (DatePicker)
  const vencContainer = page.getByText('Data de Vencimento').locator('..');
  await vencContainer.getByRole('button', { name: /Selecione uma data/i }).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  await popover.getByRole('button', { name: new RegExp(`\\b${dayOfMonth}\\b`) }).first().click();

  await page.getByPlaceholder('Buscar fornecedor...').fill('Fo');
  await page.getByText('Fornecedor E2E').click();

  const recorrenciaCard = page.getByText('Conta recorrente').locator('..').locator('..');
  await recorrenciaCard.locator('button[role="switch"]').click();
  await page.getByLabel('Frequência').selectOption('mensal');
  await page.getByLabel('Gerar próximas (ocorrências)').fill('12');

  await page.getByRole('button', { name: 'Salvar Conta' }).click();
  await expect(page.getByText(/Recorrência criada/i)).toBeVisible();
});

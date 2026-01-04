import { test, expect, type Page } from './fixtures';

type PlanKey = 'essencial' | 'pro' | 'max' | 'industria' | 'scale';

function getPlan(): PlanKey {
  const raw = (process.env.E2E_PLAN ?? '').trim().toLowerCase();
  if (raw === 'essencial' || raw === 'pro' || raw === 'max' || raw === 'industria' || raw === 'scale') return raw;
  return 'scale';
}

function featuresForPlan(plan: PlanKey) {
  switch (plan) {
    case 'essencial':
    case 'pro':
    case 'max':
      return { servicos_enabled: true, industria_enabled: false, plano_mvp: 'servicos' as const };
    case 'industria':
    case 'scale':
    default:
      return { servicos_enabled: true, industria_enabled: true, plano_mvp: 'ambos' as const };
  }
}

async function mockAuthAndEmpresa(page: Page, plan: PlanKey) {
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
        status: 'trialing',
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
        stripe_price_id: 'price_123',
        plan_slug: plan.toUpperCase(),
        billing_cycle: 'monthly',
      },
    });
  });

  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({
      json: {
        id: 'plan_123',
        name: plan.toUpperCase(),
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

  const feats = featuresForPlan(plan);
  await page.route('**/rest/v1/empresa_features*', async (route) => {
    await route.fulfill({
      json: {
        empresa_id: 'empresa-1',
        revo_send_enabled: false,
        nfe_emissao_enabled: false,
        plano_mvp: feats.plano_mvp,
        max_users: 999,
        max_nfe_monthly: 999,
        servicos_enabled: feats.servicos_enabled,
        industria_enabled: feats.industria_enabled,
      },
    });
  });
}

async function expectPlanGuardBlocked(page: Page) {
  await expect(page.getByRole('heading', { name: 'Recurso indisponível no plano atual' })).toBeVisible();
}

async function expectPlanGuardNotBlocked(page: Page) {
  await expect(page.getByRole('heading', { name: 'Recurso indisponível no plano atual' })).toHaveCount(0);
}

test('Plan suites: gating por plano (serviços/indústria)', async ({ page }) => {
  const plan = getPlan();

  // Fallback: evita chamadas não mapeadas ao Supabase real (estabiliza o smoke no CI).
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page, plan);

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText('Fantasia E2E')).toBeVisible({ timeout: 15000 });

  // Serviços (sempre habilitado no nosso pricing atual)
  await page.goto('/app/servicos/os');
  await page.waitForLoadState('networkidle');
  await expectPlanGuardNotBlocked(page);

  // Indústria depende do plano
  await page.goto('/app/industria/dashboard');
  await page.waitForLoadState('networkidle');
  const feats = featuresForPlan(plan);
  if (feats.industria_enabled) await expectPlanGuardNotBlocked(page);
  else await expectPlanGuardBlocked(page);
});


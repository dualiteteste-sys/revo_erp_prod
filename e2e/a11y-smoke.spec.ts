import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';

async function assertNoSeriousOrCriticalA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    // Evita ruído de conteúdo fora do app (ex.: overlays não visíveis).
    .include('body')
    .analyze();

  const violations = (results.violations ?? []).filter((v: any) => ['critical', 'serious'].includes(v.impact));
  if (violations.length === 0) return;

  const formatted = violations
    .map((v: any) => {
      const targets = (v.nodes ?? []).flatMap((n: any) => n.target ?? []).join(', ');
      return `- ${v.id} (${v.impact}): ${v.help}\n  targets: ${targets}`;
    })
    .join('\n');

  throw new Error(`A11y violações (critical/serious):\n${formatted}`);
}

test('A11y smoke: landing + login + app shell', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Estabiliza o smoke no CI: evita chamadas reais ao Supabase.
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

  // Sessão inexistente (não autenticado)
  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({ status: 401, json: { error: 'not_authenticated' } });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  await assertNoSeriousOrCriticalA11yViolations(page);

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  await assertNoSeriousOrCriticalA11yViolations(page);

  // Login mockado para testar o app shell com sidebar/layout.
  await page.unroute('**/auth/v1/user');
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
      json: { id: 'user-123', aud: 'authenticated', role: 'authenticated', email: 'test@example.com' },
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
          },
        },
      ],
    });
  });
  await page.route('**/rest/v1/rpc/current_empresa_role', async (route) => {
    await route.fulfill({ json: 'owner' });
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
  await page.route('**/rest/v1/subscriptions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'sub_123',
        empresa_id: 'empresa-1',
        status: 'trialing',
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
        stripe_price_id: 'price_123',
      }),
    });
  });
  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'plan_123', name: 'Pro', stripe_price_id: 'price_123' }),
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  await assertNoSeriousOrCriticalA11yViolations(page);
});

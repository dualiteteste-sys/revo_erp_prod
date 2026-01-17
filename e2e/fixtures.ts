import { test as base, expect, type ConsoleMessage } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, run, testInfo) => {
    const consoleErrors: string[] = [];
    const failedApiResponses: string[] = [];
    const failed401Responses: string[] = [];
    const allowFailedResource503 = testInfo.title.toLowerCase().includes('offline-lite');

    const onConsole = (msg: ConsoleMessage) => {
      // Fail only on console.error. Warnings (ex.: React Router future flags) não devem quebrar E2E.
      if (msg.type() === 'error') {
        const text = msg.text();
        if (allowFailedResource503 && /^Failed to load resource:/i.test(text) && text.includes('503')) return;
        consoleErrors.push(`[console.error] ${text}`);
      }
    };

    const onPageError = (err: Error) => {
      consoleErrors.push(`[pageerror] ${err.message}`);
    };

    const isSupabaseApi = (url: string) =>
      url.includes('/rest/v1/') || url.includes('/auth/v1/') || url.includes('/functions/v1/');

    const onResponse = (response: any) => {
      const url = response.url?.() ?? '';
      if (!url) return;

      const status = response.status?.() ?? 0;
      if (status < 400) return;
      if (allowFailedResource503 && status === 503) return;

      if (status === 401) {
        failed401Responses.push(`[401] ${url}`);
      }

      if (!isSupabaseApi(url)) return;

      const req = response.request?.();
      const method = req?.method?.() ?? 'GET';
      failedApiResponses.push(`[${status}] ${method} ${url}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    // ---------------------------------------------------------------------
    // Global mocks (estado da arte para CI):
    // - Evitar bater em Supabase real via Edge Functions no gate de E2E.
    // - Manter "console limpo" (sem 401/403/5xx inesperados).
    //
    // Observação: Playwright resolve conflitos por ordem de registro (último wins),
    // então specs específicas ainda podem sobrescrever estes mocks.
    // ---------------------------------------------------------------------
    await page.route('**/functions/v1/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      const url = req.url();
      if (url.includes('/billing-invoices')) {
        await route.fulfill({ json: { items: [] } });
        return;
      }
      if (url.includes('/billing-sync-subscription')) {
        await route.fulfill({ json: { synced: false, message: 'noop (e2e mock)' } });
        return;
      }

      await route.fulfill({ json: {} });
    });

    // Billing (RPC-first): evitar depender de `.from('subscriptions'/'plans')` nos specs.
    await page.route('**/rest/v1/rpc/billing_subscription_with_plan_get', async (route) => {
      await route.fulfill({
        json: {
          subscription: {
            id: 'sub_123',
            empresa_id: 'empresa-1',
            status: 'active',
            current_period_end: new Date(Date.now() + 86400000).toISOString(),
            stripe_price_id: 'price_123',
            stripe_subscription_id: 'stripe_sub_123',
            plan_slug: 'SCALE',
            billing_cycle: 'monthly',
            cancel_at_period_end: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          plan: {
            id: 'plan_123',
            slug: 'SCALE',
            name: 'Scale',
            billing_cycle: 'monthly',
            currency: 'BRL',
            amount_cents: 0,
            stripe_price_id: 'price_123',
            active: true,
            created_at: new Date().toISOString(),
          },
        },
      });
    });

    await page.route('**/rest/v1/rpc/billing_plans_public_list', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/rest/v1/rpc/billing_stripe_webhook_events_list', async (route) => {
      await route.fulfill({ json: [] });
    });

    await run(page);

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);

    if (consoleErrors.length > 0) {
      const hint401 = failed401Responses.length > 0
        ? `\n\nPossíveis respostas 401 correlacionadas:\n${[...new Set(failed401Responses)].join('\n')}`
        : '';
      throw new Error(`Erros de console detectados:\n${consoleErrors.join('\n')}${hint401}`);
    }

    if (failedApiResponses.length > 0) {
      throw new Error(`Respostas 4xx/5xx detectadas (Supabase):\n${failedApiResponses.join('\n')}`);
    }
  },
});

export { expect };

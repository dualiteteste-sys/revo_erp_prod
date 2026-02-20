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
    // Hardening: desabilitar Supabase Realtime via WebSocket nos testes E2E.
    // Motivo: o gate exige "console limpo" e o WebSocket pode falhar por
    // instabilidade de rede no runner (não é requisito funcional dos fluxos).
    // ---------------------------------------------------------------------
    await page.addInitScript(() => {
      const OriginalWebSocket = window.WebSocket;
      const isSupabaseRealtime = (url: any) =>
        typeof url === 'string' && url.includes('/realtime/v1/websocket');

      const createNoopWebSocket = (url: string) => {
        const listeners: Record<string, Function[]> = {};

        const ws: any = {
          url,
          readyState: 1,
          bufferedAmount: 0,
          protocol: '',
          extensions: '',
          binaryType: 'blob',
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
          send: () => {},
          close: () => {
            ws.readyState = 3;
            const evt: any = { code: 1000, reason: 'disabled_in_e2e', wasClean: true, type: 'close' };
            (ws.onclose && ws.onclose(evt)) || null;
            (listeners.close || []).forEach((fn) => fn(evt));
          },
          addEventListener: (type: string, cb: Function) => {
            listeners[type] = listeners[type] || [];
            listeners[type].push(cb);
          },
          removeEventListener: (type: string, cb: Function) => {
            listeners[type] = (listeners[type] || []).filter((fn) => fn !== cb);
          },
          dispatchEvent: (evt: any) => {
            (listeners[evt?.type] || []).forEach((fn) => fn(evt));
            return true;
          },
        };

        // Dispara "open" para não travar libs que aguardam conexão.
        setTimeout(() => {
          const evt: any = { type: 'open' };
          (ws.onopen && ws.onopen(evt)) || null;
          (listeners.open || []).forEach((fn) => fn(evt));
        }, 0);

        return ws;
      };

      function PatchedWebSocket(this: any, url: any, protocols?: any) {
        if (isSupabaseRealtime(url)) return createNoopWebSocket(url);
        // @ts-ignore
        return new OriginalWebSocket(url, protocols);
      }

      // Preservar constantes.
      // @ts-ignore
      PatchedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
      // @ts-ignore
      PatchedWebSocket.OPEN = OriginalWebSocket.OPEN;
      // @ts-ignore
      PatchedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
      // @ts-ignore
      PatchedWebSocket.CLOSED = OriginalWebSocket.CLOSED;

      // @ts-ignore
      window.WebSocket = PatchedWebSocket;
    });

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

    // ---------------------------------------------------------------------
    // P0 (Termo de Aceite) — por padrão, os E2E assumem "termo já aceito"
    // para não transformar o gate em um novo requisito em TODOS os specs.
    //
    // Specs que precisam validar o comportamento do termo podem sobrescrever
    // estes handlers com `page.route()` (Playwright: último wins).
    // ---------------------------------------------------------------------
    const termsDoc = {
      key: 'ultria_erp_terms',
      version: '1.0',
      body: 'Termos de Aceite Versão: 1.0\n(Data de teste E2E — conteúdo omitido aqui)\n',
      body_sha256: 'e2e_dummy_sha256',
    };

    await page.route('**/rest/v1/rpc/terms_document_current_get', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({ json: [termsDoc] });
    });

    await page.route('**/rest/v1/rpc/terms_acceptance_status_get', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({
        json: [
          {
            is_accepted: true,
            acceptance_id: 'acceptance-e2e-1',
            accepted_at: new Date().toISOString(),
            version: '1.0',
            document_sha256: termsDoc.body_sha256,
          },
        ],
      });
    });

    await page.route('**/rest/v1/rpc/terms_accept_current', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({
        json: [
          {
            acceptance_id: 'acceptance-e2e-1',
            accepted_at: new Date().toISOString(),
            version: '1.0',
            document_sha256: termsDoc.body_sha256,
          },
        ],
      });
    });

    // ---------------------------------------------------------------------
    // P0 (empresa ativa/contexto) — mocks globais para boot determinístico.
    // Muitos specs instalam um fallback genérico `**/rest/v1/**` e precisam
    // chamar `route.fallback()` para chegar aqui.
    // ---------------------------------------------------------------------
    await page.route('**/rest/v1/rpc/empresas_list_for_current_user', async (route) => {
      await route.fulfill({
        json: [
          {
            id: 'empresa-1',
            nome: 'Empresa Teste E2E',
            razao_social: 'Empresa Teste E2E',
            fantasia: 'Fantasia E2E',
            nome_razao_social: 'Empresa Teste E2E',
            cnpj: '00000000000191',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
    });

    await page.route('**/rest/v1/rpc/active_empresa_get_for_current_user', async (route) => {
      await route.fulfill({ json: 'empresa-1' });
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

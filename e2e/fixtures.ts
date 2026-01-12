import { test as base, expect, type ConsoleMessage } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, run, testInfo) => {
    const consoleErrors: string[] = [];
    const failedApiResponses: string[] = [];
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
      if (!url || !isSupabaseApi(url)) return;

      const status = response.status?.() ?? 0;
      if (status < 400) return;
      if (allowFailedResource503 && status === 503) return;

      const req = response.request?.();
      const method = req?.method?.() ?? 'GET';
      failedApiResponses.push(`[${status}] ${method} ${url}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    await run(page);

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);

    if (consoleErrors.length > 0) {
      throw new Error(`Erros de console detectados:\n${consoleErrors.join('\n')}`);
    }

    if (failedApiResponses.length > 0) {
      throw new Error(`Respostas 4xx/5xx detectadas (Supabase):\n${failedApiResponses.join('\n')}`);
    }
  },
});

export { expect };

import { test as base, expect, type ConsoleMessage } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, run) => {
    const consoleErrors: string[] = [];

    const onConsole = (msg: ConsoleMessage) => {
      // Fail only on console.error. Warnings (ex.: React Router future flags) não devem quebrar E2E.
      if (msg.type() === 'error') {
        consoleErrors.push(`[console.error] ${msg.text()}`);
      }
    };

    const onPageError = (err: Error) => {
      consoleErrors.push(`[pageerror] ${err.message}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    await run(page);

    page.off('console', onConsole);
    page.off('pageerror', onPageError);

    if (consoleErrors.length > 0) {
      throw new Error(`Erros de console detectados:\n${consoleErrors.join('\n')}`);
    }
  },
});

export { expect };

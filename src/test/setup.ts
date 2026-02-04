import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { cleanupTestQueryClients } from './utils';

export const server = setupServer(...handlers);

// Debug helper: prints why the process is still running (open handles).
// Use locally: `VITEST_DEBUG_OPEN_HANDLES=1 yarn vitest --run ...`
if (process.env.VITEST_DEBUG_OPEN_HANDLES) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const whyIsNodeRunning = require('why-is-node-running');
  afterAll(async () => {
    // Let teardowns run first.
    await new Promise((r) => setTimeout(r, 250));
    whyIsNodeRunning();
  });
}

if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverMock implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];

    constructor(
      _callback: IntersectionObserverCallback,
      _options?: IntersectionObserverInit
    ) {}

    disconnect() {}
    observe(_target: Element) {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    unobserve(_target: Element) {}
  }

  (globalThis as any).IntersectionObserver = IntersectionObserverMock;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  cleanupTestQueryClients();
  server.resetHandlers();
});
afterAll(() => server.close());

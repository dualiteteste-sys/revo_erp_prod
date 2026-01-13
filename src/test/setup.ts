import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';
import { beforeAll, afterEach, afterAll } from 'vitest';

export const server = setupServer(...handlers);

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

  // @ts-expect-error - test environment polyfill
  globalThis.IntersectionObserver = IntersectionObserverMock;
}

console.log('[SETUP] Initializing MSW server...');
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

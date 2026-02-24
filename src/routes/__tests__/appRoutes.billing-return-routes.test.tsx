import { describe, expect, it } from 'vitest';
import { appRoutes } from '../app.routes';

function findRoute(path: string) {
  const app = appRoutes.find((route) => route.path === '/app');
  const children = Array.isArray(app?.children) ? app.children : [];
  return children.find((route) => route.path === path);
}

describe('Billing return routes', () => {
  it('exposes Stripe success/cancel routes under /app', () => {
    expect(findRoute('billing/success')).toBeTruthy();
    expect(findRoute('billing/cancel')).toBeTruthy();
  });
});


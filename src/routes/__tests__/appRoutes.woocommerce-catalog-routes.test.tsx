import { describe, expect, it } from 'vitest';
import { appRoutes } from '../app.routes';

function findRoute(path: string) {
  const app = appRoutes.find((route) => route.path === '/app');
  const children = Array.isArray(app?.children) ? app.children : [];
  return children.find((route) => route.path === path);
}

describe('Woo catalog product routes', () => {
  it('exposes import and run routes behind produtos:view', () => {
    const catalog = findRoute('products/woocommerce/catalog');
    const run = findRoute('products/woocommerce/runs/:runId');

    expect((catalog as any)?.element?.props?.permission).toEqual({ domain: 'produtos', action: 'view' });
    expect((run as any)?.element?.props?.permission).toEqual({ domain: 'produtos', action: 'view' });
  });
});

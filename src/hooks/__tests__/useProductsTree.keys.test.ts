import { describe, expect, it } from 'vitest';
import { PRODUCTS_TREE_KEYS } from '../useProductsTree';

describe('PRODUCTS_TREE_KEYS', () => {
  it('variants key includes empresaId to avoid cross-tenant cache reuse', () => {
    expect(PRODUCTS_TREE_KEYS.variants('parent-1', 'empresa-1')).toEqual([
      'productsTree',
      'variants',
      'empresa-1',
      'parent-1',
    ]);
  });

  it('variants key is stable when empresaId is missing', () => {
    expect(PRODUCTS_TREE_KEYS.variants('parent-1', null)).toEqual([
      'productsTree',
      'variants',
      'no-empresa',
      'parent-1',
    ]);
  });
});


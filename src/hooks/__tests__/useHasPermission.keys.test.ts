import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS } from '../useHasPermission';

describe('PERMISSION_KEYS', () => {
  it('includes empresaId and userId to avoid cross-tenant cache reuse', () => {
    expect(
      PERMISSION_KEYS.check({
        module: 'partners',
        action: 'create',
        empresaId: 'empresa-1',
        userId: 'user-1',
      })
    ).toEqual([
      'permission',
      'check',
      {
        module: 'partners',
        action: 'create',
        empresaId: 'empresa-1',
        userId: 'user-1',
      },
    ]);
  });
});


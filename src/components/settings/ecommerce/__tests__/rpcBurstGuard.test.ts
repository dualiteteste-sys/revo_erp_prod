import { describe, expect, it } from 'vitest';
import { createRpcBurstGuard } from '@/components/settings/ecommerce/rpcBurstGuard';

describe('createRpcBurstGuard', () => {
  it('permite chamadas dentro da janela configurada', () => {
    let now = 1000;
    const guard = createRpcBurstGuard({
      now: () => now,
      windowMs: 10000,
      maxCallsPerWindow: 3,
      blockMs: 30000,
    });

    expect(guard.check('rpc:jobs').allowed).toBe(true);
    now += 100;
    expect(guard.check('rpc:jobs').allowed).toBe(true);
    now += 100;
    expect(guard.check('rpc:jobs').allowed).toBe(true);
  });

  it('bloqueia burst e desbloqueia após block window', () => {
    let now = 1000;
    const guard = createRpcBurstGuard({
      now: () => now,
      windowMs: 10000,
      maxCallsPerWindow: 2,
      blockMs: 5000,
    });

    expect(guard.check('rpc:diag').allowed).toBe(true);
    now += 10;
    expect(guard.check('rpc:diag').allowed).toBe(true);
    now += 10;
    const blocked = guard.check('rpc:diag');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    now += 1000;
    expect(guard.check('rpc:diag').allowed).toBe(false);

    now += 15000;
    expect(guard.check('rpc:diag').allowed).toBe(true);
  });
});

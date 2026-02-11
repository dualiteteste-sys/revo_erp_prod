import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFinanceiroSelectionTotals } from '../useFinanceiroSelectionTotals';

describe('useFinanceiroSelectionTotals', () => {
  it('não refaz fetch quando request (conteúdo) não mudou', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => ({ ok: true }));

    const baseRequest = {
      mode: 'explicit' as const,
      ids: ['a'],
      excludedIds: [],
      q: null,
      status: null,
      startDateISO: null,
      endDateISO: null,
    };

    const { rerender } = renderHook(
      ({ request }) =>
        useFinanceiroSelectionTotals({
          enabled: true,
          request,
          fetcher,
          debounceMs: 200,
        }),
      { initialProps: { request: baseRequest } }
    );

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);

    // Simula rerenders com novos objetos/arrays, mas mesmo conteúdo (deve manter estável e não refazer).
    rerender({
      request: {
        ...baseRequest,
        ids: ['a'],
        excludedIds: [],
      },
    });
    rerender({
      request: {
        ...baseRequest,
        ids: ['a'],
        excludedIds: [],
      },
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('refaz fetch quando request muda (após debounce)', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => ({ ok: true }));

    const { rerender } = renderHook(
      ({ ids }) =>
        useFinanceiroSelectionTotals({
          enabled: true,
          request: {
            mode: 'explicit',
            ids,
            excludedIds: [],
            q: null,
            status: null,
            startDateISO: null,
            endDateISO: null,
          },
          fetcher,
          debounceMs: 200,
        }),
      { initialProps: { ids: ['a'] } }
    );

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ ids: ['a', 'b'] });
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('não refaz fetch quando apenas o fetcher muda (mesmo request)', async () => {
    vi.useFakeTimers();
    const fetcher1 = vi.fn(async () => ({ ok: true }));
    const fetcher2 = vi.fn(async () => ({ ok: true }));

    const baseRequest = {
      mode: 'explicit' as const,
      ids: ['a'],
      excludedIds: [],
      q: null,
      status: null,
      startDateISO: null,
      endDateISO: null,
    };

    const { rerender } = renderHook(
      ({ fetcher }) =>
        useFinanceiroSelectionTotals({
          enabled: true,
          request: baseRequest,
          fetcher,
          debounceMs: 200,
        }),
      { initialProps: { fetcher: fetcher1 } }
    );

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(fetcher1).toHaveBeenCalledTimes(1);
    expect(fetcher2).toHaveBeenCalledTimes(0);

    // Troca só o fetcher: não deve disparar novo fetch automaticamente (evita flood em rerender).
    rerender({ fetcher: fetcher2 });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(fetcher1).toHaveBeenCalledTimes(1);
    expect(fetcher2).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });
});

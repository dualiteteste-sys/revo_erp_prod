import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useResultSetSelection } from '../useResultSetSelection';

describe('useResultSetSelection', () => {
  it('explicit: toggleOne e togglePage', () => {
    const { result, rerender } = renderHook(
      ({ pageIds }) =>
        useResultSetSelection({
          pageIds,
          totalMatchingCount: 100,
          filterSignature: 'sig',
          empresaId: 'emp',
        }),
      { initialProps: { pageIds: ['a', 'b', 'c'] } }
    );

    expect(result.current.mode).toBe('explicit');
    expect(result.current.selectedCount).toBe(0);

    act(() => result.current.toggleOne('a'));
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.isSelected('a')).toBe(true);

    act(() => result.current.togglePage());
    expect(result.current.selectedCount).toBe(3);
    expect(result.current.allOnPageSelected).toBe(true);
    expect(result.current.someOnPageSelected).toBe(true);

    rerender({ pageIds: ['d', 'e'] });
    expect(result.current.allOnPageSelected).toBe(false);
    expect(result.current.someOnPageSelected).toBe(false);

    act(() => result.current.togglePage());
    expect(result.current.selectedCount).toBe(5);
  });

  it('all_matching: selectAllMatching + exclusions', () => {
    const { result } = renderHook(() =>
      useResultSetSelection({
        pageIds: ['a', 'b', 'c'],
        totalMatchingCount: 10,
        filterSignature: 'sig',
        empresaId: 'emp',
      })
    );

    act(() => result.current.selectAllMatching());
    expect(result.current.mode).toBe('all_matching');
    expect(result.current.selectedCount).toBe(10);

    act(() => result.current.toggleOne('b'));
    expect(result.current.isSelected('b')).toBe(false);
    expect(result.current.selectedCount).toBe(9);
    expect(result.current.allOnPageSelected).toBe(false);
    expect(result.current.someOnPageSelected).toBe(true);

    act(() => result.current.togglePage());
    // Header em tri-state: quando há itens desmarcados na página, "togglePage" marca todos da página.
    expect(result.current.selectedCount).toBe(10);
    expect(result.current.allOnPageSelected).toBe(true);

    act(() => result.current.togglePage());
    expect(result.current.selectedCount).toBe(7);
    expect(result.current.someOnPageSelected).toBe(false);
  });

  it('auto reset: muda empresa e filtros', () => {
    const onAutoReset = vi.fn();
    const { result, rerender } = renderHook(
      ({ empresaId, filterSignature }) =>
        useResultSetSelection({
          pageIds: ['a', 'b'],
          totalMatchingCount: 2,
          filterSignature,
          empresaId,
          onAutoReset,
        }),
      { initialProps: { empresaId: 'emp1', filterSignature: 'sig1' } }
    );

    act(() => result.current.toggleOne('a'));
    expect(result.current.selectedCount).toBe(1);

    rerender({ empresaId: 'emp2', filterSignature: 'sig1' });
    expect(result.current.selectedCount).toBe(0);
    expect(onAutoReset).toHaveBeenCalledWith('empresa_changed');

    onAutoReset.mockClear();

    act(() => result.current.toggleOne('a'));
    expect(result.current.selectedCount).toBe(1);

    rerender({ empresaId: 'emp2', filterSignature: 'sig2' });
    expect(result.current.selectedCount).toBe(0);
    expect(onAutoReset).toHaveBeenCalledTimes(1);
    expect(onAutoReset).toHaveBeenCalledWith('filters_changed');

    // Com selecao ja limpa, mudanca de filtros nao deve disparar notificacao novamente (evita spam de toasts).
    onAutoReset.mockClear();
    rerender({ empresaId: 'emp2', filterSignature: 'sig3' });
    expect(result.current.selectedCount).toBe(0);
    expect(onAutoReset).not.toHaveBeenCalled();
  });

  it('auto reset: mudanças rápidas de filtros notificam 1x', () => {
    const onAutoReset = vi.fn();
    const { result, rerender } = renderHook(
      ({ filterSignature }) =>
        useResultSetSelection({
          pageIds: ['a', 'b'],
          totalMatchingCount: 2,
          filterSignature,
          empresaId: 'emp',
          onAutoReset,
        }),
      { initialProps: { filterSignature: 'sig1' } }
    );

    act(() => result.current.toggleOne('a'));
    expect(result.current.selectedCount).toBe(1);

    // Simula typing: múltiplas mudanças de filtro antes do estado "limpo" propagar.
    act(() => {
      rerender({ filterSignature: 'sig2' });
      rerender({ filterSignature: 'sig3' });
      rerender({ filterSignature: 'sig4' });
    });

    expect(onAutoReset).toHaveBeenCalledTimes(1);
    expect(onAutoReset).toHaveBeenCalledWith('filters_changed');
    expect(result.current.selectedCount).toBe(0);
  });
});

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useNumericField } from '../useNumericField';

describe('useNumericField', () => {
  it('permite valor negativo quando allowNegative = true', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumericField(0, onChange, { allowNegative: true }));

    act(() => {
      result.current.onChange({ target: { value: '-100,00' } } as any);
    });

    expect(result.current.value).toBe('-100,00');
    expect(onChange).toHaveBeenLastCalledWith(-100);
  });

  it('não aceita sinal negativo quando allowNegative = false', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumericField(0, onChange));

    act(() => {
      result.current.onChange({ target: { value: '-100,00' } } as any);
    });

    expect(result.current.value).toBe('100,00');
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('aceita estado intermediário com apenas "-" quando allowNegative = true', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumericField(0, onChange, { allowNegative: true }));

    act(() => {
      result.current.onChange({ target: { value: '-' } } as any);
    });

    expect(result.current.value).toBe('-');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';
import { describe, it, expect, vi } from 'vitest';

describe('useDebounce', () => {
    it('should return the initial value immediately', () => {
        const { result } = renderHook(() => useDebounce('initial', 500));
        expect(result.current).toBe('initial');
    });

    it('should debounce value updates', async () => {
        vi.useFakeTimers();

        // Setup hook with value 'initial'
        const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
            initialProps: { value: 'initial', delay: 500 },
        });

        // Update value to 'updated'
        rerender({ value: 'updated', delay: 500 });

        // Should still be 'initial' immediately after update
        expect(result.current).toBe('initial');

        // Fast forward time by 200ms (less than delay)
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(result.current).toBe('initial');

        // Fast forward past the delay
        act(() => {
            vi.advanceTimersByTime(301); // 200 + 301 = 501
        });

        // Should now be 'updated'
        expect(result.current).toBe('updated');

        vi.useRealTimers();
    });
});

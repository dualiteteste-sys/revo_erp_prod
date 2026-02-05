import { useCallback, useRef } from 'react';

export function useDeferredAction(delayMs: number = 180) {
  const timeoutRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!timeoutRef.current) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const schedule = useCallback(
    (fn: () => void) => {
      if (typeof window === 'undefined') {
        fn();
        return;
      }
      cancel();
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        fn();
      }, delayMs);
    },
    [cancel, delayMs]
  );

  return { schedule, cancel };
}


import { describe, expect, it } from 'vitest';
import { formatDatePtBR } from '@/lib/dateDisplay';

describe('formatDatePtBR', () => {
  it('renders ISO date-only without timezone shift', () => {
    expect(formatDatePtBR('2025-01-05')).toBe('05/01/2025');
  });

  it('renders datetime using America/Sao_Paulo timezone (midnight boundary)', () => {
    // 00:00Z is 21:00 of the previous day in America/Sao_Paulo (UTC-03)
    expect(formatDatePtBR('2025-01-05T00:00:00Z')).toBe('04/01/2025');
    // 03:00Z is 00:00 in America/Sao_Paulo (same calendar day)
    expect(formatDatePtBR('2025-01-05T03:00:00Z')).toBe('05/01/2025');
  });
});


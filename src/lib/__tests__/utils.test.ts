import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, classNames, formatOrderNumber } from '../utils';

describe('src/lib/utils', () => {
    describe('cn', () => {
        it('merges class names correctly', () => {
            expect(cn('p-4', 'bg-red-500')).toBe('p-4 bg-red-500');
        });

        it('handles conditional classes', () => {
            expect(cn('p-4', false && 'bg-red-500', 'text-white')).toBe('p-4 text-white');
        });

        it('merges tailwind classes (overrides)', () => {
            // tailwind-merge should resolve p-4 + p-8 -> p-8
            expect(cn('p-4', 'p-8')).toBe('p-8');
        });
    });

    describe('formatCurrency', () => {
        it('formats BRL correctly', () => {
            // 1000 cents = 10.00
            // Note: check for non-breaking space (char code 160) which Intl sometimes uses
            const result = formatCurrency(1000);
            expect(result).toMatch(/R\$\s?10,00/);
        });

        it('handles zero', () => {
            expect(formatCurrency(0)).toMatch(/R\$\s?0,00/);
        });
    });

    describe('classNames', () => {
        it('joins truthy values', () => {
            expect(classNames('a', 'b')).toBe('a b');
        });
        it('filters falsy values', () => {
            expect(classNames('a', null, undefined, false, 'b')).toBe('a b');
        });
    });

    describe('formatOrderNumber', () => {
        it('removes non-numeric characters', () => {
            expect(formatOrderNumber('#123')).toBe('123');
            expect(formatOrderNumber('OP-456')).toBe('456');
        });
        it('handles numbers', () => {
            expect(formatOrderNumber(789)).toBe('789');
        });
        it('returns empty string for null/undefined', () => {
            expect(formatOrderNumber(null)).toBe('');
            expect(formatOrderNumber(undefined)).toBe('');
        });
    });
});

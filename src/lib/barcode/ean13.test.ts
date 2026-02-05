import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, isValidEan13 } from './ean13';

describe('ean13', () => {
  it('computes check digit for a known prefix', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
  });

  it('validates a correct EAN-13', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
  });

  it('rejects invalid EAN-13', () => {
    expect(isValidEan13('4006381333932')).toBe(false);
  });

  it('ignores non-digit formatting', () => {
    expect(isValidEan13('400 638 133 393 1')).toBe(true);
  });
});


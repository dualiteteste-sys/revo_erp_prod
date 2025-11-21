import { it, expect, describe } from 'vitest';
import { normalizeProductPayload } from '../products.normalize';

describe('normalizeProductPayload', () => {
  it('should normalize numeric strings with commas to numbers', () => {
    const input = { largura_cm: '10,5', altura_cm: '20,0', comprimento_cm: '30' };
    const output = normalizeProductPayload(input);
    expect(output.largura_cm).toBe(10.5);
    expect(output.altura_cm).toBe(20);
    expect(output.comprimento_cm).toBe(30);
  });

  it('should convert empty strings or whitespace to null', () => {
    const input = { largura_cm: ' ', altura_cm: '', diametro_cm: undefined };
    const output = normalizeProductPayload(input);
    expect(output.largura_cm).toBeNull();
    expect(output.altura_cm).toBeNull();
    expect(output.diametro_cm).toBeNull();
  });

  it('should handle zero correctly', () => {
    const input = { comprimento_cm: '0' };
    const output = normalizeProductPayload(input);
    expect(output.comprimento_cm).toBe(0);
  });

  it('should handle a mix of valid and invalid values', () => {
    const input = {
      largura_cm: '15,7',
      altura_cm: null,
      comprimento_cm: 25,
      diametro_cm: 'invalid',
      peso_bruto_kg: ' 1,234 '
    };
    const output = normalizeProductPayload(input);
    expect(output.largura_cm).toBe(15.7);
    expect(output.altura_cm).toBeNull();
    expect(output.comprimento_cm).toBe(25);
    expect(output.diametro_cm).toBeNull();
    expect(output.peso_bruto_kg).toBe(1.234);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeWooStoreUrl } from '../wooStoreUrl';

describe('normalizeWooStoreUrl', () => {
  it('prefixa https:// quando protocolo ausente', () => {
    const res = normalizeWooStoreUrl('minhaloja.com.br');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.normalized).toBe('https://minhaloja.com.br');
  });

  it('preserva subdiretorio e remove barra final', () => {
    const res = normalizeWooStoreUrl('https://exemplo.com.br/loja/');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.normalized).toBe('https://exemplo.com.br/loja');
  });

  it('remove query e hash', () => {
    const res = normalizeWooStoreUrl('https://exemplo.com.br/loja/?utm=1#x');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.normalized).toBe('https://exemplo.com.br/loja');
  });
});


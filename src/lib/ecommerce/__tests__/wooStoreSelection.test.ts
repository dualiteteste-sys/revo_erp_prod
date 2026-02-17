import { describe, expect, it } from 'vitest';

import { selectPreferredWooStoreId } from '../wooStoreSelection';

describe('selectPreferredWooStoreId', () => {
  it('seleciona a store que bate com a URL preferida normalizada', () => {
    const id = selectPreferredWooStoreId({
      stores: [
        { id: '1', base_url: 'https://old.example.com', status: 'active' },
        { id: '2', base_url: 'https://tudoparatatuagem.com.br', status: 'active' },
      ],
      preferredStoreUrl: 'https://tudoparatatuagem.com.br/',
    });
    expect(id).toBe('2');
  });

  it('cai para a primeira store ativa quando não encontra match', () => {
    const id = selectPreferredWooStoreId({
      stores: [
        { id: 'paused', base_url: 'https://a.example.com', status: 'paused' },
        { id: 'active', base_url: 'https://b.example.com', status: 'active' },
      ],
      preferredStoreUrl: 'https://missing.example.com',
    });
    expect(id).toBe('active');
  });

  it('cai para a primeira store quando nenhuma ativa existe', () => {
    const id = selectPreferredWooStoreId({
      stores: [
        { id: 'first', base_url: 'https://a.example.com', status: 'paused' },
        { id: 'second', base_url: 'https://b.example.com', status: 'error' },
      ],
      preferredStoreUrl: null,
    });
    expect(id).toBe('first');
  });
});


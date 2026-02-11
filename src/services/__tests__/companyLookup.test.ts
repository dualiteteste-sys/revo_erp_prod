import { describe, it, expect } from 'vitest';
import { extractIeFromCnpjWs, normalizeFromBrasilApi, normalizeEnderecoFromCnpjWs } from '@/services/companyLookup';

describe('companyLookup', () => {
  it('normalizeFromBrasilApi mapeia endereço e codigo_municipio_ibge', () => {
    const res = normalizeFromBrasilApi({
      cnpj: '12.345.678/0001-90',
      razao_social: 'ACME LTDA',
      nome_fantasia: 'ACME',
      logradouro: 'Rua X',
      numero: '10',
      complemento: '',
      bairro: 'Centro',
      cep: '01001-000',
      municipio: 'São Paulo',
      uf: 'SP',
      codigo_municipio_ibge: '3550308',
      codigo_pais: '1058',
    });

    expect(res.cnpj).toBe('12345678000190');
    expect(res.razao_social).toBe('ACME LTDA');
    expect(res.endereco?.cidade_codigo_ibge).toBe('3550308');
    expect(res.endereco?.pais_codigo).toBe('1058');
    expect(res.endereco?.pais).toBe('Brasil');
  });

  it('extractIeFromCnpjWs escolhe IE ativa e preferindo UF', () => {
    const payload = {
      estabelecimento: {
        inscricoes_estaduais: [
          { inscricao_estadual: 'ISENTA', estado: { sigla: 'RJ' }, ativo: true },
          { inscricao_estadual: '110.042.490.114', estado: { sigla: 'SP' }, ativo: true },
          { inscricao_estadual: '000', estado: { sigla: 'SP' }, ativo: false },
        ],
      },
    };
    expect(extractIeFromCnpjWs(payload as any, 'SP').inscr_estadual).toBe('110.042.490.114');
    expect(extractIeFromCnpjWs(payload as any, 'MG').inscr_estadual).toBe('ISENTA');
  });

  it('normalizeEnderecoFromCnpjWs mapeia cidade/uf/ibge', () => {
    const res = normalizeEnderecoFromCnpjWs({
      estabelecimento: {
        cep: '01001-000',
        logradouro: 'Rua Y',
        numero: '20',
        complemento: null,
        bairro: 'Bairro',
        cidade: { nome: 'São Paulo', ibge_id: 3550308 },
        estado: { sigla: 'SP' },
        pais: { nome: 'Brasil' },
      },
    } as any);

    expect(res.cidade).toBe('São Paulo');
    expect(res.uf).toBe('SP');
    expect(res.cidade_codigo_ibge).toBe('3550308');
  });
});


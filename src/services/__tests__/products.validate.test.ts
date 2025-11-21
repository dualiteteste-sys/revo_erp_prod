import { it, expect, describe } from 'vitest';
import { validatePackaging } from '../products.validate';

describe('validatePackaging', () => {
  it('should return no errors for a valid pacote_caixa', () => {
    const payload = { tipo_embalagem: 'pacote_caixa', largura_cm: 10, altura_cm: 20, comprimento_cm: 30 };
    const errors = validatePackaging(payload);
    expect(errors).toEqual([]);
  });

  it('should return errors for an invalid pacote_caixa', () => {
    const payload = { tipo_embalagem: 'pacote_caixa', largura_cm: 10, altura_cm: null, comprimento_cm: 20 };
    const errors = validatePackaging(payload);
    expect(errors).toContain('Altura é obrigatória para pacote/caixa.');
    expect(errors.length).toBe(1);
  });

  it('should return multiple errors for pacote_caixa', () => {
    const payload = { tipo_embalagem: 'pacote_caixa', largura_cm: null, altura_cm: null, comprimento_cm: 20 };
    const errors = validatePackaging(payload);
    expect(errors).toContain('Largura é obrigatória para pacote/caixa.');
    expect(errors).toContain('Altura é obrigatória para pacote/caixa.');
    expect(errors.length).toBe(2);
  });

  it('should return no errors for a valid envelope', () => {
    const payload = { tipo_embalagem: 'envelope', largura_cm: 10, comprimento_cm: 20 };
    const errors = validatePackaging(payload);
    expect(errors).toEqual([]);
  });

  it('should return an error for an invalid envelope', () => {
    const payload = { tipo_embalagem: 'envelope', largura_cm: null, comprimento_cm: 20 };
    const errors = validatePackaging(payload);
    expect(errors).toEqual(['Largura é obrigatória para envelope.']);
  });

  it('should return no errors for a valid rolo_cilindro', () => {
    const payload = { tipo_embalagem: 'rolo_cilindro', comprimento_cm: 30, diametro_cm: 10 };
    const errors = validatePackaging(payload);
    expect(errors).toEqual([]);
  });

  it('should return an error for an invalid rolo_cilindro', () => {
    const payload = { tipo_embalagem: 'rolo_cilindro', comprimento_cm: 30, diametro_cm: null };
    const errors = validatePackaging(payload);
    expect(errors).toEqual(['Diâmetro é obrigatório para rolo/cilindro.']);
  });

  it('should return no errors if tipo_embalagem is "outro" or null', () => {
    let errors = validatePackaging({ tipo_embalagem: 'outro' });
    expect(errors).toEqual([]);
    errors = validatePackaging({ tipo_embalagem: null });
    expect(errors).toEqual([]);
  });
});

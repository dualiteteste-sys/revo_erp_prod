export function validatePackaging(p: any): string[] {
  const errors: string[] = [];
  const t = p?.tipo_embalagem ?? null;

  if (t === 'pacote_caixa') {
    if (p.largura_cm     == null) errors.push('Largura é obrigatória para pacote/caixa.');
    if (p.altura_cm      == null) errors.push('Altura é obrigatória para pacote/caixa.');
    if (p.comprimento_cm == null) errors.push('Comprimento é obrigatório para pacote/caixa.');
  } else if (t === 'envelope') {
    if (p.largura_cm     == null) errors.push('Largura é obrigatória para envelope.');
    if (p.comprimento_cm == null) errors.push('Comprimento é obrigatório para envelope.');
  } else if (t === 'rolo_cilindro') {
    if (p.comprimento_cm == null) errors.push('Comprimento é obrigatório para rolo/cilindro.');
    if (p.diametro_cm    == null) errors.push('Diâmetro é obrigatório para rolo/cilindro.');
  }
  return errors;
}

export function validateProductCore(p: any): string[] {
  const errors: string[] = [];

  const sku = String(p?.sku ?? '').trim();
  const unidade = String(p?.unidade ?? '').trim();
  if (!sku) errors.push('SKU é obrigatório.');
  if (!unidade) errors.push('Unidade é obrigatória (ex.: un, kg, m).');

  const digitsOnly = (v: any) => String(v ?? '').replace(/\D/g, '');

  const ncm = digitsOnly(p?.ncm);
  if (ncm && ncm.length !== 8) errors.push('NCM deve ter 8 dígitos (somente números).');

  const cest = digitsOnly(p?.cest);
  if (cest && cest.length !== 7) errors.push('CEST deve ter 7 dígitos (somente números).');

  const cfop = digitsOnly(p?.cfop_padrao);
  if (cfop && cfop.length !== 4) errors.push('CFOP padrão deve ter 4 dígitos.');

  const cst = digitsOnly(p?.cst_padrao);
  if (cst && cst.length !== 2) errors.push('CST padrão deve ter 2 dígitos.');

  const csosn = digitsOnly(p?.csosn_padrao);
  if (csosn && csosn.length !== 3) errors.push('CSOSN padrão deve ter 3 dígitos.');

  return errors;
}

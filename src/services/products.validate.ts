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

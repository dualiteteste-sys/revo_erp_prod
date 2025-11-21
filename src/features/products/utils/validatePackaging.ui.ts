export function uiValidatePackaging(p: any): string[] {
  const errors: string[] = [];
  const t = p?.tipo_embalagem ?? null;
  const isNull = (v: any) => v === null || v === undefined;

  if (t === 'pacote_caixa') {
    if (isNull(p.largura_cm)) errors.push('largura_cm');
    if (isNull(p.altura_cm)) errors.push('altura_cm');
    if (isNull(p.comprimento_cm)) errors.push('comprimento_cm');
  } else if (t === 'envelope') {
    if (isNull(p.largura_cm)) errors.push('largura_cm');
    if (isNull(p.comprimento_cm)) errors.push('comprimento_cm');
  } else if (t === 'rolo_cilindro') {
    if (isNull(p.comprimento_cm)) errors.push('comprimento_cm');
    if (isNull(p.diametro_cm)) errors.push('diametro_cm');
  }
  return errors;
}

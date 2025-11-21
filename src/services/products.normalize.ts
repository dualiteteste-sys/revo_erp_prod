type NumIn = number | string | null | undefined;

function toNumberOrNull(v: NumIn): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeProductPayload(input: any) {
  const out = { ...input };

  // campos de embalagem (nomes reais do banco)
  out.tipo_embalagem = out.tipo_embalagem ? String(out.tipo_embalagem).trim() : null;

  out.largura_cm     = toNumberOrNull(out.largura_cm);
  out.altura_cm      = toNumberOrNull(out.altura_cm);
  out.comprimento_cm = toNumberOrNull(out.comprimento_cm);
  out.diametro_cm    = toNumberOrNull(out.diametro_cm);

  // pesos (são nullable no banco; normalize mesmo assim)
  out.peso_liquido_kg = toNumberOrNull(out.peso_liquido_kg);
  out.peso_bruto_kg   = toNumberOrNull(out.peso_bruto_kg);

  // Garantir que campos booleanos obrigatórios tenham um valor
  out.controlar_lotes = out.controlar_lotes ?? false;

  return out;
}

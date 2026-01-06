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

  const digitsOnly = (v: any) => String(v ?? '').replace(/\D/g, '');

  out.nome = out.nome ? String(out.nome).trim() : out.nome;
  out.sku = (() => {
    const v = out.sku != null ? String(out.sku).trim() : '';
    return v ? v : null;
  })();
  out.unidade = (() => {
    const v = out.unidade != null ? String(out.unidade).trim() : '';
    return v ? v : null;
  })();

  out.ncm = (() => {
    const v = digitsOnly(out.ncm);
    return v ? v : null;
  })();
  out.cest = (() => {
    const v = digitsOnly(out.cest);
    return v ? v : null;
  })();

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

  // Defaults fiscais (opcionais) para NF-e
  out.cfop_padrao = (() => {
    const v = digitsOnly(out.cfop_padrao);
    return v ? v : null;
  })();
  out.cst_padrao = (() => {
    const v = digitsOnly(out.cst_padrao);
    return v ? v : null;
  })();
  out.csosn_padrao = (() => {
    const v = digitsOnly(out.csosn_padrao);
    return v ? v : null;
  })();

  return out;
}

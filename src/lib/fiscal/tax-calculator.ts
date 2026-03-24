/**
 * Frontend tax calculator mirroring backend fiscal_nfe_calcular_impostos (motor v1).
 *
 * Pure function — zero side effects, fully testable.
 * Output structure matches the backend impostos JSONB exactly.
 */

// ── Types ────────────────────────────────────────────────────────────

export type NaturezaFiscalConfig = {
  cfop_dentro_uf: string | null;
  cfop_fora_uf: string | null;
  icms_cst: string | null;
  icms_csosn: string | null;
  icms_aliquota: number;
  icms_reducao_base: number;
  codigo_beneficio_fiscal: string | null;
  pis_cst: string | null;
  pis_aliquota: number;
  cofins_cst: string | null;
  cofins_aliquota: number;
  ipi_cst: string | null;
  ipi_aliquota: number;
};

export type TaxContext = {
  isRegimeNormal: boolean; // CRT === 3
  isIntrastate: boolean;   // emitter UF === dest UF
};

export type TaxItemInput = {
  quantidade: number;
  valor_unitario: number;
  valor_desconto: number;
};

export type ImpostosIcms = {
  cst: string | null;
  csosn: string | null;
  origem: string;
  base_calculo: number;
  aliquota: number;
  valor: number;
  reducao_base: number;
};

export type ImpostosTributo = {
  cst: string;
  base_calculo: number;
  aliquota: number;
  valor: number;
};

export type CalculatedImpostos = {
  icms: ImpostosIcms;
  pis: ImpostosTributo;
  cofins: ImpostosTributo;
  ipi?: ImpostosTributo;
  total: number;
};

export type ItemTaxResult = {
  cfop: string;
  cst: string;
  csosn: string;
  codigo_beneficio_fiscal: string;
  impostos: CalculatedImpostos;
};

// ── Helpers ──────────────────────────────────────────────────────────

/** Round to 2 decimal places — matches backend ROUND(..., 2). */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Main calculator ──────────────────────────────────────────────────

/**
 * Calculate taxes for a single NF-e item.
 *
 * Logic mirrors backend fiscal_motor_tributario v1:
 *   base = qty * unit_price - discount
 *   ICMS: base * (1 - reducao/100) * aliquota/100  (only if CRT=3)
 *   PIS:  base * pis_aliquota/100
 *   COFINS: base * cofins_aliquota/100
 *   IPI:  base * ipi_aliquota/100  (only if ipi_cst not null)
 *   CFOP: cfop_dentro_uf if intrastate, cfop_fora_uf if interstate
 */
export function calculateItemTax(
  item: TaxItemInput,
  nat: NaturezaFiscalConfig,
  ctx: TaxContext,
): ItemTaxResult {
  const base = Math.max(0, item.quantidade * item.valor_unitario - (item.valor_desconto || 0));

  // ICMS
  const icmsBase = nat.icms_reducao_base > 0
    ? base * (1 - nat.icms_reducao_base / 100)
    : base;
  const icmsVal = ctx.isRegimeNormal
    ? icmsBase * (nat.icms_aliquota || 0) / 100
    : 0;

  // PIS
  const pisVal = base * (nat.pis_aliquota || 0) / 100;

  // COFINS
  const cofVal = base * (nat.cofins_aliquota || 0) / 100;

  // IPI — only if ipi_cst is defined
  const hasIpi = nat.ipi_cst != null && nat.ipi_cst !== '' && (nat.ipi_aliquota || 0) > 0;
  const ipiVal = hasIpi ? base * nat.ipi_aliquota / 100 : 0;

  // Total: only IPI adds to NF-e total (PIS/COFINS/ICMS already in product value)
  const totalImp = ipiVal;

  // CFOP — intra vs inter state
  const cfop = ctx.isIntrastate
    ? (nat.cfop_dentro_uf || nat.cfop_fora_uf || '')
    : (nat.cfop_fora_uf || nat.cfop_dentro_uf || '');

  // CST / CSOSN — depends on regime
  const cst = ctx.isRegimeNormal ? (nat.icms_cst || '') : '';
  const csosn = !ctx.isRegimeNormal ? (nat.icms_csosn || '') : '';

  const impostos: CalculatedImpostos = {
    icms: {
      cst: ctx.isRegimeNormal ? (nat.icms_cst || null) : null,
      csosn: !ctx.isRegimeNormal ? (nat.icms_csosn || null) : null,
      origem: '0',
      base_calculo: r2(icmsBase),
      aliquota: nat.icms_aliquota || 0,
      valor: r2(icmsVal),
      reducao_base: nat.icms_reducao_base || 0,
    },
    pis: {
      cst: nat.pis_cst || '99',
      base_calculo: r2(base),
      aliquota: nat.pis_aliquota || 0,
      valor: r2(pisVal),
    },
    cofins: {
      cst: nat.cofins_cst || '99',
      base_calculo: r2(base),
      aliquota: nat.cofins_aliquota || 0,
      valor: r2(cofVal),
    },
    total: r2(totalImp),
  };

  if (hasIpi) {
    impostos.ipi = {
      cst: nat.ipi_cst!,
      base_calculo: r2(base),
      aliquota: nat.ipi_aliquota,
      valor: r2(ipiVal),
    };
  }

  return {
    cfop,
    cst,
    csosn,
    codigo_beneficio_fiscal: nat.codigo_beneficio_fiscal || '',
    impostos,
  };
}

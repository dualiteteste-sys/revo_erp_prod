import { callRpc } from '@/lib/api';

export type FiscalRegraRow = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  // Condições
  condicao_produto_grupo_id: string | null;
  condicao_ncm_pattern: string | null;
  condicao_destinatario_uf: string | null;
  condicao_tipo_operacao: string | null;
  condicao_regime: string | null;
  // Overrides
  cfop_dentro_uf: string | null;
  cfop_fora_uf: string | null;
  icms_cst: string | null;
  icms_csosn: string | null;
  icms_aliquota: number | null;
  icms_reducao_base: number | null;
  codigo_beneficio_fiscal: string | null;
  pis_cst: string | null;
  pis_aliquota: number | null;
  cofins_cst: string | null;
  cofins_aliquota: number | null;
  ipi_cst: string | null;
  ipi_aliquota: number | null;
  ibs_cst: string | null;
  ibs_aliquota: number | null;
  cbs_aliquota: number | null;
  c_class_trib: string | null;
  // Controle
  prioridade: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type FiscalRegraSearchHit = {
  id: string;
  nome: string;
  descricao: string | null;
  prioridade: number;
  condicao_ncm_pattern: string | null;
  condicao_destinatario_uf: string | null;
  condicao_tipo_operacao: string | null;
};

export async function fiscalRegrasList(params: {
  q?: string;
  ativo?: boolean;
  limit?: number;
} = {}) {
  return callRpc<FiscalRegraRow[]>('fiscal_regras_list', {
    p_q: params.q ?? null,
    p_ativo: params.ativo ?? true,
    p_limit: params.limit ?? 200,
  });
}

export async function fiscalRegrasGet(id: string) {
  const rows = await callRpc<FiscalRegraRow[]>('fiscal_regras_get', { p_id: id });
  return rows?.[0] ?? null;
}

export async function fiscalRegrasUpsert(payload: Record<string, unknown>) {
  return callRpc<string>('fiscal_regras_upsert', { p_payload: payload });
}

export async function fiscalRegrasDelete(id: string) {
  return callRpc<void>('fiscal_regras_delete', { p_id: id });
}

export async function fiscalRegrasSearch(q: string, limit = 15) {
  return callRpc<FiscalRegraSearchHit[]>('fiscal_regras_search', {
    p_q: q,
    p_limit: limit,
  });
}

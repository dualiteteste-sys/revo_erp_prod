import { callRpc } from '@/lib/api';

export type NaturezaOperacaoRow = {
  id: string;
  empresa_id: string;
  codigo: string;
  descricao: string;
  cfop_dentro_uf: string | null;
  cfop_fora_uf: string | null;
  cfop_secundario_dentro_uf: string | null;
  cfop_secundario_fora_uf: string | null;
  icms_cst: string | null;
  icms_csosn: string | null;
  icms_aliquota: number;
  icms_reducao_base: number;
  codigo_beneficio_fiscal: string | null;
  pis_cst: string;
  pis_aliquota: number;
  cofins_cst: string;
  cofins_aliquota: number;
  ipi_cst: string | null;
  ipi_aliquota: number;
  ibs_cst_padrao: string | null;
  ibs_aliquota_padrao: number;
  cbs_aliquota_padrao: number;
  c_class_trib_padrao: string | null;
  gera_financeiro: boolean;
  movimenta_estoque: boolean;
  finalidade_emissao: string;
  tipo_operacao: string;
  observacoes_padrao: string | null;
  regime_aplicavel: string;
  ativo: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type NaturezaOperacaoSearchHit = {
  id: string;
  codigo: string;
  descricao: string;
  cfop_dentro_uf: string | null;
  cfop_fora_uf: string | null;
  cfop_secundario_dentro_uf: string | null;
  cfop_secundario_fora_uf: string | null;
  icms_cst: string | null;
  icms_csosn: string | null;
  icms_aliquota: number;
  icms_reducao_base: number;
  codigo_beneficio_fiscal: string | null;
  pis_cst: string;
  pis_aliquota: number;
  cofins_cst: string;
  cofins_aliquota: number;
  ipi_cst: string | null;
  ipi_aliquota: number;
  ibs_cst_padrao: string | null;
  ibs_aliquota_padrao: number;
  cbs_aliquota_padrao: number;
  c_class_trib_padrao: string | null;
  finalidade_emissao: string;
  observacoes_padrao: string | null;
};

export async function fiscalNaturezasOperacaoList(params: {
  q?: string;
  tipo?: string;
  regime?: string;
  ativo?: boolean;
  limit?: number;
} = {}) {
  return callRpc<NaturezaOperacaoRow[]>('fiscal_naturezas_operacao_list', {
    p_q: params.q ?? null,
    p_tipo: params.tipo ?? null,
    p_regime: params.regime ?? null,
    p_ativo: params.ativo ?? true,
    p_limit: params.limit ?? 200,
  });
}

export async function fiscalNaturezasOperacaoGet(id: string) {
  const rows = await callRpc<NaturezaOperacaoRow[]>('fiscal_naturezas_operacao_get', { p_id: id });
  return rows?.[0] ?? null;
}

export async function fiscalNaturezasOperacaoUpsert(payload: Record<string, unknown>) {
  return callRpc<string>('fiscal_naturezas_operacao_upsert', { p_payload: payload });
}

export async function fiscalNaturezasOperacaoDelete(id: string) {
  return callRpc<void>('fiscal_naturezas_operacao_delete', { p_id: id });
}

export async function fiscalNaturezasOperacaoSearch(q: string, limit = 15) {
  return callRpc<NaturezaOperacaoSearchHit[]>('fiscal_naturezas_operacao_search', {
    p_q: q,
    p_limit: limit,
  });
}

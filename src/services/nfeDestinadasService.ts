import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

// ============================================================
// Types
// ============================================================

export type NfeDestinadaStatus =
  | 'pendente'
  | 'ciencia'
  | 'confirmada'
  | 'desconhecida'
  | 'nao_realizada'
  | 'ignorada';

export type NfeDestinadaRow = {
  id: string;
  chave_acesso: string;
  nsu: number;
  cnpj_emitente: string;
  nome_emitente: string | null;
  ie_emitente: string | null;
  data_emissao: string;
  tipo_nfe: number | null;
  valor_nf: number;
  protocolo: string | null;
  situacao_nfe: number | null;
  status: NfeDestinadaStatus;
  manifestado_em: string | null;
  justificativa: string | null;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  conta_pagar_id: string | null;
  recebimento_id: string | null;
  pedido_compra_id: string | null;
  xml_resumo_path: string | null;
  xml_completo_path: string | null;
  xml_evento_path: string | null;
  prazo_ciencia: string | null;
  prazo_manifestacao: string | null;
  created_at: string;
  updated_at: string;
};

export type NfeDestinadaListResult = {
  rows: NfeDestinadaRow[];
  total: number;
  page: number;
  page_size: number;
};

export type NfeDestinadaSummary = {
  pendentes: number;
  ciencia: number;
  confirmadas: number;
  desconhecidas: number;
  nao_realizadas: number;
  ignoradas: number;
  total: number;
  valor_total: number;
};

export type NfeDestinadaSyncStatus = {
  ultimo_nsu: number;
  max_nsu: number;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  synced: boolean;
};

export type FocusManifestarResult = {
  ok: boolean;
  error?: string;
  message?: string;
  success_count?: number;
  fail_count?: number;
  results?: Array<{
    nfe_destinada_id: string;
    chave_acesso: string;
    status: string;
    success: boolean;
    error?: string;
  }>;
};

// ============================================================
// API calls — RPCs
// ============================================================

export async function listNfeDestinadasRpc(params: {
  status?: string;
  startDate?: string;
  endDate?: string;
  cnpjEmitente?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<NfeDestinadaListResult> {
  return callRpc<NfeDestinadaListResult>('fiscal_nfe_destinadas_list', {
    p_status: params.status || null,
    p_start_date: params.startDate || null,
    p_end_date: params.endDate || null,
    p_cnpj_emitente: params.cnpjEmitente || null,
    p_search: params.search || null,
    p_page: params.page ?? 1,
    p_page_size: params.pageSize ?? 50,
  });
}

export async function getNfeDestinadasSummary(): Promise<NfeDestinadaSummary> {
  return callRpc<NfeDestinadaSummary>('fiscal_nfe_destinadas_summary');
}

export async function getNfeDestinadasSyncStatus(): Promise<NfeDestinadaSyncStatus> {
  return callRpc<NfeDestinadaSyncStatus>('fiscal_nfe_destinadas_sync_status');
}

export async function manifestarNfeDestinadasRpc(
  ids: string[],
  status: string,
  justificativa?: string,
): Promise<{ ok: boolean; updated: number }> {
  return callRpc<{ ok: boolean; updated: number }>('fiscal_nfe_destinadas_manifestar', {
    p_ids: ids,
    p_status: status,
    p_justificativa: justificativa || null,
  });
}

/** Generate conta a pagar from confirmed NF-e destinada */
export async function gerarContaPagarFromNfeDestinadaRpc(
  nfeDestinadaId: string,
  dataVencimento?: string,
): Promise<string> {
  return callRpc<string>('fiscal_nfe_destinada_gerar_conta_pagar', {
    p_nfe_destinada_id: nfeDestinadaId,
    p_data_vencimento: dataVencimento || null,
  });
}

// ============================================================
// Focus NFe edge function calls
// ============================================================

/** Trigger manual sync via Focus NFe MDe API */
export async function syncNfeDestinadasManual(): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('focusnfe-mde-sync', { body: {} });
  if (error) throw error;
  return data;
}

/** Send manifestação event via Focus NFe MDe API */
export async function focusManifestarEvento(params: {
  nfeDestinadaIds: string[];
  tipo: 'ciencia' | 'confirmacao' | 'desconhecimento' | 'nao_realizada';
  justificativa?: string;
}): Promise<FocusManifestarResult> {
  const { data, error } = await supabase.functions.invoke('focusnfe-mde-manifestar', {
    body: params,
  });
  if (error) throw error;
  return data as FocusManifestarResult;
}

/** Upload certificate to Focus NFe via edge function */
export async function uploadCertToFocusNfe(password: string): Promise<{
  ok: boolean;
  error?: string;
  cert_info?: { cnpj: string | null; valid_until: string };
}> {
  const { data, error } = await supabase.functions.invoke('focusnfe-cert-upload', {
    body: { password },
  });
  if (error) throw error;
  return data as { ok: boolean; error?: string; cert_info?: { cnpj: string | null; valid_until: string } };
}

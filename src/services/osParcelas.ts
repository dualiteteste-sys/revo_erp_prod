import { callRpc } from '@/lib/api';

export type OsParcelaStatus = 'aberta' | 'paga' | 'cancelada';

export type OsParcela = {
  id: string;
  empresa_id: string;
  ordem_servico_id: string;
  numero_parcela: number;
  vencimento: string;
  valor: number;
  status: OsParcelaStatus;
  pago_em: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listOsParcelas(osId: string): Promise<OsParcela[]> {
  return callRpc<OsParcela[]>('list_os_parcels_for_current_user', { p_os_id: osId });
}

export async function generateOsParcelas(params: {
  osId: string;
  condicao?: string | null;
  total?: number | null;
  baseDateISO?: string | null;
}): Promise<OsParcela[]> {
  return callRpc<OsParcela[]>('os_generate_parcels_for_current_user', {
    p_os_id: params.osId,
    p_cond: params.condicao ?? null,
    p_total: params.total ?? null,
    p_base_date: params.baseDateISO ?? null,
  });
}


import { callRpc } from '@/lib/api';

// Tipos para o Dashboard unificado
export type DashboardStats = {
  producao_status: { status: string; total: number }[];
  beneficiamento_status: { status: string; total: number }[];
  total_producao: number;
  total_beneficiamento: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  return callRpc<DashboardStats>('industria_get_dashboard_stats');
}

// Tipos comuns que podem ser reutilizados
export type StatusOrdem = 'rascunho' | 'planejada' | 'em_programacao' | 'em_producao' | 'em_inspecao' | 'parcialmente_concluida' | 'concluida' | 'cancelada' | 'aguardando_material' | 'em_beneficiamento' | 'parcialmente_entregue';

export type OrdemComponente = {
  id: string;
  ordem_id: string;
  produto_id: string;
  produto_nome: string;
  quantidade_planejada: number;
  quantidade_consumida: number;
  quantidade_reservada?: number;
  perda_percentual?: number;
  unidade: string;
  origem: string;
};

export type OrdemEntrega = {
  id: string;
  ordem_id: string;
  data_entrega: string;
  quantidade_entregue: number;
  status_faturamento?: string; // Específico de beneficiamento
  status_integracao?: string; // Específico de produção
  documento_ref?: string; // Produção
  documento_entrega?: string; // Beneficiamento
  documento_faturamento?: string; // Beneficiamento
  observacoes?: string;
  created_at: string;
};

export async function updateOrdemStatus(id: string, status: StatusOrdem, prioridade?: number) {
  await callRpc('industria_operacao_update_status', {
    p_id: id,
    p_status: status,
    p_prioridade: prioridade ?? null,
  });
}

export async function replanejarOperacao(operacaoId: string, centroTrabalhoId: string, prioridade?: number) {
  await callRpc('industria_operacao_replanejar', {
    p_operacao_id: operacaoId,
    p_novo_centro: centroTrabalhoId,
    p_nova_prioridade: prioridade ?? null,
  });
}

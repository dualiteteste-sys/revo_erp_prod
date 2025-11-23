import { callRpc } from '@/lib/api';

export type StatusOperacao = 'planejada' | 'liberada' | 'em_execucao' | 'em_espera' | 'em_inspecao' | 'concluida' | 'cancelada';
export type TipoOrdem = 'producao' | 'beneficiamento';

export type Operacao = {
  id: string;
  ordem_id: string;
  ordem_numero: number;
  tipo_ordem: TipoOrdem;
  produto_nome: string;
  cliente_nome: string | null;
  centro_trabalho_id: string;
  centro_trabalho_nome: string;
  status: StatusOperacao;
  prioridade: number;
  data_prevista_inicio: string | null;
  data_prevista_fim: string | null;
  percentual_concluido: number;
  atrasada: boolean;
};

export type OperacaoFila = Operacao & {
  quantidade_planejada: number;
  quantidade_produzida: number;
  quantidade_refugada: number;
};

export async function listOperacoes(
  view: 'lista' | 'kanban' = 'lista',
  centroId?: string,
  status?: string,
  search?: string
): Promise<Operacao[]> {
  return callRpc<Operacao[]>('industria_operacoes_list', {
    p_view: view,
    p_centro_id: centroId || null,
    p_status: status || null,
    p_search: search || null,
  });
}

export async function updateOperacaoStatus(
  id: string,
  status: StatusOperacao,
  prioridade?: number,
  centroTrabalhoId?: string
): Promise<void> {
  if (!centroTrabalhoId) throw new Error("Centro de trabalho é obrigatório para atualizar status.");
  
  await callRpc('industria_operacao_update_status', {
    p_id: id,
    p_status: status,
    p_prioridade: prioridade || null,
    p_centro_trabalho_id: centroTrabalhoId,
  });
}

export async function listMinhaFila(centroTrabalhoId: string): Promise<OperacaoFila[]> {
  return callRpc<OperacaoFila[]>('industria_operacoes_minha_fila', {
    p_centro_trabalho_id: centroTrabalhoId,
  });
}

export async function apontarExecucao(
  operacaoId: string,
  acao: 'iniciar' | 'pausar' | 'concluir',
  qtdBoas?: number,
  qtdRefugadas?: number,
  motivoRefugo?: string,
  observacoes?: string
): Promise<void> {
  await callRpc('industria_operacao_apontar_execucao', {
    p_operacao_id: operacaoId,
    p_acao: acao,
    p_qtd_boas: qtdBoas || 0,
    p_qtd_refugadas: qtdRefugadas || 0,
    p_motivo_refugo: motivoRefugo || null,
    p_observacoes: observacoes || null,
  });
}

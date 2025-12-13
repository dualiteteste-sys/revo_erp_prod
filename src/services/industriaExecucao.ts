import { callRpc } from '@/lib/api';
import { listCentrosTrabalho, CentroTrabalho } from './industriaCentros';

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

export type CentroStatusSnapshot = {
  centro: CentroTrabalho;
  emExecucao: Operacao[];
  fila: Operacao[];
  bloqueadas: Operacao[];
  concluidasHoje: number;
  alerta: 'ok' | 'warning' | 'danger';
  utilizacao: number;
  proximaEntrega: string | null;
  proximaOrdem: Operacao | null;
  ultimaAtualizacao: string;
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

/**
 * Consolida o status de cada Centro de Trabalho para o painel do Chão de Fábrica.
 * Usa as listas existentes (centros + operações) para evitar múltiplos RPCs específicos.
 */
export async function getChaoDeFabricaOverview(): Promise<CentroStatusSnapshot[]> {
  const [centros, operacoes] = await Promise.all([
    listCentrosTrabalho(undefined, true),
    listOperacoes('kanban'),
  ]);

  const nowIso = new Date().toISOString();

  const overview = centros.map((centro) => {
    const ops = operacoes.filter(op => op.centro_trabalho_id === centro.id);
    const emExecucao = ops.filter(op => op.status === 'em_execucao');
    const fila = ops.filter(op => op.status === 'planejada' || op.status === 'liberada');
    const bloqueadas = ops.filter(op => op.status === 'em_espera' || op.status === 'em_inspecao');
    const concluidas = ops.filter(op => op.status === 'concluida');
    const atrasadas = ops.filter(op => op.atrasada).length;

    const alerta: CentroStatusSnapshot['alerta'] =
      bloqueadas.length > 0 ? 'danger' :
      atrasadas > 0 ? 'warning' :
      'ok';

    const capacidadeBase = centro.capacidade_unidade_hora || centro.capacidade_horas_dia || 10;
    const carga = emExecucao.length + fila.length * 0.5;
    const utilizacao = Math.min(100, Math.round((carga / Math.max(1, capacidadeBase)) * 100));

    const proximaOrdem = [...emExecucao, ...fila]
      .filter(op => !!op.data_prevista_fim)
      .sort((a, b) => (a.data_prevista_fim || '').localeCompare(b.data_prevista_fim || ''))[0] || null;

    return {
      centro,
      emExecucao,
      fila,
      bloqueadas,
      concluidasHoje: concluidas.length,
      alerta,
      utilizacao,
      proximaEntrega: proximaOrdem?.data_prevista_fim || null,
      proximaOrdem,
      ultimaAtualizacao: nowIso,
    };
  });

  return overview.sort((a, b) => a.centro.nome.localeCompare(b.centro.nome));
}

import { callRpc } from '@/lib/api';
import { OrdemComponente, OrdemEntrega } from './industria';

export type StatusProducao = 'rascunho' | 'planejada' | 'em_programacao' | 'em_producao' | 'em_inspecao' | 'concluida' | 'cancelada';

export type OrdemProducao = {
  id: string;
  numero: number;
  produto_nome: string;
  quantidade_planejada: number;
  unidade: string;
  status: StatusProducao;
  prioridade: number;
  data_prevista_entrega?: string;
  total_entregue: number;
  percentual_concluido: number;
};

export type OrdemProducaoDetails = {
  id: string;
  empresa_id: string;
  numero: number;
  origem_ordem: string;
  produto_final_id: string;
  produto_nome: string;
  quantidade_planejada: number;
  unidade: string;
  status: StatusProducao;
  prioridade: number;
  data_prevista_inicio?: string;
  data_prevista_fim?: string;
  data_prevista_entrega?: string;
  documento_ref?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  componentes: OrdemComponente[];
  entregas: OrdemEntrega[];
};

export type OrdemProducaoPayload = Partial<Omit<OrdemProducaoDetails, 'numero' | 'produto_nome' | 'componentes' | 'entregas' | 'created_at' | 'updated_at'>>;

export async function listOrdensProducao(search?: string, status?: string): Promise<OrdemProducao[]> {
  return callRpc<OrdemProducao[]>('industria_producao_list_ordens', {
    p_search: search || null,
    p_status: status || null,
  });
}

export async function getOrdemProducaoDetails(id: string): Promise<OrdemProducaoDetails> {
  return callRpc<OrdemProducaoDetails>('industria_producao_get_ordem_details', { p_id: id });
}

export async function saveOrdemProducao(payload: OrdemProducaoPayload): Promise<OrdemProducaoDetails> {
  return callRpc<OrdemProducaoDetails>('industria_producao_upsert_ordem', { p_payload: payload });
}

export async function updateStatusProducao(id: string, status: StatusProducao, prioridade: number): Promise<void> {
  await callRpc('industria_producao_update_status', { p_id: id, p_status: status, p_prioridade: prioridade });
}

export async function manageComponenteProducao(
  ordemId: string,
  componenteId: string | null,
  produtoId: string,
  qtdPlanejada: number,
  unidade: string,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_producao_manage_componente', {
    p_ordem_id: ordemId,
    p_componente_id: componenteId,
    p_produto_id: produtoId,
    p_quantidade_planejada: qtdPlanejada,
    p_unidade: unidade,
    p_action: action,
  });
}

export async function manageEntregaProducao(
  ordemId: string,
  entregaId: string | null,
  dataEntrega: string,
  qtdEntregue: number,
  docRef?: string,
  obs?: string,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_producao_manage_entrega', {
    p_ordem_id: ordemId,
    p_entrega_id: entregaId,
    p_data_entrega: dataEntrega,
    p_quantidade_entregue: qtdEntregue,
    p_documento_ref: docRef || null,
    p_observacoes: obs || null,
    p_action: action,
  });
}

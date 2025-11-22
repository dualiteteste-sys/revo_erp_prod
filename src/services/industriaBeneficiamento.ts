import { callRpc } from '@/lib/api';
import { OrdemComponente, OrdemEntrega } from './industria';

export type StatusBeneficiamento = 'rascunho' | 'aguardando_material' | 'em_beneficiamento' | 'em_inspecao' | 'parcialmente_entregue' | 'concluida' | 'cancelada';

export type OrdemBeneficiamento = {
  id: string;
  numero: number;
  cliente_nome: string;
  produto_servico_nome: string;
  pedido_cliente_ref?: string;
  quantidade_planejada: number;
  unidade: string;
  status: StatusBeneficiamento;
  prioridade: number;
  data_prevista_entrega?: string;
  total_entregue: number;
  percentual_concluido: number;
};

export type OrdemBeneficiamentoDetails = {
  id: string;
  empresa_id: string;
  numero: number;
  cliente_id: string;
  cliente_nome: string;
  produto_servico_id: string;
  produto_servico_nome: string;
  produto_material_cliente_id?: string;
  produto_material_nome?: string;
  usa_material_cliente: boolean;
  quantidade_planejada: number;
  unidade: string;
  status: StatusBeneficiamento;
  prioridade: number;
  data_prevista_entrega?: string;
  pedido_cliente_ref?: string;
  lote_cliente?: string;
  documento_ref?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
  componentes: OrdemComponente[];
  entregas: OrdemEntrega[];
};

export type OrdemBeneficiamentoPayload = Partial<Omit<OrdemBeneficiamentoDetails, 'numero' | 'cliente_nome' | 'produto_servico_nome' | 'produto_material_nome' | 'componentes' | 'entregas' | 'created_at' | 'updated_at'>>;

export async function listOrdensBeneficiamento(search?: string, status?: string): Promise<OrdemBeneficiamento[]> {
  return callRpc<OrdemBeneficiamento[]>('industria_benef_list_ordens', {
    p_search: search || null,
    p_status: status || null,
  });
}

export async function getOrdemBeneficiamentoDetails(id: string): Promise<OrdemBeneficiamentoDetails> {
  return callRpc<OrdemBeneficiamentoDetails>('industria_benef_get_ordem_details', { p_id: id });
}

export async function saveOrdemBeneficiamento(payload: OrdemBeneficiamentoPayload): Promise<OrdemBeneficiamentoDetails> {
  return callRpc<OrdemBeneficiamentoDetails>('industria_benef_upsert_ordem', { p_payload: payload });
}

export async function updateStatusBeneficiamento(id: string, status: StatusBeneficiamento, prioridade: number): Promise<void> {
  await callRpc('industria_benef_update_status', { p_id: id, p_status: status, p_prioridade: prioridade });
}

export async function manageComponenteBenef(
  ordemId: string,
  componenteId: string | null,
  produtoId: string,
  qtdPlanejada: number,
  unidade: string,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_benef_manage_componente', {
    p_ordem_id: ordemId,
    p_componente_id: componenteId,
    p_produto_id: produtoId,
    p_quantidade_planejada: qtdPlanejada,
    p_unidade: unidade,
    p_action: action,
  });
}

export async function manageEntregaBenef(
  ordemId: string,
  entregaId: string | null,
  dataEntrega: string,
  qtdEntregue: number,
  statusFaturamento: string,
  docEntrega?: string,
  docFat?: string,
  obs?: string,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_benef_manage_entrega', {
    p_ordem_id: ordemId,
    p_entrega_id: entregaId,
    p_data_entrega: dataEntrega,
    p_quantidade_entregue: qtdEntregue,
    p_status_faturamento: statusFaturamento,
    p_documento_entrega: docEntrega || null,
    p_documento_faturamento: docFat || null,
    p_observacoes: obs || null,
    p_action: action,
  });
}

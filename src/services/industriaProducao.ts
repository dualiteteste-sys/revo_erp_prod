import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getProducts } from './products';
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
  roteiro_aplicado_id?: string;
  roteiro_aplicado_desc?: string;
  bom_aplicado_id?: string;
  bom_aplicado_desc?: string;
  lote_producao?: string;
  reserva_modo?: 'ao_liberar' | 'ao_planejar' | 'sem_reserva';
  tolerancia_overrun_percent?: number;
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

export async function seedOrdensProducao(): Promise<void> {
  // 1. Fetch products
  const { data: products } = await getProducts({ page: 1, pageSize: 100, searchTerm: '', status: 'ativo', sortBy: { column: 'nome', ascending: true } });
  if (products.length === 0) throw new Error('Crie produtos antes de gerar ordens de produção.');

  // 2. Generate 5 Orders
  for (let i = 0; i < 5; i++) {
    const product = faker.helpers.arrayElement(products);
    const status = faker.helpers.arrayElement(['planejada', 'em_producao', 'concluida', 'em_programacao']) as StatusProducao;

    const payload: OrdemProducaoPayload = {
      origem_ordem: 'manual',
      produto_final_id: product.id,
      quantidade_planejada: faker.number.int({ min: 10, max: 1000 }),
      unidade: product.unidade || 'un',
      status: status,
      prioridade: faker.number.int({ min: 0, max: 100 }),
      data_prevista_inicio: faker.date.soon().toISOString(),
      data_prevista_entrega: faker.date.future().toISOString(),
      documento_ref: `PED-${faker.string.numeric(4)}`,
      observacoes: faker.lorem.sentence(),
    };

    await saveOrdemProducao(payload);
  }
}

export type StatusInspecaoQA = 'aprovada' | 'reprovada' | 'em_analise';

export interface OrdemOperacao {
  id: string;
  ordem_id: string;
  sequencia: number;
  centro_trabalho_id: string;
  centro_trabalho_nome: string;
  descricao: string;
  tempo_planejado_minutos: number;
  tempo_real_minutos: number;
  quantidade_planejada: number;
  quantidade_realizada: number;
  quantidade_refugo: number;
  status: 'pendente' | 'em_preparacao' | 'em_processo' | 'pausada' | 'interrompida' | 'concluida' | 'na_fila' | 'em_execucao';
  permite_overlap?: boolean;
  quantidade_transferida?: number;
  require_ip?: boolean;
  require_if?: boolean;
  ip_status?: StatusInspecaoQA | null;
  if_status?: StatusInspecaoQA | null;
  ip_last_inspecao?: string | null;
  if_last_inspecao?: string | null;
}

export interface OrdemApontamento {
  id: string;
  operacao_id: string;
  usuario_id: string;
  tipo: 'producao' | 'setup' | 'parada' | 'retorno' | 'conclusao';
  quantidade_produzida?: number;
  quantidade_boa?: number;
  quantidade_refugo?: number;
  motivo_refugo?: string;
  tempo_apontado_minutos?: number;
  observacoes?: string;
  created_at: string;
}

export async function getOperacoes(ordemId: string): Promise<OrdemOperacao[]> {
  return callRpc<OrdemOperacao[]>('industria_producao_get_operacoes', { p_ordem_id: ordemId });
}

export async function gerarOperacoes(ordemId: string): Promise<void> {
  await callRpc('industria_producao_gerar_operacoes', { p_ordem_id: ordemId });
}

export async function registrarEventoOperacao(
  operacaoId: string,
  tipo: 'iniciar' | 'pausar' | 'retomar' | 'concluir' | 'inicio_setup' | 'fim_setup',
  obs?: string
): Promise<void> {
  await callRpc('industria_producao_registrar_evento', {
    p_operacao_id: operacaoId,
    p_tipo: tipo,
    p_observacoes: obs
  });
}


export async function apontarProducao(
  operacaoId: string,
  qtdProduzida: number,
  qtdRefugo: number,
  motivoRefugo: string,
  obs: string,
  finalizar: boolean,
  motivoRefugoId?: string // New optional param
): Promise<void> {
  await callRpc('industria_producao_apontar_producao', {
    p_operacao_id: operacaoId,
    p_quantidade_produzida: qtdProduzida,
    p_quantidade_refugo: qtdRefugo,
    p_motivo_refugo: motivoRefugo,
    p_observacoes: obs,
    p_finalizar: finalizar,
    p_motivo_refugo_id: motivoRefugoId || null // Pass to RPC
  });
}

export async function listApontamentos(operacaoId: string): Promise<OrdemApontamento[]> {
  return callRpc<OrdemApontamento[]>('industria_producao_list_apontamentos', {
    p_operacao_id: operacaoId
  });
}

export async function deleteApontamento(apontamentoId: string): Promise<void> {
  await callRpc('industria_producao_delete_apontamento', { p_id: apontamentoId });
}

export async function transferirLoteOperacao(operacaoId: string, quantidade: number): Promise<void> {
  await callRpc('industria_producao_transferir_lote', {
    p_operacao_id: operacaoId,
    p_qtd: quantidade,
  });
}

// --- Stock Management Types ---

export interface EstoqueLote {
  lote: string;
  validade: string | null;
  saldo: number;
  custo_medio: number;
  reservado: number;
  disponivel: number;
}

export interface ReservaPayload {
  ordem_id: string;
  componente_id: string;
  lote: string;
  quantidade: number;
}

export interface ConsumoPayload {
  ordem_id: string;
  componente_id: string;
  lote: string;
  quantidade: number;
  etapa_id?: string | null;
}

// --- Stock Management RPCs ---

export async function getLotesDisponiveis(produtoId: string): Promise<EstoqueLote[]> {
  return callRpc<EstoqueLote[]>('estoque_get_lotes_disponiveis', { p_produto_id: produtoId });
}

export async function reservarEstoque(payload: ReservaPayload): Promise<void> {
  await callRpc('industria_producao_reservar', {
    p_ordem_id: payload.ordem_id,
    p_componente_id: payload.componente_id,
    p_lote: payload.lote,
    p_quantidade: payload.quantidade
  });
}

export async function consumirEstoque(payload: ConsumoPayload): Promise<void> {
  await callRpc('industria_producao_consumir', {
    p_ordem_id: payload.ordem_id,
    p_componente_id: payload.componente_id,
    p_lote: payload.lote,
    p_quantidade: payload.quantidade,
    p_etapa_id: payload.etapa_id || null
  });
}

// --- Delivery & Closure RPCs ---

export interface RegistrarEntregaPayload {
  ordem_id: string;
  quantidade: number;
  data_entrega: string;
  lote?: string;
  validade?: string;
  documento_ref?: string;
  observacoes?: string;
}

export async function registrarEntrega(payload: RegistrarEntregaPayload): Promise<void> {
  await callRpc('industria_producao_registrar_entrega', {
    p_ordem_id: payload.ordem_id,
    p_quantidade: payload.quantidade,
    p_data_entrega: payload.data_entrega,
    p_lote: payload.lote || null,
    p_validade: payload.validade || null,
    p_documento_ref: payload.documento_ref || null,
    p_observacoes: payload.observacoes || null
  });
}

export async function fecharOrdemProducao(ordemId: string): Promise<void> {
  await callRpc('industria_producao_fechar', { p_ordem_id: ordemId });
}

export async function deleteOrdemProducao(ordemId: string): Promise<void> {
  await callRpc('industria_producao_ordens_delete', { p_id: ordemId });
}


// --- Quality Management Types ---

export type StatusQualidade = 'aprovado' | 'em_analise' | 'bloqueado' | 'reprovado';

export interface QualidadeMotivo {
  id: string;
  codigo: string;
  descricao: string;
  tipo?: string;
}

export interface InspecaoPayload {
  ordem_id: string;
  operacao_id: string;
  tipo: 'IP' | 'IF';
  resultado: StatusInspecaoQA;
  quantidade_inspecionada: number;
  quantidade_aprovada: number;
  quantidade_rejeitada: number;
  motivo_refugo_id?: string;
  observacoes?: string;
  lote_id?: string | null;
}

export interface RegistroInspecao {
  id: string;
  tipo: 'IP' | 'IF';
  resultado: StatusInspecaoQA;
  quantidade_inspecionada: number;
  quantidade_aprovada: number;
  quantidade_rejeitada: number;
  created_at: string;
  observacoes?: string | null;
}

// --- Quality Management RPCs ---

export async function getMotivosRefugo(): Promise<QualidadeMotivo[]> {
  return callRpc<QualidadeMotivo[]>('qualidade_get_motivos');
}

export async function registrarInspecao(payload: InspecaoPayload): Promise<void> {
  await callRpc('qualidade_registrar_inspecao', {
    p_ordem_id: payload.ordem_id,
    p_operacao_id: payload.operacao_id,
    p_tipo: payload.tipo,
    p_resultado: payload.resultado,
    p_qtd_inspecionada: payload.quantidade_inspecionada,
    p_qtd_aprovada: payload.quantidade_aprovada,
    p_qtd_rejeitada: payload.quantidade_rejeitada,
    p_motivo_id: payload.motivo_refugo_id || null,
    p_observacoes: payload.observacoes || null,
    p_lote_id: payload.lote_id || null
  });
}

export async function listarInspecoes(operacaoId: string): Promise<RegistroInspecao[]> {
  return callRpc<RegistroInspecao[]>('qualidade_list_inspecoes', { p_operacao_id: operacaoId });
}

export async function alterarStatusLote(loteId: string, novoStatus: StatusQualidade, obs?: string): Promise<void> {
  await callRpc('qualidade_alterar_status_lote', {
    p_lote_id: loteId,
    p_novo_status: novoStatus,
    p_observacoes: obs || null
  });
}

export async function setOperacaoQARequirements(operacaoId: string, requireIp: boolean, requireIf: boolean): Promise<void> {
  await callRpc('industria_producao_set_qa_requirements', {
    p_operacao_id: operacaoId,
    p_require_ip: requireIp,
    p_require_if: requireIf
  });
}

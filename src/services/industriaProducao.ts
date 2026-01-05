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

export async function getOrdemProducaoDetails(id: string): Promise<OrdemProducaoDetails | null> {
  return callRpc<OrdemProducaoDetails | null>('industria_producao_get_ordem_details', { p_id: id });
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
  dataEntrega: string | null,
  qtdEntregue: number | null,
  docRef?: string,
  obs?: string,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  const isDelete = action === 'delete';
  await callRpc('industria_producao_manage_entrega', {
    p_ordem_id: ordemId,
    p_entrega_id: entregaId,
    p_data_entrega: isDelete ? null : dataEntrega,
    p_quantidade_entregue: isDelete ? null : qtdEntregue,
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

export async function resetOrdemProducao(ordemId: string): Promise<void> {
  await callRpc('industria_producao_reset_ordem', { p_id: ordemId });
}

export async function resetOperacaoProducao(operacaoId: string, force = false): Promise<void> {
  await callRpc('industria_producao_reset_operacao', { p_operacao_id: operacaoId, p_force: force });
}

export async function cloneOrdemProducao(ordemId: string): Promise<OrdemProducaoDetails> {
  return callRpc<OrdemProducaoDetails>('industria_producao_clone_ordem', { p_source_id: ordemId });
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

export interface PlanoCaracteristica {
  id: string;
  descricao: string;
  tolerancia_min?: number | null;
  tolerancia_max?: number | null;
  unidade?: string | null;
  instrumento?: string | null;
}

export interface PlanoInspecao {
  id: string;
  nome: string;
  produto_id: string;
  produto_nome: string;
  tipo: 'IP' | 'IF';
  severidade?: string | null;
  aql?: string | null;
  amostragem?: string | null;
  ativo: boolean;
  roteiro_id?: string | null;
  roteiro_nome?: string | null;
  roteiro_etapa_id?: string | null;
  etapa_nome?: string | null;
  etapa_sequencia?: number | null;
  total_caracteristicas: number;
  updated_at: string;
}

export interface PlanoInspecaoDetalhe extends PlanoInspecao {
  caracteristicas: PlanoCaracteristica[];
}

export interface PlanoInspecaoPayload {
  id?: string;
  nome: string;
  produto_id: string;
  tipo: 'IP' | 'IF';
  severidade?: string;
  aql?: string;
  amostragem?: string;
  roteiro_id?: string | null;
  roteiro_etapa_id?: string | null;
  ativo?: boolean;
}

export interface PlanoCaracteristicaPayload {
  id?: string;
  plano_id: string;
  descricao: string;
  tolerancia_min?: number | null;
  tolerancia_max?: number | null;
  unidade?: string | null;
  instrumento?: string | null;
}

export interface QualidadeLote {
  id: string;
  produto_id: string;
  produto_nome: string;
  lote: string;
  validade?: string | null;
  saldo: number;
  status_qa: StatusQualidade;
  ultima_inspecao_data?: string | null;
  ultima_inspecao_tipo?: 'IP' | 'IF' | null;
  ultima_inspecao_resultado?: StatusInspecaoQA | null;
  total_inspecoes: number;
}

export interface MrpParametro {
  id: string;
  produto_id: string;
  produto_nome: string;
  lead_time_dias: number;
  lote_minimo: number;
  multiplo_compra: number;
  estoque_seguranca: number;
  politica_picking: 'FIFO' | 'FEFO';
  fornecedor_preferencial_id?: string | null;
  updated_at: string;
}

export interface MrpParametroPayload {
  produto_id: string;
  lead_time_dias?: number;
  lote_minimo?: number;
  multiplo_compra?: number;
  estoque_seguranca?: number;
  politica_picking?: 'FIFO' | 'FEFO';
  fornecedor_preferencial_id?: string | null;
}

export type MrpAcaoTipo = 'transferencia' | 'requisicao_compra' | 'ordem_compra' | 'ajuste' | 'manual';

export interface MrpDemanda {
  id: string;
  produto_id: string;
  produto_nome: string;
  ordem_id?: string | null;
  ordem_numero?: number | null;
  componente_id?: string | null;
  quantidade_planejada: number;
  quantidade_reservada: number;
  quantidade_disponivel: number;
  estoque_seguranca: number;
  necessidade_liquida: number;
  data_necessidade?: string | null;
  status: string;
  origem: string;
  lead_time_dias: number;
  mensagem?: string | null;
  prioridade: 'atrasado' | 'critico' | 'normal';
  ultima_acao_tipo?: MrpAcaoTipo | null;
  ultima_acao_data?: string | null;
  ultima_acao_quantidade?: number | null;
}

export interface MrpAcaoDemandaPayload {
  demanda_id: string;
  tipo: MrpAcaoTipo;
  quantidade: number;
  unidade?: string;
  data_prometida?: string;
  fornecedor_id?: string | null;
  observacoes?: string;
  status?: 'respondida' | 'sugerida' | 'fechada';
}

export interface MrpDemandaAcao {
  id: string;
  tipo: MrpAcaoTipo;
  quantidade: number;
  unidade: string;
  data_prometida?: string | null;
  observacoes?: string | null;
  created_at: string;
  usuario_id?: string | null;
  usuario_email?: string | null;
}

export interface PcpCargaCapacidade {
  dia: string;
  centro_trabalho_id: string;
  centro_trabalho_nome: string;
  capacidade_horas: number;
  carga_total_horas: number;
  carga_setup_horas: number;
  carga_producao_horas: number;
  carga_em_execucao_horas: number;
}

export interface PcpGanttOperacao {
  ordem_id: string;
  ordem_numero: number;
  produto_nome: string;
  status: StatusProducao;
  quantidade_planejada: number;
  data_prevista_inicio?: string | null;
  data_prevista_fim?: string | null;
  operacao_id: string;
  operacao_sequencia: number;
  centro_trabalho_id?: string | null;
  centro_trabalho_nome?: string | null;
  permite_overlap: boolean;
  status_operacao: string;
  data_inicio: string;
  data_fim: string;
  quantidade_transferida: number;
  transfer_ratio: number;
  aps_locked?: boolean;
  aps_lock_reason?: string | null;
  aps_in_freeze?: boolean;
}

export interface PcpKpis {
  periodo_dias: number;
  ordens_concluidas: number;
  otif_percent: number;
  lead_time_planejado_horas: number;
  lead_time_real_horas: number;
  percentual_refugo: number;
  aderencia_ciclo: number;
}

export interface PcpAtpCtp {
  produto_id: string;
  produto_nome: string;
  estoque_atual: number;
  em_producao: number;
  demanda_confirmada: number;
  disponibilidade_atp: number;
  carga_horas_pendente: number;
  capacidade_diaria_horas: number;
  data_ctp?: string | null;
}

export interface EstoqueProjetadoPoint {
  dia: string;
  saldo_projetado: number;
  producao_prevista: number;
  entregas_previstas: number;
}

export interface PcpParetoItem {
  motivo_id: string | null;
  motivo_nome: string;
  centro_trabalho_id?: string | null;
  centro_trabalho_nome?: string | null;
  total_refugo: number;
  percentual: number;
}

export interface PcpOrdemLeadTime {
  ordem_id: string;
  ordem_numero: number;
  produto_nome: string;
  status: string;
  data_prevista_inicio?: string | null;
  data_prevista_fim?: string | null;
  data_fim_real?: string | null;
  lead_time_planejado_horas: number;
  lead_time_real_horas: number;
  atraso_horas: number;
  cumpriu_prazo?: boolean | null;
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

export async function listLotesQualidade(search?: string, status?: StatusQualidade): Promise<QualidadeLote[]> {
  return callRpc<QualidadeLote[]>('qualidade_list_lotes', {
    p_search: search || null,
    p_status: status || null
  });
}

export async function setOperacaoQARequirements(operacaoId: string, requireIp: boolean, requireIf: boolean): Promise<void> {
  await callRpc('industria_producao_set_qa_requirements', {
    p_operacao_id: operacaoId,
    p_require_ip: requireIp,
    p_require_if: requireIf
  });
}

export async function listPlanosInspecao(search?: string): Promise<PlanoInspecao[]> {
  return callRpc<PlanoInspecao[]>('qualidade_planos_list', {
    p_search: search || null
  });
}

export async function getPlanoInspecao(id: string): Promise<PlanoInspecaoDetalhe> {
  const result = await callRpc<PlanoInspecaoDetalhe[]>('qualidade_plano_get', { p_id: id });
  if (!result || result.length === 0) {
    throw new Error('Plano não encontrado.');
  }
  return result[0];
}

export async function upsertPlanoInspecao(payload: PlanoInspecaoPayload): Promise<string> {
  return callRpc<string>('qualidade_planos_upsert', {
    p_id: payload.id || null,
    p_nome: payload.nome,
    p_produto_id: payload.produto_id,
    p_tipo: payload.tipo,
    p_severidade: payload.severidade || null,
    p_aql: payload.aql || null,
    p_amostragem: payload.amostragem || null,
    p_roteiro_id: payload.roteiro_id || null,
    p_roteiro_etapa_id: payload.roteiro_etapa_id || null,
    p_ativo: payload.ativo ?? true
  });
}

export async function deletePlanoInspecao(id: string): Promise<void> {
  await callRpc('qualidade_planos_delete', { p_id: id });
}

export async function upsertPlanoCaracteristica(payload: PlanoCaracteristicaPayload): Promise<string> {
  return callRpc<string>('qualidade_plano_upsert_caracteristica', {
    p_plano_id: payload.plano_id,
    p_id: payload.id || null,
    p_descricao: payload.descricao,
    p_tolerancia_min: payload.tolerancia_min ?? null,
    p_tolerancia_max: payload.tolerancia_max ?? null,
    p_unidade: payload.unidade || null,
    p_instrumento: payload.instrumento || null
  });
}

export async function deletePlanoCaracteristica(id: string): Promise<void> {
  await callRpc('qualidade_plano_delete_caracteristica', { p_id: id });
}

// --- MRP / Demandas ---

export async function listMrpParametros(search?: string): Promise<MrpParametro[]> {
  return callRpc<MrpParametro[]>('mrp_item_parametros_list', { p_search: search || null });
}

export async function upsertMrpParametro(payload: MrpParametroPayload): Promise<string> {
  return callRpc<string>('mrp_item_parametros_upsert', {
    p_produto_id: payload.produto_id,
    p_lead_time: payload.lead_time_dias ?? 0,
    p_lote_minimo: payload.lote_minimo ?? 0,
    p_multiplo_compra: payload.multiplo_compra ?? 1,
    p_estoque_seguranca: payload.estoque_seguranca ?? 0,
    p_politica_picking: payload.politica_picking || 'FIFO',
    p_fornecedor_id: payload.fornecedor_preferencial_id || null
  });
}

export async function listMrpDemandas(status?: string): Promise<MrpDemanda[]> {
  return callRpc<MrpDemanda[]>('mrp_list_demandas', {
    p_status: status || null
  });
}

export async function reprocessarMrpOrdem(ordemId: string): Promise<void> {
  await callRpc('mrp_reprocessar_ordem', { p_ordem_id: ordemId });
}

export async function registrarAcaoMrpDemanda(payload: MrpAcaoDemandaPayload): Promise<string> {
  return callRpc<string>('mrp_registrar_acao_demanda', {
    p_demanda_id: payload.demanda_id,
    p_tipo: payload.tipo,
    p_quantidade: payload.quantidade,
    p_unidade: payload.unidade || null,
    p_data_prometida: payload.data_prometida || null,
    p_fornecedor_id: payload.fornecedor_id || null,
    p_observacoes: payload.observacoes || null,
    p_status: payload.status || null
  });
}

export async function listMrpDemandaAcoes(demandaId: string): Promise<MrpDemandaAcao[]> {
  return callRpc<MrpDemandaAcao[]>('mrp_list_demanda_acoes', {
    p_demanda_id: demandaId
  });
}

export type MrpCriarOcResult = {
  ok: boolean;
  already_exists: boolean;
  compra_pedido_id: string;
  compra_pedido_numero: number;
  quantidade?: number;
};

export async function mrpCriarOcParaDemanda(demandaId: string): Promise<MrpCriarOcResult> {
  return callRpc<MrpCriarOcResult>('mrp_criar_oc_para_demanda', { p_demanda_id: demandaId, p_preco_unitario: 0 });
}

export async function listPcpCargaCapacidade(startDate?: string, endDate?: string): Promise<PcpCargaCapacidade[]> {
  return callRpc<PcpCargaCapacidade[]>('pcp_carga_capacidade', {
    p_data_inicial: startDate || null,
    p_data_final: endDate || null
  });
}

export async function listPcpGantt(startDate?: string, endDate?: string): Promise<PcpGanttOperacao[]> {
  return callRpc<PcpGanttOperacao[]>('pcp_gantt_ordens', {
    p_data_inicial: startDate || null,
    p_data_final: endDate || null
  });
}

export async function listPcpKpis(periodoDias?: number): Promise<PcpKpis> {
  const result = await callRpc<PcpKpis[]>('pcp_kpis_execucao', {
    p_periodo_dias: periodoDias || null
  });
  return result && result.length > 0
    ? result[0]
    : {
        periodo_dias: periodoDias || 30,
        ordens_concluidas: 0,
        otif_percent: 0,
        lead_time_planejado_horas: 0,
        lead_time_real_horas: 0,
        percentual_refugo: 0,
        aderencia_ciclo: 0
      };
}

export type IndustriaWipKpis = {
  periodo_dias: number;
  ordens_wip: number;
  operacoes_na_fila: number;
  operacoes_em_execucao: number;
  operacoes_pausadas: number;
  operacoes_concluidas_periodo: number;
};

export async function getIndustriaWipKpis(periodoDias?: number): Promise<IndustriaWipKpis> {
  const result = await callRpc<IndustriaWipKpis[]>('industria_relatorio_wip', {
    p_periodo_dias: periodoDias || null
  });
  return result && result.length > 0
    ? result[0]
    : {
        periodo_dias: periodoDias || 30,
        ordens_wip: 0,
        operacoes_na_fila: 0,
        operacoes_em_execucao: 0,
        operacoes_pausadas: 0,
        operacoes_concluidas_periodo: 0,
      };
}

export type QualidadeKpis = {
  periodo_dias: number;
  lotes_total: number;
  lotes_aprovados: number;
  lotes_em_analise: number;
  lotes_bloqueados: number;
  lotes_reprovados: number;
  saldo_bloqueado: number;
  inspecoes_periodo: number;
};

export async function getQualidadeKpis(periodoDias?: number): Promise<QualidadeKpis> {
  const result = await callRpc<QualidadeKpis[]>('qualidade_kpis', {
    p_periodo_dias: periodoDias || null
  });
  return result && result.length > 0
    ? result[0]
    : {
        periodo_dias: periodoDias || 30,
        lotes_total: 0,
        lotes_aprovados: 0,
        lotes_em_analise: 0,
        lotes_bloqueados: 0,
        lotes_reprovados: 0,
        saldo_bloqueado: 0,
        inspecoes_periodo: 0,
      };
}

export async function listPcpAtpCtp(dataFinal?: string): Promise<PcpAtpCtp[]> {
  return callRpc<PcpAtpCtp[]>('pcp_atp_ctp_produtos', {
    p_data_final: dataFinal || null
  });
}

export async function listPcpEstoqueProjetado(produtoId: string, dias?: number): Promise<EstoqueProjetadoPoint[]> {
  return callRpc<EstoqueProjetadoPoint[]>('pcp_estoque_projetado', {
    p_produto_id: produtoId,
    p_dias: dias || null
  });
}

export async function listPcpParetoRefugos(startDate?: string, endDate?: string): Promise<PcpParetoItem[]> {
  return callRpc<PcpParetoItem[]>('pcp_pareto_refugos', {
    p_data_inicial: startDate || null,
    p_data_final: endDate || null
  });
}

export async function listPcpOrdensLeadTime(startDate?: string, endDate?: string): Promise<PcpOrdemLeadTime[]> {
  return callRpc<PcpOrdemLeadTime[]>('pcp_ordens_lead_time', {
    p_data_inicial: startDate || null,
    p_data_final: endDate || null
  });
}

export type PcpReplanResult = {
  run_id?: string;
  moved: number;
  remaining_overload_hours?: number;
  peak_day?: string;
  peak_capacity?: number;
  peak_load?: number;
  end_day?: string;
  freeze_until?: string;
  message?: string;
};

export async function pcpReplanejarCentroSobrecarga(
  centroTrabalhoId: string,
  dia: string,
  dataFinal?: string,
): Promise<PcpReplanResult> {
  return callRpc<PcpReplanResult>('pcp_replanejar_ct_sobrecarga', {
    p_centro_id: centroTrabalhoId,
    p_dia: dia,
    p_data_final: dataFinal || null,
  });
}

export async function pcpReplanejarCentroSobrecargaApplySubset(
  centroTrabalhoId: string,
  dia: string,
  operacaoIds: string[],
  dataFinal?: string,
): Promise<PcpReplanResult> {
  return callRpc<PcpReplanResult>('pcp_replanejar_ct_sobrecarga_apply_subset', {
    p_centro_id: centroTrabalhoId,
    p_dia: dia,
    p_operacao_ids: operacaoIds,
    p_data_final: dataFinal || null,
  });
}

export type PcpReplanPreviewRow = {
  operacao_id: string;
  ordem_id: string;
  ordem_numero: number;
  produto_nome: string;
  horas: number;
  old_ini: string | null;
  old_fim: string | null;
  new_ini: string | null;
  new_fim: string | null;
  can_move: boolean;
  reason: string;
  freeze_until?: string;
};

export async function pcpReplanCentroSobrecargaPreview(
  centroTrabalhoId: string,
  dia: string,
  dataFinal?: string,
  limit = 200,
): Promise<PcpReplanPreviewRow[]> {
  return callRpc<PcpReplanPreviewRow[]>('pcp_replanejar_ct_sobrecarga_preview', {
    p_centro_id: centroTrabalhoId,
    p_dia: dia,
    p_data_final: dataFinal || null,
    p_limit: limit,
  });
}

export type PcpApsSequenciarResult = {
  apply: boolean;
  run_id?: string;
  centro_id: string;
  data_inicial: string;
  data_final: string;
  freeze_dias?: number;
  total_operacoes: number;
  updated_operacoes: number;
  unscheduled_operacoes: number;
};

export async function pcpApsSequenciarCentro(params: {
  centroTrabalhoId: string;
  dataInicial: string;
  dataFinal: string;
  apply?: boolean;
}): Promise<PcpApsSequenciarResult> {
  return callRpc<PcpApsSequenciarResult>('pcp_aps_sequenciar_ct', {
    p_centro_id: params.centroTrabalhoId,
    p_data_inicial: params.dataInicial,
    p_data_final: params.dataFinal,
    p_apply: params.apply ?? true,
  });
}

export type PcpApsRun = {
  id: string;
  kind: 'sequencing' | 'replan_overload' | string;
  created_at: string;
  created_by: string | null;
  summary: {
    total_operacoes?: number;
    updated_operacoes?: number;
    unscheduled_operacoes?: number;
    [key: string]: any;
  };
};

export async function pcpApsListRuns(centroTrabalhoId: string, limit = 10): Promise<PcpApsRun[]> {
  return callRpc<PcpApsRun[]>('pcp_aps_list_runs', {
    p_centro_id: centroTrabalhoId,
    p_limit: limit,
  });
}

export type PcpApsUndoResult = {
  run_id: string;
  restored: number;
  skipped: number;
};

export async function pcpApsUndo(runId: string): Promise<PcpApsUndoResult> {
  return callRpc<PcpApsUndoResult>('pcp_aps_undo', { p_run_id: runId });
}

export type PcpApsRunChange = {
  operacao_id: string;
  ordem_id: string;
  ordem_numero: number;
  produto_nome: string;
  centro_trabalho_id: string | null;
  status_operacao: string;
  old_ini: string | null;
  old_fim: string | null;
  new_ini: string | null;
  new_fim: string | null;
  old_seq?: number | null;
  new_seq?: number | null;
  aps_locked?: boolean;
  aps_lock_reason?: string | null;
};

export async function pcpApsGetRunChanges(runId: string, limit = 200): Promise<PcpApsRunChange[]> {
  return callRpc<PcpApsRunChange[]>('pcp_aps_run_changes_list', {
    p_run_id: runId,
    p_limit: limit,
  });
}

export type PcpApsPreviewRow = {
  operacao_id: string;
  ordem_id: string;
  ordem_numero: number;
  produto_nome: string;
  old_ini: string | null;
  old_fim: string | null;
  new_ini: string | null;
  new_fim: string | null;
  scheduled: boolean;
  aps_locked?: boolean;
  aps_lock_reason?: string | null;
  skip_reason?: string | null;
};

export async function pcpApsPreviewSequenciarCentro(params: {
  centroTrabalhoId: string;
  dataInicial: string;
  dataFinal: string;
  limit?: number;
}): Promise<PcpApsPreviewRow[]> {
  return callRpc<PcpApsPreviewRow[]>('pcp_aps_preview_sequenciar_ct', {
    p_centro_id: params.centroTrabalhoId,
    p_data_inicial: params.dataInicial,
    p_data_final: params.dataFinal,
    p_limit: params.limit ?? 200,
  });
}

export async function setOperacaoApsLock(operacaoId: string, locked: boolean, reason?: string): Promise<void> {
  await callRpc('industria_operacao_aps_lock_set', {
    p_operacao_id: operacaoId,
    p_locked: locked,
    p_reason: reason || null,
  });
}

export type PcpApsManualResequenceResult = {
  run_id?: string | null;
  total: number;
  updated: number;
};

export async function pcpApsResequenciarCentro(centroTrabalhoId: string, operacaoIds: string[]): Promise<PcpApsManualResequenceResult> {
  return callRpc<PcpApsManualResequenceResult>('pcp_aps_resequenciar_ct', {
    p_centro_id: centroTrabalhoId,
    p_operacao_ids: operacaoIds,
  });
}

export type PcpApsBatchSequencingRow = {
  centro_id: string;
  centro_nome: string;
  run_id: string | null;
  freeze_dias: number;
  total_operacoes: number;
  updated_operacoes: number;
  unscheduled_operacoes: number;
};

export async function pcpApsSequenciarTodosCts(params: {
  dataInicial: string;
  dataFinal: string;
  apply?: boolean;
}): Promise<PcpApsBatchSequencingRow[]> {
  return callRpc<PcpApsBatchSequencingRow[]>('pcp_aps_sequenciar_todos_cts', {
    p_data_inicial: params.dataInicial,
    p_data_final: params.dataFinal,
    p_apply: params.apply ?? true,
  });
}

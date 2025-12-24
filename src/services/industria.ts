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

export type TipoOrdemIndustria = 'industrializacao' | 'beneficiamento';

export type OrdemIndustria = {
  id: string;
  numero: number;
  tipo_ordem: TipoOrdemIndustria;
  produto_nome: string;
  cliente_nome?: string | null;
  quantidade_planejada: number;
  unidade: string;
  status: StatusOrdem;
  prioridade: number;
  data_prevista_entrega?: string | null;
  total_entregue: number;
  created_at?: string | null;
  qtde_caixas?: number | null;
  numero_nf?: string | null;
  pedido_numero?: string | null;
};

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

export type OrdemIndustriaDetails = {
  id: string;
  empresa_id: string;
  numero: number;
  tipo_ordem: TipoOrdemIndustria;
  produto_final_id: string;
  produto_nome: string;
  bom_aplicado_id?: string | null;
  bom_aplicado_desc?: string | null;
  roteiro_aplicado_id?: string | null;
  roteiro_aplicado_desc?: string | null;
  execucao_ordem_id?: string | null;
  execucao_ordem_numero?: number | null;
  execucao_gerada_em?: string | null;
  usa_material_cliente?: boolean | null;
  material_cliente_id?: string | null;
  material_cliente_nome?: string | null;
  material_cliente_codigo?: string | null;
  material_cliente_unidade?: string | null;
  quantidade_planejada: number;
  unidade: string;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  status: StatusOrdem;
  prioridade: number;
  data_prevista_inicio?: string | null;
  data_prevista_fim?: string | null;
  data_prevista_entrega?: string | null;
  documento_ref?: string | null;
  numero_nf?: string | null;
  pedido_numero?: string | null;
  qtde_caixas?: number | null;
  // Origem fiscal (NF-e / XML)
  origem_fiscal_nfe_import_id?: string | null;
  origem_fiscal_nfe_item_id?: string | null;
  origem_qtd_xml?: number | null;
  origem_unidade_xml?: string | null;
  observacoes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  componentes?: OrdemComponente[];
  entregas?: OrdemEntrega[];
};

export type OrdemPayload = Partial<Omit<OrdemIndustriaDetails, 'numero' | 'produto_nome' | 'cliente_nome' | 'componentes' | 'entregas'>>;

export async function listOrdens(search?: string, tipo?: TipoOrdemIndustria, status?: string): Promise<OrdemIndustria[]> {
  return callRpc<OrdemIndustria[]>('industria_list_ordens', {
    p_search: search || null,
    p_tipo: tipo || null,
    p_status: status || null,
    p_limit: 200,
    p_offset: 0,
  });
}

export async function getOrdemDetails(id: string): Promise<OrdemIndustriaDetails> {
  return callRpc<OrdemIndustriaDetails>('industria_get_ordem_details', { p_id: id });
}

export async function saveOrdem(payload: OrdemPayload): Promise<OrdemIndustriaDetails> {
  return callRpc<OrdemIndustriaDetails>('industria_upsert_ordem', { p_payload: payload });
}

export async function manageComponente(
  ordemId: string,
  componenteId: string | null,
  produtoId: string,
  qtdPlanejada: number,
  unidade: string,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_manage_componente', {
    p_ordem_id: ordemId,
    p_componente_id: componenteId,
    p_produto_id: produtoId,
    p_quantidade_planejada: qtdPlanejada,
    p_unidade: unidade,
    p_action: action,
  });
}

export async function manageEntrega(
  ordemId: string,
  entregaId: string | null,
  dataEntrega?: string | null,
  qtdEntregue?: number | null,
  statusFaturamento?: string | null,
  documentoRef?: string,
  observacoes?: string,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_manage_entrega', {
    p_ordem_id: ordemId,
    p_entrega_id: entregaId,
    // Para delete, esses campos são ignorados no servidor. Usar null evita erro de cast ('' -> date).
    p_data_entrega: action === 'delete' ? null : (dataEntrega ?? null),
    p_quantidade_entregue: action === 'delete' ? null : (qtdEntregue ?? null),
    p_status_faturamento: action === 'delete' ? null : (statusFaturamento ?? null),
    p_documento_ref: documentoRef || null,
    p_observacoes: observacoes || null,
    p_action: action,
  });
}

export async function updateOrdemStatus(id: string, status: StatusOrdem, prioridade?: number) {
  await callRpc('industria_update_ordem_status', {
    p_id: id,
    p_status: status,
    p_prioridade: prioridade ?? 0,
  });
}

export async function cloneOrdem(id: string): Promise<OrdemIndustriaDetails> {
  return callRpc<OrdemIndustriaDetails>('industria_clone_ordem', { p_source_id: id });
}

export async function deleteOrdemBeneficiamento(id: string): Promise<void> {
  await callRpc('industria_delete_ordem', { p_id: id });
}

export async function replanejarOperacao(operacaoId: string, centroTrabalhoId: string, prioridade?: number) {
  await callRpc('industria_operacao_replanejar', {
    p_operacao_id: operacaoId,
    p_novo_centro: centroTrabalhoId,
    p_nova_prioridade: prioridade ?? null,
  });
}

export type GerarExecucaoResult = {
  producao_ordem_id: string;
  producao_ordem_numero: number | null;
  operacoes: number;
};

export async function gerarExecucaoOrdem(ordemId: string, roteiroId?: string | null): Promise<GerarExecucaoResult> {
  return callRpc<GerarExecucaoResult>('industria_ordem_gerar_execucao', {
    p_ordem_id: ordemId,
    p_roteiro_id: roteiroId ?? null,
  });
}

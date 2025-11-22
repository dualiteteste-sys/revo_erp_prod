import { callRpc } from '@/lib/api';

export type BomType = 'producao' | 'beneficiamento';

export type BomListItem = {
  id: string;
  produto_final_id: string;
  produto_nome: string;
  tipo_bom: BomType;
  codigo: string | null;
  versao: number;
  ativo: boolean;
  padrao_para_producao: boolean;
  padrao_para_beneficiamento: boolean;
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
};

export type BomComponente = {
  id: string;
  bom_id: string;
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  perda_percentual: number;
  obrigatorio: boolean;
  observacoes: string | null;
};

export type BomDetails = {
  id: string;
  empresa_id: string;
  produto_final_id: string;
  produto_nome: string;
  tipo_bom: BomType;
  codigo: string | null;
  descricao: string | null;
  versao: number;
  ativo: boolean;
  padrao_para_producao: boolean;
  padrao_para_beneficiamento: boolean;
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  componentes: BomComponente[];
};

export type BomPayload = Partial<Omit<BomDetails, 'produto_nome' | 'componentes' | 'created_at' | 'updated_at' | 'empresa_id'>>;

export async function listBoms(
  search?: string,
  produtoId?: string,
  tipoBom?: BomType,
  ativo?: boolean
): Promise<BomListItem[]> {
  return callRpc<BomListItem[]>('industria_bom_list', {
    p_search: search || null,
    p_produto_id: produtoId || null,
    p_tipo_bom: tipoBom || null,
    p_ativo: ativo ?? null,
  });
}

export async function getBomDetails(id: string): Promise<BomDetails> {
  return callRpc<BomDetails>('industria_bom_get_details', { p_id: id });
}

export async function saveBom(payload: BomPayload): Promise<BomDetails> {
  return callRpc<BomDetails>('industria_bom_upsert', { p_payload: payload });
}

export async function manageBomComponente(
  bomId: string,
  componenteId: string | null,
  produtoId: string,
  quantidade: number,
  unidade: string,
  perdaPercentual: number,
  obrigatorio: boolean,
  observacoes: string | null,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_bom_manage_componente', {
    p_bom_id: bomId,
    p_componente_id: componenteId,
    p_produto_id: produtoId,
    p_quantidade: quantidade,
    p_unidade: unidade,
    p_perda_percentual: perdaPercentual,
    p_obrigatorio: obrigatorio,
    p_observacoes: observacoes,
    p_action: action,
  });
}

export async function aplicarBomProducao(
  bomId: string,
  ordemId: string,
  modo: 'substituir' | 'adicionar' = 'substituir'
): Promise<void> {
  await callRpc('industria_aplicar_bom_em_ordem_producao', {
    p_bom_id: bomId,
    p_ordem_id: ordemId,
    p_modo: modo,
  });
}

export async function aplicarBomBeneficiamento(
  bomId: string,
  ordemId: string,
  modo: 'substituir' | 'adicionar' = 'substituir'
): Promise<void> {
  await callRpc('industria_aplicar_bom_em_ordem_beneficiamento', {
    p_bom_id: bomId,
    p_ordem_id: ordemId,
    p_modo: modo,
  });
}

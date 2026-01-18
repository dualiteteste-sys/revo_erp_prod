import { callRpc } from '@/lib/api';

export type AmbienteNfe = 'homologacao' | 'producao';

export type NfeEmissaoRow = {
  id: string;
  status: string;
  numero: number | null;
  serie: number | null;
  chave_acesso: string | null;
  destinatario_pessoa_id: string | null;
  destinatario_nome: string | null;
  ambiente: AmbienteNfe;
  natureza_operacao: string | null;
  valor_total: number | null;
  total_produtos: number | null;
  total_descontos: number | null;
  total_frete: number | null;
  total_impostos: number | null;
  total_nfe: number | null;
  payload: any;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type NfeItemRow = {
  id: string;
  produto_id: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_desconto: number;
  ncm: string | null;
  cfop: string | null;
  cst: string | null;
  csosn: string | null;
  ordem: number;
};

export type NfeAuditRow = {
  kind: string;
  occurred_at: string;
  message: string | null;
  payload: any;
  source: string | null;
};

export async function fiscalNfeEmissoesList(params: { status?: string; q?: string; limit?: number } = {}) {
  return callRpc<NfeEmissaoRow[]>('fiscal_nfe_emissoes_list', {
    p_status: params.status ?? null,
    p_q: params.q ?? null,
    p_limit: params.limit ?? 200,
  });
}

export async function fiscalNfeEmissaoItensList(emissaoId: string) {
  return callRpc<NfeItemRow[]>('fiscal_nfe_emissao_itens_list', { p_emissao_id: emissaoId });
}

export async function fiscalNfeAuditTimelineList(emissaoId: string, params?: { limit?: number }) {
  return callRpc<NfeAuditRow[]>('fiscal_nfe_audit_timeline_list', {
    p_emissao_id: emissaoId,
    p_limit: params?.limit ?? 200,
  });
}

export async function fiscalNfeEmissaoDraftUpsert(input: {
  emissaoId?: string | null;
  destinatarioPessoaId: string;
  ambiente: AmbienteNfe;
  naturezaOperacao: string;
  totalFrete: number;
  payload: any;
  items: Array<{
    produto_id: string | null;
    descricao: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_desconto: number;
    ncm: string | null;
    cfop: string | null;
    cst: string | null;
    csosn: string | null;
  }>;
}) {
  return callRpc<string>('fiscal_nfe_emissao_draft_upsert', {
    p_emissao_id: input.emissaoId ?? null,
    p_destinatario_pessoa_id: input.destinatarioPessoaId,
    p_ambiente: input.ambiente,
    p_natureza_operacao: input.naturezaOperacao,
    p_total_frete: input.totalFrete,
    p_payload: input.payload ?? {},
    p_items: input.items ?? [],
  });
}


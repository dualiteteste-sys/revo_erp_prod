import { callRpc } from '@/lib/api';

export type NfeImportPayload = {
  chave_acesso: string;
  origem_upload?: 'xml' | 'danfe';
  numero?: string;
  serie?: string;
  emitente_cnpj?: string;
  emitente_nome?: string;
  destinat_cnpj?: string;
  destinat_nome?: string;
  data_emissao?: string;
  total_produtos?: number;
  total_nf?: number;
  xml_raw?: string;
  items?: any[];
};

export type NfeImportItem = {
  item_id: string;
  n_item: number;
  cprod: string | null;
  ean: string | null;
  xprod: string | null;
  ucom: string | null;
  qcom: number;
  vuncom: number;
  vprod: number;
  match_produto_id: string | null;
  match_strategy: 'codigo' | 'ean' | 'none';
};

export type PreviewResult = {
  import: any;
  itens: NfeImportItem[];
};

export type MatchItem = {
  item_id: string;
  produto_id: string;
};

/**
 * Registra ou atualiza um import de NF-e (idempotente pela chave de acesso).
 */
export async function registerNfeImport(payload: NfeImportPayload): Promise<string> {
  return callRpc<string>('fiscal_nfe_import_register', { p_payload: payload });
}

/**
 * Retorna o preview do import com a tentativa de match automático de produtos.
 */
export async function previewBeneficiamento(importId: string): Promise<PreviewResult> {
  return callRpc<PreviewResult>('beneficiamento_preview', { p_import_id: importId });
}

/**
 * Processa o import, gerando as movimentações de estoque.
 * Requer que todos os itens tenham match (automático ou fornecido em p_matches).
 */
export async function processBeneficiamentoImport(importId: string, matches: MatchItem[] = []): Promise<void> {
  return callRpc<void>('beneficiamento_process_from_import', {
    p_import_id: importId,
    p_matches: matches
  });
}

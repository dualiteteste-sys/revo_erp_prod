import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

export type AmbienteNfse = 'homologacao' | 'producao';

export type NfseEmissaoRow = {
  id: string;
  status: string;
  numero: number | null;
  codigo_verificacao: string | null;
  tomador_pessoa_id: string | null;
  tomador_nome: string | null;
  discriminacao: string | null;
  valor_servicos: number | null;
  iss_retido: boolean;
  aliquota_iss: number | null;
  item_lista_servico: string | null;
  codigo_municipio: string | null;
  natureza_operacao: string | null;
  ambiente: AmbienteNfse;
  payload: any;
  last_error: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  created_at: string;
  updated_at: string;
};

export type NfseSubmitResult = {
  ok: boolean;
  status?: string;
  error?: string;
  detail?: string;
  focus_response?: any;
};

export async function fiscalNfseEmissoesList(
  params: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  return callRpc<{ rows: NfseEmissaoRow[]; total: number; page: number; page_size: number }>(
    'fiscal_nfse_emissoes_list',
    {
      p_status: params.status ?? null,
      p_search: params.search ?? null,
      p_page: params.page ?? 1,
      p_page_size: params.pageSize ?? 50,
    },
  );
}

export async function fiscalNfseDraftUpsert(input: {
  emissaoId?: string | null;
  tomadorPessoaId: string;
  ambiente: AmbienteNfse;
  naturezaOperacao: string;
  discriminacao: string;
  valorServicos: number;
  issRetido: boolean;
  aliquotaIss: number;
  itemListaServico: string;
  codigoMunicipio: string;
}) {
  return callRpc<string>('fiscal_nfse_emissao_draft_upsert', {
    p_data: {
      id: input.emissaoId || undefined,
      tomador_pessoa_id: input.tomadorPessoaId,
      ambiente: input.ambiente,
      natureza_operacao: input.naturezaOperacao,
      discriminacao: input.discriminacao,
      valor_servicos: input.valorServicos,
      iss_retido: input.issRetido,
      aliquota_iss: input.aliquotaIss,
      item_lista_servico: input.itemListaServico,
      codigo_municipio: input.codigoMunicipio,
    },
  });
}

export async function fiscalNfseSubmit(emissaoId: string): Promise<NfseSubmitResult> {
  const { data, error } = await supabase.functions.invoke('focusnfe-nfse-emit', {
    body: { emissao_id: emissaoId },
  });

  if (error) {
    try {
      const ctx = (error as any)?.context;
      if (ctx instanceof Response) {
        const body = await ctx.json();
        if (body && typeof body === 'object') return body as NfseSubmitResult;
      }
    } catch { /* response body already consumed */ }

    return {
      ok: false,
      error: 'EDGE_ERROR',
      detail: (error as any)?.message || String(error),
    };
  }

  return data as NfseSubmitResult;
}

export async function fiscalNfseConsultaStatus(emissaoId: string): Promise<NfseSubmitResult> {
  const { data, error } = await supabase.functions.invoke('focusnfe-nfse-status', {
    body: { emissao_id: emissaoId },
  });
  if (error) {
    const msg = (error as any)?.message || String(error);
    return { ok: false, error: 'EDGE_ERROR', detail: msg };
  }
  return data as NfseSubmitResult;
}

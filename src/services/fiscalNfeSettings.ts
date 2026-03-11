import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

export type FiscalFeatureFlags = {
  empresa_id: string;
  nfe_emissao_enabled: boolean;
};

export async function getFiscalFeatureFlags() {
  return callRpc<FiscalFeatureFlags>('fiscal_feature_flags_get');
}

export async function setFiscalNfeEmissaoEnabled(enabled: boolean) {
  return callRpc<FiscalFeatureFlags>('fiscal_feature_flags_set', { p_nfe_emissao_enabled: !!enabled });
}

export type FiscalNfeEmissaoConfig = {
  id?: string;
  empresa_id: string;
  provider_slug: string;
  ambiente: 'homologacao' | 'producao';
  webhook_secret_hint: string | null;
  observacoes: string | null;
};

export async function getFiscalNfeEmissaoConfig(providerSlug: string = 'FOCUSNFE') {
  return callRpc<FiscalNfeEmissaoConfig | null>('fiscal_nfe_emissao_config_get', { p_provider_slug: providerSlug });
}

export async function upsertFiscalNfeEmissaoConfig(input: {
  provider_slug?: string;
  ambiente: 'homologacao' | 'producao';
  webhook_secret_hint: string | null;
  observacoes: string | null;
}) {
  return callRpc('fiscal_nfe_emissao_config_upsert', {
    p_provider_slug: input.provider_slug ?? 'FOCUSNFE',
    p_ambiente: input.ambiente,
    p_webhook_secret_hint: input.webhook_secret_hint,
    p_observacoes: input.observacoes,
  });
}

export type FiscalNfeEmitente = {
  empresa_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  ie: string | null;
  im: string | null;
  cnae: string | null;
  crt: number | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_municipio: string | null;
  endereco_municipio_codigo: string | null;
  endereco_uf: string | null;
  endereco_cep: string | null;
  telefone: string | null;
  email: string | null;
  certificado_storage_path: string | null;
  certificado_validade: string | null;
  certificado_cnpj: string | null;
  certificado_senha_encrypted: string | null;
};

export async function getFiscalNfeEmitente() {
  return callRpc<FiscalNfeEmitente | null>('fiscal_nfe_emitente_get');
}

export async function upsertFiscalNfeEmitente(emitente: Partial<FiscalNfeEmitente>) {
  return callRpc('fiscal_nfe_emitente_upsert', { p_emitente: emitente });
}

export type FiscalNfeNumeracao = {
  id?: string;
  empresa_id: string;
  serie: number;
  proximo_numero: number;
  ativo: boolean;
};

export async function listFiscalNfeNumeracoes() {
  return callRpc<FiscalNfeNumeracao[]>('fiscal_nfe_numeracoes_list');
}

export async function upsertFiscalNfeNumeracao(input: { serie: number; proximo_numero: number; ativo: boolean }) {
  return callRpc('fiscal_nfe_numeracao_upsert', {
    p_serie: input.serie,
    p_proximo_numero: input.proximo_numero,
    p_ativo: !!input.ativo,
  });
}

// ── Focus NFe Empresa Registration ──────────────────────────

export type FocusNfeEmpresaStatus = {
  focusnfe_registrada: boolean;
  focusnfe_registrada_em: string | null;
  focusnfe_ultimo_erro: string | null;
  certificado_validade: string | null;
  certificado_cnpj: string | null;
};

export async function getFocusNfeEmpresaStatus() {
  return callRpc<FocusNfeEmpresaStatus | null>('fiscal_nfe_emitente_focusnfe_status');
}

export async function registerFocusNfeEmpresa(): Promise<{ ok: boolean; error?: string; detail?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('focusnfe-empresa', { body: {} });
  if (error) {
    // Try to extract structured error from edge function response body
    try {
      const body = await (error as any)?.context?.json?.();
      if (body?.detail || body?.error) {
        return { ok: false, error: body.error, detail: body.detail };
      }
    } catch { /* ignore parse failures */ }
    const msg = (error as any)?.message || String(error);
    return { ok: false, error: msg };
  }
  return data as { ok: boolean; error?: string; detail?: string; message?: string };
}


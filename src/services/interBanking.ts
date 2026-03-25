/**
 * Service layer for Banco Inter integration.
 * Calls Edge Functions (inter-boleto) for all bank operations.
 */

import { supabase } from '@/lib/supabaseClient';
import { callRpc } from '@/lib/api';

// ── Types ────────────────────────────────────────────────

export interface InterConfig {
  configured: boolean;
  id?: string;
  ambiente: 'sandbox' | 'producao';
  is_active: boolean;
  client_id?: string;
  has_client_secret?: boolean;
  has_cert?: boolean;
  has_key?: boolean;
  pix_chave?: string;
  webhook_registered?: boolean;
  webhook_url?: string;
  last_token_at?: string;
  last_error?: string;
  updated_at?: string;
}

export interface InterConfigPayload {
  client_id?: string;
  pix_chave?: string;
  ambiente?: string;
  is_active?: boolean;
}

export interface InterSecretsPayload {
  client_secret?: string;
  cert_pem?: string;
  key_pem?: string;
}

export interface InterRegisterResult {
  ok: boolean;
  error?: string;
  codigoSolicitacao?: string;
  nossoNumero?: string;
  linhaDigitavel?: string;
  codigoBarras?: string;
  situacao?: string;
}

export interface InterTestResult {
  ok: boolean;
  error?: string;
  scopes?: string;
  expires_in?: number;
}

// ── Config (via RPC) ─────────────────────────────────────

export async function getInterConfig(): Promise<InterConfig> {
  return callRpc<InterConfig>('financeiro_inter_config_get', {});
}

export async function saveInterConfig(payload: InterConfigPayload): Promise<void> {
  await callRpc('financeiro_inter_config_upsert', { p_payload: payload });
}

// ── Secrets (via Edge Function — encrypted) ──────────────

export async function saveInterSecrets(secrets: InterSecretsPayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'save-secrets', ...secrets },
  });
  if (error) throw new Error(error.message || 'Erro ao salvar credenciais.');
  if (data && !data.ok) throw new Error(data.error || 'Erro ao salvar credenciais.');
}

// ── Test Connection ──────────────────────────────────────

export async function testInterConnection(): Promise<InterTestResult> {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'test' },
  });
  if (error) return { ok: false, error: error.message };
  return data as InterTestResult;
}

// ── Register Boleto ──────────────────────────────────────

export async function registerBoletoInter(cobrancaId: string): Promise<InterRegisterResult> {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'register', cobranca_id: cobrancaId },
  });
  if (error) throw new Error(error.message || 'Erro ao registrar boleto no Inter.');
  if (data && !data.ok) throw new Error(data.error || 'Erro ao registrar boleto.');
  return data as InterRegisterResult;
}

// ── Get Boleto PDF ───────────────────────────────────────

export async function getBoletoInterPdf(codigoSolicitacao: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'pdf', codigo_solicitacao: codigoSolicitacao },
  });
  if (error) throw new Error(error.message || 'Erro ao baixar PDF.');
  if (data && !data.ok) throw new Error(data.error || 'Erro ao baixar PDF.');
  return data.pdf as string;
}

// ── Check Status ─────────────────────────────────────────

export async function checkBoletoInterStatus(codigoSolicitacao: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'status', codigo_solicitacao: codigoSolicitacao },
  });
  if (error) throw new Error(error.message || 'Erro ao consultar status.');
  return data;
}

// ── Cancel Boleto ────────────────────────────────────────

export async function cancelBoletoInter(codigoSolicitacao: string, motivo?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'cancel', codigo_solicitacao: codigoSolicitacao, motivo },
  });
  if (error) throw new Error(error.message || 'Erro ao cancelar boleto.');
  if (data && !data.ok) throw new Error(data.error || 'Erro ao cancelar boleto.');
}

// ── Register Webhook ─────────────────────────────────────

export async function registerInterWebhook(webhookUrl: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('inter-boleto', {
    body: { action: 'register-webhook', webhook_url: webhookUrl },
  });
  if (error) throw new Error(error.message || 'Erro ao registrar webhook.');
  if (data && !data.ok) throw new Error(data.error || 'Erro ao registrar webhook.');
}

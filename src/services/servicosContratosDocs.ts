import { supabase } from '@/lib/supabaseClient';

const sb = supabase as any;

export type ServicosContratoTemplate = {
  id: string;
  empresa_id: string;
  slug: string;
  titulo: string;
  corpo: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServicosContratoDocumento = {
  id: string;
  empresa_id: string;
  contrato_id: string;
  template_id: string | null;
  titulo: string;
  expires_at: string | null;
  revoked_at: string | null;
  accepted_at: string | null;
  accepted_nome: string | null;
  accepted_email: string | null;
  created_at: string;
};

export async function listContratoTemplates(params?: { activeOnly?: boolean }): Promise<ServicosContratoTemplate[]> {
  const { activeOnly = true } = params ?? {};
  const { data, error } = await sb.rpc('servicos_contratos_templates_list', {
    p_active_only: activeOnly,
  });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function createContratoDocumento(params: {
  contratoId: string;
  templateId: string;
  expiresInDays?: number;
}): Promise<{ docId: string; token: string; path: string; expiresAt: string | null }> {
  const { contratoId, templateId, expiresInDays = 30 } = params;
  const { data, error } = await sb.rpc('servicos_contratos_document_create', {
    p_contrato_id: contratoId,
    p_template_id: templateId,
    p_expires_in_days: expiresInDays,
  });
  if (error) throw error;
  return {
    docId: String(data?.doc_id),
    token: String(data?.token),
    path: String(data?.path),
    expiresAt: data?.expires_at ?? null,
  };
}

export async function listContratoDocumentos(params: { contratoId: string; limit?: number }): Promise<ServicosContratoDocumento[]> {
  const { contratoId, limit = 20 } = params;
  const { data, error } = await sb.rpc('servicos_contratos_document_list', {
    p_contrato_id: contratoId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function revokeContratoDocumento(params: { docId: string }): Promise<{ revokedAt: string }> {
  const { docId } = params;
  const { data, error } = await sb.rpc('servicos_contratos_document_revoke', { p_doc_id: docId });
  if (error) throw error;
  return { revokedAt: String(data?.revoked_at) };
}


import { callRpc } from '@/lib/api';

export type OsCommsTemplate = {
  id: string;
  slug: string;
  canal: 'whatsapp' | 'email';
  titulo: string;
  assunto: string | null;
  corpo: string;
  active: boolean;
};

export type OsCommsLog = {
  id: string;
  direction: 'outbound' | 'inbound';
  canal: 'whatsapp' | 'email' | 'portal' | 'nota';
  to_value: string | null;
  assunto: string | null;
  corpo: string;
  template_slug: string | null;
  actor_email: string | null;
  created_at: string;
};

export async function listOsCommsTemplates(params?: { canal?: 'whatsapp' | 'email' | null; limit?: number }): Promise<OsCommsTemplate[]> {
  const payload = await callRpc<any>('os_comms_templates_list', {
    p_canal: params?.canal ?? null,
    p_limit: params?.limit ?? 100,
  });
  return Array.isArray(payload) ? (payload as OsCommsTemplate[]) : [];
}

export async function listOsCommsLogs(osId: string, limit = 50): Promise<OsCommsLog[]> {
  const payload = await callRpc<any>('os_comms_logs_list', { p_os_id: osId, p_limit: limit });
  return Array.isArray(payload) ? (payload as OsCommsLog[]) : [];
}

export async function registerOsCommsLog(params: {
  osId: string;
  canal: 'whatsapp' | 'email' | 'nota';
  toValue?: string | null;
  assunto?: string | null;
  corpo: string;
  templateSlug?: string | null;
}): Promise<string> {
  return await callRpc<string>('os_comms_log_register', {
    p_os_id: params.osId,
    p_canal: params.canal,
    p_to_value: params.toValue ?? null,
    p_assunto: params.assunto ?? null,
    p_corpo: params.corpo,
    p_template_slug: params.templateSlug ?? null,
  });
}

export async function createOsPortalLink(params: { osId: string; expiresInDays?: number }): Promise<{
  token: string;
  token_hash: string;
  expires_at: string;
  path: string;
}> {
  const payload = await callRpc<any>('os_portal_link_create', {
    p_os_id: params.osId,
    p_expires_in_days: params.expiresInDays ?? 30,
  });
  if (!payload?.token || !payload?.path) throw new Error('Resposta inválida ao criar link do portal.');
  return payload;
}


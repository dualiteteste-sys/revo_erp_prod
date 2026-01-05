import { callRpc } from '@/lib/api';

export type OsPortalChecklistItem = {
  step_id: string;
  pos: number;
  titulo: string;
  descricao: string | null;
  done: boolean;
  done_at: string | null;
};

export type OsPortalPayload = {
  os: {
    id: string;
    numero: number | string;
    status: string;
    descricao: string | null;
    data_prevista: string | null;
    updated_at: string;
  };
  checklist: {
    progress: { total: number; done: number; pct: number };
    items: OsPortalChecklistItem[];
  };
};

export async function getOsPortal(token: string): Promise<OsPortalPayload> {
  const payload = await callRpc<any>('os_portal_get', { p_token: token });
  if (!payload?.os?.id) throw new Error('Link inválido ou expirado.');
  return payload as OsPortalPayload;
}

export async function sendOsPortalMessage(params: { token: string; nome: string; mensagem: string }): Promise<void> {
  await callRpc('os_portal_message_create', {
    p_token: params.token,
    p_nome: params.nome,
    p_mensagem: params.mensagem,
  });
}


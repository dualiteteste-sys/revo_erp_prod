import { callRpc } from '@/lib/api';

export type ServicosContratoPortalPayload = {
  documento: {
    id: string;
    titulo: string;
    corpo: string;
    expires_at: string | null;
    revoked_at: string | null;
    accepted_at: string | null;
    accepted_nome: string | null;
    accepted_email: string | null;
    created_at: string;
  };
  contrato: {
    id: string;
    numero: string | null;
    descricao: string;
    status: string;
    valor_mensal: number;
    data_inicio: string | null;
    data_fim: string | null;
  };
  cliente: {
    id: string | null;
    nome: string | null;
    email: string | null;
  };
};

export async function getContratoPortal(token: string): Promise<ServicosContratoPortalPayload> {
  const payload = await callRpc<any>('servicos_contratos_portal_get', { p_token: token });
  if (!payload?.documento?.id) throw new Error('Link inválido ou expirado.');
  return payload as ServicosContratoPortalPayload;
}

export async function acceptContratoPortal(params: {
  token: string;
  nome: string;
  email: string;
}): Promise<{ acceptedAt: string }> {
  const res = await callRpc<any>('servicos_contratos_portal_accept', {
    p_token: params.token,
    p_nome: params.nome,
    p_email: params.email,
  });
  return { acceptedAt: String(res?.accepted_at ?? new Date().toISOString()) };
}


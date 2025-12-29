import { supabase } from '../lib/supabaseClient';
import { callRpc } from '@/lib/api';

const sb = supabase as any;

export type ServicoContratoStatus = 'ativo' | 'suspenso' | 'cancelado';
export type ServicoContrato = {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  numero: string | null;
  descricao: string;
  valor_mensal: number;
  status: ServicoContratoStatus;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listContratos(): Promise<ServicoContrato[]> {
  const { data, error } = await sb.from('servicos_contratos').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function upsertContrato(payload: Partial<ServicoContrato> & { descricao: string }): Promise<ServicoContrato> {
  const { data, error } = await sb.from('servicos_contratos').upsert(payload as any).select().single();
  if (error) throw error;
  return data as any;
}

export async function deleteContrato(id: string): Promise<void> {
  const { error } = await sb.from('servicos_contratos').delete().eq('id', id);
  if (error) throw error;
}

export type NotaServicoStatus = 'rascunho' | 'emitida' | 'cancelada';
export type NotaServico = {
  id: string;
  empresa_id: string;
  contrato_id: string | null;
  competencia: string | null;
  descricao: string;
  valor: number;
  status: NotaServicoStatus;
  created_at: string;
  updated_at: string;
};

export async function listNotasServico(): Promise<NotaServico[]> {
  const { data, error } = await sb.from('servicos_notas').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function upsertNotaServico(payload: Partial<NotaServico> & { descricao: string }): Promise<NotaServico> {
  const { data, error } = await sb.from('servicos_notas').upsert(payload as any).select().single();
  if (error) throw error;
  return data as any;
}

export async function deleteNotaServico(id: string): Promise<void> {
  const { error } = await sb.from('servicos_notas').delete().eq('id', id);
  if (error) throw error;
}

export type CobrancaStatus = 'pendente' | 'paga' | 'cancelada';
export type CobrancaServico = {
  id: string;
  empresa_id: string;
  nota_id: string | null;
  cliente_id: string | null;
  data_vencimento: string;
  valor: number;
  status: CobrancaStatus;
  conta_a_receber_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listCobrancasServico(): Promise<CobrancaServico[]> {
  const { data, error } = await sb.from('servicos_cobrancas').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function upsertCobrancaServico(payload: Partial<CobrancaServico> & { data_vencimento: string; valor: number }): Promise<CobrancaServico> {
  const { data, error } = await sb.from('servicos_cobrancas').upsert(payload as any).select().single();
  if (error) throw error;
  return data as any;
}

export async function deleteCobrancaServico(id: string): Promise<void> {
  const { error } = await sb.from('servicos_cobrancas').delete().eq('id', id);
  if (error) throw error;
}

export async function gerarContaAReceberParaCobranca(params: {
  cobrancaId: string;
  clienteId: string | null;
  descricao: string;
  valor: number;
  dataVencimento: string;
}): Promise<string> {
  const conta = await callRpc<any>('create_update_conta_a_receber', {
    p_payload: {
      cliente_id: params.clienteId,
      descricao: params.descricao,
      valor: params.valor,
      data_vencimento: params.dataVencimento,
      status: 'pendente',
      observacoes: `Gerado por cobrança de serviço (MVP). cobranca_id=${params.cobrancaId}`,
    },
  });

  const contaId = conta?.id as string | undefined;
  if (!contaId) throw new Error('Falha ao gerar conta a receber.');

  await sb
    .from('servicos_cobrancas')
    .update({ conta_a_receber_id: contaId })
    .eq('id', params.cobrancaId);

  return contaId;
}

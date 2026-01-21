import { callRpc } from '@/lib/api';

export type ServicoContratoStatus = 'ativo' | 'suspenso' | 'cancelado';
export type ServicoContrato = {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  servico_id?: string | null;
  numero: string | null;
  descricao: string;
  valor_mensal: number;
  status: ServicoContratoStatus;
  data_inicio: string | null;
  data_fim: string | null;
  fidelidade_meses?: number | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listContratos(): Promise<ServicoContrato[]> {
  const rows = await callRpc<any>('servicos_contratos_list', { p_limit: 500 });
  return (rows ?? []) as any;
}

export async function upsertContrato(payload: Partial<ServicoContrato> & { descricao: string }): Promise<ServicoContrato> {
  const row = await callRpc<any>('servicos_contratos_upsert', { p_payload: payload as any });
  return row as any;
}

export async function deleteContrato(id: string): Promise<void> {
  await callRpc('servicos_contratos_delete', { p_id: id });
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
  const rows = await callRpc<any>('servicos_notas_list', { p_limit: 500 });
  return (rows ?? []) as any;
}

export async function upsertNotaServico(payload: Partial<NotaServico> & { descricao: string }): Promise<NotaServico> {
  const row = await callRpc<any>('servicos_notas_upsert', { p_payload: payload as any });
  return row as any;
}

export async function deleteNotaServico(id: string): Promise<void> {
  await callRpc('servicos_notas_delete', { p_id: id });
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
  const rows = await callRpc<any>('servicos_cobrancas_list', { p_limit: 500 });
  return (rows ?? []) as any;
}

export async function upsertCobrancaServico(payload: Partial<CobrancaServico> & { data_vencimento: string; valor: number }): Promise<CobrancaServico> {
  const row = await callRpc<any>('servicos_cobrancas_upsert', { p_payload: payload as any });
  return row as any;
}

export async function deleteCobrancaServico(id: string): Promise<void> {
  await callRpc('servicos_cobrancas_delete', { p_id: id });
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

  await callRpc('servicos_cobrancas_set_conta_a_receber', {
    p_cobranca_id: params.cobrancaId,
    p_conta_a_receber_id: contaId,
  });

  return contaId;
}

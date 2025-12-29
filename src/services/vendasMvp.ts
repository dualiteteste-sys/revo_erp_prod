import { supabase } from '../lib/supabaseClient';
import { callRpc } from '@/lib/api';
import { getVendaDetails, saveVenda, type VendaDetails } from './vendas';

const sb = supabase as any;

export type ExpedicaoStatus = 'separando' | 'embalado' | 'enviado' | 'entregue' | 'cancelado';
export type Expedicao = {
  id: string;
  empresa_id: string;
  pedido_id: string;
  status: ExpedicaoStatus;
  transportadora_id: string | null;
  tracking_code: string | null;
  data_envio: string | null;
  data_entrega: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listExpedicoes(): Promise<Expedicao[]> {
  const { data, error } = await sb
    .from('vendas_expedicoes')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function upsertExpedicao(payload: Partial<Expedicao> & { pedido_id: string }): Promise<Expedicao> {
  const { data, error } = await sb
    .from('vendas_expedicoes')
    // @ts-ignore
    .upsert(payload, { onConflict: 'empresa_id,pedido_id' })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export type VendaAutomacao = {
  id: string;
  empresa_id: string;
  nome: string;
  gatilho: string;
  enabled: boolean;
  config: any;
  created_at: string;
  updated_at: string;
};

export async function listAutomacoesVendas(): Promise<VendaAutomacao[]> {
  const { data, error } = await sb
    .from('vendas_automacoes')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function upsertAutomacaoVendas(payload: Partial<VendaAutomacao> & { nome: string }): Promise<VendaAutomacao> {
  const { data, error } = await sb
    .from('vendas_automacoes')
    // @ts-ignore
    .upsert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function deleteAutomacaoVendas(id: string): Promise<void> {
  const { error } = await sb.from('vendas_automacoes').delete().eq('id', id);
  if (error) throw error;
}

export type DevolucaoStatus = 'registrada' | 'processada' | 'cancelada';
export type Devolucao = {
  id: string;
  empresa_id: string;
  pedido_id: string;
  data_devolucao: string;
  motivo: string | null;
  valor_total: number;
  status: DevolucaoStatus;
  created_at: string;
  updated_at: string;
};

export type DevolucaoItem = {
  id: string;
  devolucao_id: string;
  produto_id: string;
  quantidade: number;
  valor_unitario: number;
  created_at: string;
};

export async function listDevolucoes(): Promise<(Devolucao & { itens: DevolucaoItem[] })[]> {
  const { data, error } = await sb
    .from('vendas_devolucoes')
    .select('*, itens:vendas_devolucao_itens(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function createDevolucaoWithSideEffects(params: {
  pedidoId: string;
  motivo?: string | null;
  itens: { produto_id: string; quantidade: number; valor_unitario: number }[];
  contaCorrenteId: string;
}): Promise<string> {
  const valorTotal = params.itens.reduce((acc, it) => acc + (Number(it.quantidade) * Number(it.valor_unitario)), 0);

  const { data: devolucaoRow, error: devolucaoError } = await sb
    .from('vendas_devolucoes')
    // @ts-ignore
    .insert({
      pedido_id: params.pedidoId,
      motivo: params.motivo ?? null,
      valor_total: valorTotal,
      status: 'registrada',
    })
    .select('id')
    .single();

  if (devolucaoError) throw devolucaoError;
  const devolucaoId = (devolucaoRow as any).id as string;

  const itensPayload = params.itens.map((it) => ({
    devolucao_id: devolucaoId,
    produto_id: it.produto_id,
    quantidade: it.quantidade,
    valor_unitario: it.valor_unitario,
  }));

  const { error: itensError } = await sb
    .from('vendas_devolucao_itens')
    // @ts-ignore
    .insert(itensPayload);
  if (itensError) throw itensError;

  // Estoque: devolução volta para o saldo (entrada)
  for (const it of params.itens) {
    await callRpc('suprimentos_registrar_movimento', {
      p_produto_id: it.produto_id,
      p_tipo: 'entrada',
      p_quantidade: it.quantidade,
      p_custo_unitario: null,
      p_documento_ref: `DEVOL-${devolucaoId}`,
      p_observacao: params.motivo || 'Devolução de venda (MVP)',
    });
  }

  // Financeiro: estorno (saída)
  await callRpc('financeiro_movimentacoes_upsert', {
    p_payload: {
      conta_corrente_id: params.contaCorrenteId,
      tipo_mov: 'saida',
      valor: valorTotal,
      descricao: `Devolução de venda (${devolucaoId})`,
      documento_ref: `DEVOL-${devolucaoId}`,
      origem_tipo: 'venda_devolucao',
      origem_id: devolucaoId,
      categoria: 'Devoluções',
      observacoes: params.motivo || null,
    },
  });

  await sb.from('vendas_devolucoes').update({ status: 'processada' }).eq('id', devolucaoId);

  return devolucaoId;
}

export async function finalizePdv(params: {
  pedidoId: string;
  contaCorrenteId: string;
  estoqueEnabled?: boolean;
}): Promise<VendaDetails> {
  const venda = await getVendaDetails(params.pedidoId);

  // Marca canal PDV + status concluído (idempotente)
  const updated = await saveVenda({
    id: venda.id,
    canal: 'pdv' as any,
    status: 'concluido' as any,
  } as any);

  // Financeiro: entrada do PDV
  await callRpc('financeiro_movimentacoes_upsert', {
    p_payload: {
      conta_corrente_id: params.contaCorrenteId,
      tipo_mov: 'entrada',
      valor: venda.total_geral,
      descricao: `Venda PDV #${venda.numero}`,
      documento_ref: `PDV-${venda.numero}`,
      origem_tipo: 'venda_pdv',
      origem_id: venda.id,
      categoria: 'Vendas',
      observacoes: 'Gerado automaticamente pelo PDV (MVP)',
    },
  });

  if (params.estoqueEnabled !== false) {
    for (const it of venda.itens || []) {
      await callRpc('suprimentos_registrar_movimento', {
        p_produto_id: it.produto_id,
        p_tipo: 'saida',
        p_quantidade: it.quantidade,
        p_custo_unitario: null,
        p_documento_ref: `PDV-${venda.numero}`,
        p_observacao: 'Saída de estoque (PDV MVP)',
      });
    }
  }

  return updated;
}

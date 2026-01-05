import { supabase } from '../lib/supabaseClient';
import { callRpc, RpcError } from '@/lib/api';
import { getVendaDetails, saveVenda, type VendaDetails } from './vendas';
import { traceAction } from '@/lib/tracing';
import {
  bumpPdvFinalizeAttempt,
  listPdvFinalizeQueue,
  removePdvFinalizeQueue,
  upsertPdvFinalizeQueue,
} from '@/lib/offlineQueue';

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

export type ExpedicaoSlaStats = {
  abertas: number;
  overdue: number;
  enviado: number;
  entregue: number;
  cancelado: number;
};

export type ExpedicaoSlaRow = {
  expedicao_id: string;
  pedido_id: string;
  pedido_numero: number;
  cliente_nome: string | null;
  status: ExpedicaoStatus;
  tracking_code: string | null;
  data_envio: string | null;
  data_entrega: string | null;
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
  events_count: number;
  sla_deadline_at: string;
  age_hours: number;
  overdue: boolean;
  hours_left: number;
};

export async function getExpedicaoSlaStats(params?: { slaHours?: number }): Promise<ExpedicaoSlaStats> {
  const slaHours = params?.slaHours ?? 48;
  try {
    const rows = await callRpc<any[]>('vendas_expedicoes_sla_stats', { p_sla_hours: slaHours });
    const row = Array.isArray(rows) ? rows[0] : null;
    return {
      abertas: Number(row?.abertas ?? 0),
      overdue: Number(row?.overdue ?? 0),
      enviado: Number(row?.enviado ?? 0),
      entregue: Number(row?.entregue ?? 0),
      cancelado: Number(row?.cancelado ?? 0),
    };
  } catch (e: any) {
    if (e instanceof RpcError && e.status === 404) {
      return { abertas: 0, overdue: 0, enviado: 0, entregue: 0, cancelado: 0 };
    }
    throw e;
  }
}

export async function listExpedicoesSla(params?: {
  slaHours?: number;
  onlyOverdue?: boolean;
  status?: ExpedicaoStatus[] | null;
  limit?: number;
  offset?: number;
}): Promise<ExpedicaoSlaRow[]> {
  const slaHours = params?.slaHours ?? 48;
  try {
    return await callRpc<ExpedicaoSlaRow[]>('vendas_expedicoes_sla_list', {
      p_sla_hours: slaHours,
      p_only_overdue: params?.onlyOverdue ?? false,
      p_status: params?.status ?? null,
      p_limit: params?.limit ?? 200,
      p_offset: params?.offset ?? 0,
    });
  } catch (e: any) {
    if (e instanceof RpcError && e.status === 404) return [];
    throw e;
  }
}

export type ExpedicaoEventoTipo = 'created' | 'status' | 'tracking' | 'observacoes';
export type ExpedicaoEvento = {
  id: string;
  empresa_id: string;
  expedicao_id: string;
  tipo: ExpedicaoEventoTipo;
  de_status: string | null;
  para_status: string | null;
  mensagem: string | null;
  meta: any;
  created_at: string;
  created_by: string | null;
};

export async function listExpedicoes(): Promise<Expedicao[]> {
  const { data, error } = await sb
    .from('vendas_expedicoes')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function listExpedicaoEventos(expedicaoId: string): Promise<ExpedicaoEvento[]> {
  const { data, error } = await sb
    .from('vendas_expedicao_eventos')
    .select('*')
    .eq('expedicao_id', expedicaoId)
    .order('created_at', { ascending: false });
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

export type AutomacaoValidationResult = { ok: boolean; errors: string[] };

export async function validateAutomacaoConfig(config: any): Promise<AutomacaoValidationResult> {
  return callRpc<AutomacaoValidationResult>('vendas_automacao_validate_config', { p_config: config });
}

export async function enqueueAutomacaoNow(params: { automacaoId: string; entityId: string; gatilho?: string; payload?: any }): Promise<string> {
  return callRpc<string>('vendas_automacao_enqueue_single', {
    p_automacao_id: params.automacaoId,
    p_entity_id: params.entityId,
    p_gatilho: params.gatilho ?? 'manual',
    p_payload: params.payload ?? null,
  });
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

export async function ensurePdvDefaultClienteId(): Promise<string> {
  const id = await callRpc<string>('vendas_pdv_ensure_default_cliente', {});
  return id as any;
}

export async function estornarPdv(params: { pedidoId: string; contaCorrenteId: string }): Promise<void> {
  await callRpc('vendas_pdv_estornar', { p_pedido_id: params.pedidoId, p_conta_corrente_id: params.contaCorrenteId });
}

export async function concluirVendaComBaixaEstoque(pedidoId: string): Promise<void> {
  await callRpc('vendas_concluir_pedido', { p_id: pedidoId, p_baixar_estoque: true });
}

export async function finalizePdv(params: {
  pedidoId: string;
  contaCorrenteId: string;
  estoqueEnabled?: boolean;
}): Promise<VendaDetails> {
  return traceAction(
    'pdv.finalize',
    async () => {
      try {
        await callRpc('vendas_pdv_finalize_v2', {
          p_pedido_id: params.pedidoId,
          p_conta_corrente_id: params.contaCorrenteId,
          p_baixar_estoque: params.estoqueEnabled !== false,
        });
        removePdvFinalizeQueue(params.pedidoId);
      } catch (e: any) {
        if (e instanceof RpcError && isRetryableForOfflineQueue(e)) {
          const now = Date.now();
          upsertPdvFinalizeQueue({
            pedidoId: params.pedidoId,
            contaCorrenteId: params.contaCorrenteId,
            createdAt: now,
            attempts: 0,
            lastError: e.message || null,
          });
          throw new PdvQueuedError();
        }
        throw e;
      }

      const updated = await getVendaDetails(params.pedidoId);
      return updated as any;
    },
    {
      pedido_id: params.pedidoId,
      conta_corrente_id: params.contaCorrenteId,
      estoque_enabled: params.estoqueEnabled !== false,
    }
  );
}

export class PdvQueuedError extends Error {
  constructor() {
    super('PDV pendente de sincronização');
    this.name = 'PdvQueuedError';
  }
}

function isRetryableForOfflineQueue(e: RpcError): boolean {
  const status = e.status;
  const msg = String(e.message || '');
  if (status === 0 && /(failed to fetch|networkerror|load failed)/i.test(msg)) return true;
  if (status === 408) return true;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  return false;
}

export function getQueuedPdvFinalizeIds(): Set<string> {
  return new Set(listPdvFinalizeQueue().map((x) => x.pedidoId));
}

let flushing = false;

export async function flushPdvFinalizeQueue(): Promise<{ ok: number; failed: number }> {
  if (flushing) return { ok: 0, failed: 0 };
  flushing = true;
  try {
    const items = listPdvFinalizeQueue();
    let ok = 0;
    let failed = 0;

    for (const it of items) {
      try {
        await callRpc('vendas_pdv_finalize_v2', {
          p_pedido_id: it.pedidoId,
          p_conta_corrente_id: it.contaCorrenteId,
          p_baixar_estoque: true,
        });
        removePdvFinalizeQueue(it.pedidoId);
        ok += 1;
      } catch (e: any) {
        failed += 1;
        bumpPdvFinalizeAttempt(it.pedidoId, e?.message || 'Falha ao sincronizar');
      }
    }

    return { ok, failed };
  } finally {
    flushing = false;
  }
}

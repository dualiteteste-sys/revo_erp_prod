import React, { useEffect, useState } from 'react';
import { DoorClosed, DoorOpen, Loader2, PlusCircle, Printer, Search, Store, Wallet } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import PedidoVendaFormPanel from '@/components/vendas/PedidoVendaFormPanel';
import { listContasCorrentes, type ContaCorrente } from '@/services/treasury';
import {
  closePdvCaixa,
  estornarPdv,
  finalizePdv,
  flushPdvFinalizeQueue,
  getQueuedPdvFinalizeIds,
  listPdvCaixas,
  openPdvCaixa,
  type PdvCaixaRow,
  PdvQueuedError,
} from '@/services/vendasMvp';
import { supabase } from '@/lib/supabaseClient';
import { getVendaDetails, type VendaDetails } from '@/services/vendas';
import CsvExportDialog from '@/components/ui/CsvExportDialog';
import { useOnboardingGate } from '@/contexts/OnboardingGateContext';
import { ActionLockedError, runWithActionLock } from '@/lib/actionLock';
import { useBillingGate } from '@/hooks/useBillingGate';
import RoadmapButton from '@/components/roadmap/RoadmapButton';

type PdvRow = {
  id: string;
  numero: number;
  status: string;
  total_geral: number;
  data_emissao: string;
  updated_at: string;
  pdv_estornado_at?: string | null;
};

const sb = supabase as any;

function formatMoneyBRL(n: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));
}

function buildReceiptHtml(venda: VendaDetails, contaNome?: string) {
  const lines = (venda.itens || []).map((it) => {
    const total = Number(it.total || 0);
    return `<tr>
      <td style="padding:6px 0">${it.produto_nome || 'Produto'}</td>
      <td style="padding:6px 0;text-align:right">${Number(it.quantidade || 0)}</td>
      <td style="padding:6px 0;text-align:right">${formatMoneyBRL(Number(it.preco_unitario || 0))}</td>
      <td style="padding:6px 0;text-align:right">${formatMoneyBRL(total)}</td>
    </tr>`;
  });

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Comprovante PDV #${venda.numero}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; padding: 20px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .muted { color: #666; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      thead th { text-align: left; font-size: 12px; color: #666; border-bottom: 1px solid #ddd; padding: 8px 0; }
      tfoot td { border-top: 1px solid #ddd; padding-top: 10px; font-weight: 700; }
      .right { text-align: right; }
      @media print { button { display: none; } body { padding: 0; } }
    </style>
  </head>
  <body>
    <h1>Comprovante PDV</h1>
    <div class="muted">Pedido #${venda.numero} · Data: ${venda.data_emissao || ''}</div>
    ${contaNome ? `<div class="muted">Recebimento: ${contaNome}</div>` : ''}
    ${venda.cliente_nome ? `<div class="muted">Cliente: ${venda.cliente_nome}</div>` : ''}
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="right">Qtd</th>
          <th class="right">Unit.</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${lines.join('')}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="right">Total</td>
          <td class="right">${formatMoneyBRL(venda.total_geral || 0)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="muted" style="margin-top: 14px">Obrigado!</div>
    <button onclick="window.print()" style="margin-top: 18px; padding: 10px 14px; border: 1px solid #ddd; background: #f5f5f5; border-radius: 8px">Imprimir</button>
  </body>
</html>`;
}

export default function PdvPage() {
  const { addToast } = useToast();
  const { ensure } = useOnboardingGate();
  const billing = useBillingGate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PdvRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'orcamento' | 'concluido' | 'cancelado'>('all');
  const [contas, setContas] = useState<ContaCorrente[]>([]);
  const [contaCorrenteId, setContaCorrenteId] = useState<string>('');
  const [caixas, setCaixas] = useState<PdvCaixaRow[]>([]);
  const [caixaId, setCaixaId] = useState<string>(() => (typeof window !== 'undefined' ? window.localStorage.getItem('pdv:caixaId') || '' : ''));
  const [isCaixaModalOpen, setIsCaixaModalOpen] = useState(false);
  const [caixaMode, setCaixaMode] = useState<'open' | 'close'>('open');
  const [saldoInicial, setSaldoInicial] = useState<number>(0);
  const [saldoFinal, setSaldoFinal] = useState<number>(0);
  const [caixaObs, setCaixaObs] = useState<string>('');
  const [caixaBusy, setCaixaBusy] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [receiptVenda, setReceiptVenda] = useState<VendaDetails | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(() => getQueuedPdvFinalizeIds());

  const refreshQueued = () => setQueuedIds(getQueuedPdvFinalizeIds());

  async function load() {
    setLoading(true);
    try {
      const [{ data: contaData }, { data: pdvData, error: pdvError }, caixasData] = await Promise.all([
        listContasCorrentes({ page: 1, pageSize: 50, searchTerm: '', ativo: true }),
        sb
          .from('vendas_pedidos')
          .select('id,numero,status,total_geral,data_emissao,updated_at,pdv_estornado_at')
          .eq('canal', 'pdv')
          .order('updated_at', { ascending: false })
          .limit(200),
        listPdvCaixas().catch(() => [] as PdvCaixaRow[]),
      ]);

      if (pdvError) throw pdvError;
      setContas(contaData);
      setCaixas(caixasData || []);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('pdv:caixaId', caixaId || '');
      }
      if (!caixaId && (caixasData || []).length > 0) {
        const preferred = (caixasData || []).find((c) => c.sessao_id) || (caixasData || [])[0];
        if (preferred) {
          setCaixaId(preferred.id);
          if (typeof window !== 'undefined') window.localStorage.setItem('pdv:caixaId', preferred.id);
        }
      }
      // MVP friendly: se não há nenhum caixa aberto, abre automaticamente o caixa selecionado (saldo 0).
      // Isso evita fricção no PDV e mantém os fluxos/E2E do "happy path" estáveis.
      const selectedAfter = (caixasData || []).find((c) => c.id === (caixaId || '')) || (caixasData || []).find((c) => c.sessao_id) || (caixasData || [])[0];
      const hasAnyOpen = (caixasData || []).some((c) => !!c.sessao_id);
      if (selectedAfter && !hasAnyOpen && !selectedAfter.sessao_id) {
        try {
          await openPdvCaixa({ caixaId: selectedAfter.id, saldoInicial: 0 });
          const refreshed = await listPdvCaixas().catch(() => [] as PdvCaixaRow[]);
          setCaixas(refreshed);
          setCaixaId(selectedAfter.id);
          if (typeof window !== 'undefined') window.localStorage.setItem('pdv:caixaId', selectedAfter.id);
        } catch {
          // sem permissão/feature: segue com UX manual (modal de abrir caixa ao finalizar)
        }
      }
      if (!contaCorrenteId && contaData.length > 0) {
        const padrao = contaData.find((c) => c.padrao_para_recebimentos) || contaData[0];
        setContaCorrenteId(padrao.id);
      }
      setRows((pdvData || []) as any);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar PDV.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    refreshQueued();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = async () => {
      const { ok, failed } = await flushPdvFinalizeQueue();
      refreshQueued();
      if (ok > 0) addToast(`Sincronizado: ${ok} PDV(s).`, 'success');
      if (failed > 0) addToast(`Não foi possível sincronizar ${failed} PDV(s).`, 'warning');
      if (ok > 0) await load();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (statusFilter !== 'all' && String(r.status) !== statusFilter) return false;
    if (!q) return true;
    return String(r.numero).includes(q);
  });

  const openNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const openEdit = (id: string) => {
    setSelectedId(id);
    setIsFormOpen(true);
  };

  const close = () => {
    setIsFormOpen(false);
    setSelectedId(null);
  };

  const handleSaveSuccess = () => {
    void load();
  };

  const handleFinalize = async (pedidoId: string) => {
    if (!billing.ensureCanWrite({ actionLabel: 'Finalizar PDV' })) return;
    const gate = await ensure(['tesouraria.contas_correntes']);
    if (!gate.ok) return;

    if (!contaCorrenteId) {
      addToast('Cadastre/seleciona uma conta corrente para receber no PDV.', 'error');
      return;
    }
    // Evita race conditions de state (E2E/user clicando rápido antes do load setar caixaId).
    const effectiveCaixaId = caixaId || caixas.find((c) => c.sessao_id)?.id || caixas[0]?.id || '';
    if (!effectiveCaixaId) {
      addToast('Selecione um caixa antes de finalizar.', 'warning');
      return;
    }
    if (effectiveCaixaId !== caixaId) {
      setCaixaId(effectiveCaixaId);
      if (typeof window !== 'undefined') window.localStorage.setItem('pdv:caixaId', effectiveCaixaId);
    }
    const caixa = caixas.find((c) => c.id === effectiveCaixaId);
    if (!caixa?.sessao_id) {
      addToast('Caixa fechado. Abra o caixa para finalizar vendas.', 'warning');
      setCaixaMode('open');
      setIsCaixaModalOpen(true);
      return;
    }
    const lockKey = `pdv:finalize:${pedidoId}`;
    setFinalizingId(pedidoId);
    try {
      await runWithActionLock(lockKey, async () => {
        await finalizePdv({ pedidoId, contaCorrenteId, estoqueEnabled: true, caixaId: effectiveCaixaId });
      });
      addToast('PDV finalizado (financeiro + estoque).', 'success');
      try {
        const venda = await getVendaDetails(pedidoId);
        setReceiptVenda(venda);
        setIsReceiptOpen(true);
      } catch {
        // fallback: não bloqueia o fluxo se não conseguir carregar detalhes
      }
      await load();
      refreshQueued();
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos finalizando este PDV. Aguarde alguns segundos.', 'info');
      } else if (e instanceof PdvQueuedError) {
        addToast('Sem conexão: o PDV ficou pendente e será sincronizado automaticamente.', 'warning');
        refreshQueued();
      } else {
        addToast(e.message || 'Falha ao finalizar PDV.', 'error');
      }
    } finally {
      setFinalizingId(null);
    }
  };

  const handleSyncNow = async () => {
    const { ok, failed } = await flushPdvFinalizeQueue();
    refreshQueued();
    if (ok > 0) addToast(`Sincronizado: ${ok} PDV(s).`, 'success');
    if (failed > 0) addToast(`Não foi possível sincronizar ${failed} PDV(s).`, 'warning');
    if (ok > 0) await load();
  };

  const openCaixaModal = (mode: 'open' | 'close') => {
    setCaixaMode(mode);
    setSaldoInicial(0);
    setSaldoFinal(0);
    setCaixaObs('');
    setIsCaixaModalOpen(true);
  };

  const handleConfirmCaixa = async () => {
    if (!caixaId) {
      addToast('Selecione um caixa.', 'warning');
      return;
    }
    if (caixaBusy) return;
    setCaixaBusy(true);
    try {
      if (caixaMode === 'open') {
        await openPdvCaixa({ caixaId, saldoInicial: Number(saldoInicial || 0) });
        addToast('Caixa aberto.', 'success');
      } else {
        const res = await closePdvCaixa({ caixaId, saldoFinal: saldoFinal ? Number(saldoFinal) : null, observacoes: caixaObs || null });
        addToast(`Caixa fechado. Vendas: ${formatMoneyBRL(res.total_vendas)}.`, 'success');
      }
      setIsCaixaModalOpen(false);
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao atualizar caixa.', 'error');
    } finally {
      setCaixaBusy(false);
    }
  };

  const handleEstornar = async (pedidoId: string) => {
    if (!billing.ensureCanWrite({ actionLabel: 'Estornar PDV' })) return;
    const gate = await ensure(['tesouraria.contas_correntes']);
    if (!gate.ok) return;

    if (!contaCorrenteId) {
      addToast('Selecione uma conta corrente para lançar o estorno.', 'error');
      return;
    }
    const lockKey = `pdv:estornar:${pedidoId}`;
    setFinalizingId(pedidoId);
    try {
      await runWithActionLock(lockKey, async () => {
        await estornarPdv({ pedidoId, contaCorrenteId });
      });
      addToast('PDV estornado (financeiro + estoque).', 'success');
      await load();
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos estornando este PDV. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e.message || 'Falha ao estornar PDV.', 'error');
      }
    } finally {
      setFinalizingId(null);
    }
  };

  const handleOpenReceipt = async (pedidoId: string) => {
    try {
      const venda = await getVendaDetails(pedidoId);
      setReceiptVenda(venda);
      setIsReceiptOpen(true);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao abrir comprovante.', 'error');
    }
  };

  const handlePrintReceipt = () => {
    if (!receiptVenda) return;
    const conta = contas.find((c) => c.id === contaCorrenteId);
    const html = buildReceiptHtml(receiptVenda, conta?.nome);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.srcdoc = html;

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        // evita acumular iframes
        setTimeout(() => iframe.remove(), 1000);
      }
    };

    document.body.appendChild(iframe);
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Store className="text-blue-600" /> PDV
          </h1>
          <p className="text-gray-600 text-sm mt-1">Venda rápida: finaliza gerando movimentação (entrada) e baixa de estoque.</p>
        </div>
        <div className="flex items-center gap-2">
          <RoadmapButton contextKey="vendas" label="Assistente" title="Abrir assistente do PDV" />
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusCircle size={20} />
            Nova venda
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 flex-shrink-0">
        <label className="text-sm text-gray-700">Conta para recebimento</label>
        <select
          value={contaCorrenteId}
          onChange={(e) => setContaCorrenteId(e.target.value)}
          className="p-2 border border-gray-300 rounded-lg min-w-[280px]"
        >
          <option value="">Selecione…</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} {c.apelido ? `(${c.apelido})` : ''}
            </option>
          ))}
        </select>
        <label className="text-sm text-gray-700 ml-2">Caixa</label>
        <select
          value={caixaId}
          onChange={(e) => {
            setCaixaId(e.target.value);
            if (typeof window !== 'undefined') window.localStorage.setItem('pdv:caixaId', e.target.value);
          }}
          className="p-2 border border-gray-300 rounded-lg min-w-[220px]"
        >
          <option value="">Selecione…</option>
          {caixas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} {c.sessao_id ? '• aberto' : '• fechado'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => openCaixaModal((caixas.find((c) => c.id === caixaId)?.sessao_id ? 'close' : 'open'))}
          className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 flex items-center gap-2"
          title="Abrir/fechar caixa"
        >
          {caixas.find((c) => c.id === caixaId)?.sessao_id ? <DoorClosed size={16} /> : <DoorOpen size={16} />}
          {caixas.find((c) => c.id === caixaId)?.sessao_id ? 'Fechar caixa' : 'Abrir caixa'}
        </button>
        <button onClick={() => load()} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
          Atualizar
        </button>
      </div>

      <Modal
        isOpen={isCaixaModalOpen}
        onClose={() => setIsCaixaModalOpen(false)}
        title={caixaMode === 'open' ? 'Abrir caixa' : 'Fechar caixa'}
        size="lg"
      >
        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Wallet size={18} className="text-blue-600" />
              {caixaMode === 'open' ? 'Saldo inicial' : 'Saldo final (opcional)'}
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {caixaMode === 'open' ? (
                <div>
                  <label className="text-xs font-semibold text-gray-700">Saldo inicial</label>
                  <input
                    type="number"
                    step="0.01"
                    value={saldoInicial}
                    onChange={(e) => setSaldoInicial(Number(e.target.value || 0))}
                    className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-700">Saldo final (contado)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={saldoFinal}
                      onChange={(e) => setSaldoFinal(Number(e.target.value || 0))}
                      className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                      placeholder="Opcional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700">Observações</label>
                    <input
                      value={caixaObs}
                      onChange={(e) => setCaixaObs(e.target.value)}
                      className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                      placeholder="Ex.: diferença de troco…"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setIsCaixaModalOpen(false)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
              Cancelar
            </button>
            <button
              onClick={() => void handleConfirmCaixa()}
              disabled={caixaBusy}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {caixaBusy ? 'Salvando…' : caixaMode === 'open' ? 'Abrir' : 'Fechar'}
            </button>
          </div>
        </div>
      </Modal>

      {queuedIds.size > 0 ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div>
            Existem <span className="font-semibold">{queuedIds.size}</span> PDV(s) pendente(s) de sincronização.
            {!navigator.onLine ? <span className="ml-2 text-amber-700">(offline)</span> : null}
          </div>
          <button
            onClick={() => void handleSyncNow()}
            disabled={!navigator.onLine}
            className="px-3 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50"
          >
            Sincronizar agora
          </button>
        </div>
      ) : null}

      <div className="mb-4 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-2.5 pl-9 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="p-2.5 border border-gray-300 rounded-xl min-w-[180px]"
        >
          <option value="all">Todos</option>
          <option value="orcamento">Orçamento</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <CsvExportDialog
          filename="pdv.csv"
          rows={filteredRows}
          disabled={loading}
          columns={[
            { key: 'numero', label: 'Número', getValue: (r) => r.numero },
            { key: 'data', label: 'Data', getValue: (r) => r.data_emissao },
            { key: 'status', label: 'Status', getValue: (r) => r.status },
            { key: 'total', label: 'Total', getValue: (r) => r.total_geral },
          ]}
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">
            {rows.length === 0 ? (
              <div className="text-center space-y-2">
                <div>Nenhuma venda PDV ainda.</div>
                <button onClick={openNew} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700">
                  Nova venda
                </button>
              </div>
            ) : (
              <div>Nenhum resultado para os filtros.</div>
            )}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">#{r.numero}</td>
                    <td className="px-4 py-3">{r.data_emissao}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{r.status}</span>
                        {queuedIds.has(r.id) ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            pendente
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatMoneyBRL(Number(r.total_geral || 0))}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(r.id)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                          Abrir
                        </button>
                        {r.status === 'concluido' ? (
                          <button
                            onClick={() => void handleOpenReceipt(r.id)}
                            className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center gap-2"
                          >
                            <Printer size={16} /> Comprovante
                          </button>
                        ) : null}
                        {r.status !== 'concluido' ? (
                          <button
                            onClick={() => handleFinalize(r.id)}
                            disabled={finalizingId === r.id}
                            className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {finalizingId === r.id ? 'Finalizando…' : 'Finalizar'}
                          </button>
                        ) : r.pdv_estornado_at ? (
                          <span className="px-3 py-1 rounded-md bg-red-100 text-red-800 font-semibold">Estornado</span>
                        ) : (
                          <button
                            onClick={() => void handleEstornar(r.id)}
                            disabled={finalizingId === r.id}
                            className="px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {finalizingId === r.id ? 'Estornando…' : 'Estornar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={close} title={selectedId ? 'Editar venda' : 'Nova venda'} size="6xl" containerClassName="h-[90vh] max-h-[90vh]">
        <PedidoVendaFormPanel
          vendaId={selectedId}
          onSaveSuccess={handleSaveSuccess}
          onClose={close}
          mode="pdv"
          onFinalizePdv={handleFinalize}
        />
      </Modal>

      <Modal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        title={receiptVenda?.numero ? `Comprovante PDV #${receiptVenda.numero}` : 'Comprovante PDV'}
        size="lg"
      >
        {!receiptVenda ? (
          <div className="p-6 text-sm text-gray-600">Carregando comprovante…</div>
        ) : (
          <div className="p-6">
            <div className="text-sm text-gray-600">Data: {receiptVenda.data_emissao}</div>
            {receiptVenda.cliente_nome ? <div className="text-sm text-gray-600">Cliente: {receiptVenda.cliente_nome}</div> : null}
            <div className="mt-4 border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Unit.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(receiptVenda.itens || []).map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2">{it.produto_nome}</td>
                      <td className="px-3 py-2 text-right">{Number(it.quantidade || 0)}</td>
                      <td className="px-3 py-2 text-right">{formatMoneyBRL(Number(it.preco_unitario || 0))}</td>
                      <td className="px-3 py-2 text-right">{formatMoneyBRL(Number(it.total || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-3 py-2 font-bold text-right" colSpan={3}>
                      Total
                    </td>
                    <td className="px-3 py-2 font-bold text-right">{formatMoneyBRL(receiptVenda.total_geral || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setIsReceiptOpen(false)} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
                Fechar
              </button>
              <button
                onClick={handlePrintReceipt}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Printer size={18} /> Imprimir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

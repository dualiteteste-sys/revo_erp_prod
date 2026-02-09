import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContasCorrentes, useMovimentacoes, useExtratos } from '@/hooks/useTesouraria';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { PlusCircle, Search, Landmark, ArrowRightLeft, Calendar, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import ContasCorrentesTable from '@/components/financeiro/tesouraria/ContasCorrentesTable';
import ContaCorrenteFormPanel from '@/components/financeiro/tesouraria/ContaCorrenteFormPanel';
import MovimentacoesTable from '@/components/financeiro/tesouraria/MovimentacoesTable';
import MovimentacaoFormPanel from '@/components/financeiro/tesouraria/MovimentacaoFormPanel';
import TransferenciaEntreContasFormPanel from '@/components/financeiro/tesouraria/TransferenciaEntreContasFormPanel';
import ExtratosTable from '@/components/financeiro/tesouraria/ExtratosTable';
import ImportarExtratoModal from '@/components/financeiro/tesouraria/ImportarExtratoModal';
import ConciliacaoDrawer from '@/components/financeiro/tesouraria/ConciliacaoDrawer';
import ConciliacaoRegrasPanel from '@/components/financeiro/tesouraria/ConciliacaoRegrasPanel';
import { ContaCorrente, Movimentacao, ExtratoItem, deleteContaCorrente, deleteMovimentacao, importarExtrato, conciliarExtrato, reverterConciliacaoExtrato, setContaCorrentePadrao, listMovimentacoes, getContaCorrente, getMovimentacao } from '@/services/treasury';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import DatePicker from '@/components/ui/DatePicker';
import Toggle from '@/components/ui/forms/Toggle';
import { Button } from '@/components/ui/button';
import { scoreExtratoToMovimentacao } from '@/lib/conciliacao/matching';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';
import { useSearchParams } from 'react-router-dom';
import { useEditLock } from '@/components/ui/hooks/useEditLock';
import { useAuth } from '@/contexts/AuthProvider';

type TransferAssistInfo = {
  kind: 'detected_unique' | 'detected_multiple' | 'conciliated_transfer';
  movimentacaoId?: string;
  candidatesCount?: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toFiniteMoneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveMovimentacaoValor(mov: Movimentacao): number | null {
  return (
    toFiniteMoneyOrNull(mov.valor) ??
    toFiniteMoneyOrNull(mov.valor_entrada) ??
    toFiniteMoneyOrNull(mov.valor_saida)
  );
}

function isTransferenciaInterna(origemTipo: string | null | undefined): boolean {
  return String(origemTipo || '').startsWith('transferencia_interna');
}

function parseIsoDate(dateIso: string): Date | null {
  if (!dateIso) return null;
  const date = new Date(`${dateIso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDaysAbs(dateA: string, dateB: string): number {
  const a = parseIsoDate(dateA);
  const b = parseIsoDate(dateB);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / ONE_DAY_MS));
}

export default function TesourariaPage() {
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [activeTab, setActiveTab] = useState<'contas' | 'movimentos' | 'conciliacao' | 'regras'>('contas');
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const openId = searchParams.get('open');
  const contasEditLock = useEditLock('financeiro:tesouraria:contas');
  const movEditLock = useEditLock('financeiro:tesouraria:movimentacoes');

  const [busyExtratoId, setBusyExtratoId] = useState<string | null>(null);
  const [bulkConciliando, setBulkConciliando] = useState(false);
  const [bulkThreshold, setBulkThreshold] = useState(85);
  const [transferAssistByExtratoId, setTransferAssistByExtratoId] = useState<Record<string, TransferAssistInfo>>({});

  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;

  // --- Contas State ---
  const {
    contas,
    loading: loadingContas,
    refresh: refreshContas,
    searchTerm: searchContas,
    setSearchTerm: setSearchContas
  } = useContasCorrentes();

  const [isContaFormOpen, setIsContaFormOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaCorrente | null>(null);
  const [editingContaId, setEditingContaId] = useState<string | null>(null);
  const [contaToDelete, setContaToDelete] = useState<ContaCorrente | null>(null);

  // --- Shared State (Movimentos & Extratos) ---
  const [selectedContaId, setSelectedContaId] = useState<string | null>(null);

  // --- Movimentos State ---
  const {
    movimentacoes,
    loading: loadingMov,
    refresh: refreshMov,
    startDate: movStartDate, setStartDate: setMovStartDate,
    endDate: movEndDate, setEndDate: setMovEndDate,
  } = useMovimentacoes(selectedContaId);

  const [isMovFormOpen, setIsMovFormOpen] = useState(false);
  const [isTransferFormOpen, setIsTransferFormOpen] = useState(false);
  const [selectedMov, setSelectedMov] = useState<Movimentacao | null>(null);
  const [editingMovId, setEditingMovId] = useState<string | null>(null);
  const [movReadOnly, setMovReadOnly] = useState(false);
  const [movToDelete, setMovToDelete] = useState<Movimentacao | null>(null);

  // --- Extratos State ---
  const {
    extratos,
    loading: loadingExtrato,
    refresh: refreshExtrato,
    startDate: extratoStartDate,
    endDate: extratoEndDate,
    setStartDate: setExtratoStartDate,
    setEndDate: setExtratoEndDate,
    filterConciliado, setFilterConciliado,
    count: extratoCount,
    page: extratoPage,
    pageSize: extratoPageSize,
    setPage: setExtratoPage,
    setPageSize: setExtratoPageSize,
  } = useExtratos(selectedContaId);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [conciliacaoItem, setConciliacaoItem] = useState<ExtratoItem | null>(null);

  const clearOpenParam = useCallback(() => {
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, searchParams, setSearchParams]);

  const handleEditConta = useCallback(async (c: ContaCorrente) => {
    const claimed = await contasEditLock.claim(c.id, {
      confirmConflict: async () =>
        confirm({
          title: 'Esta conta já está aberta em outra aba',
          description: 'Para evitar edição concorrente, abra em apenas uma aba. Deseja abrir mesmo assim nesta aba?',
          confirmText: 'Abrir mesmo assim',
          cancelText: 'Cancelar',
          variant: 'danger',
        }),
    });
    if (!claimed) {
      clearOpenParam();
      return;
    }

    try {
      const contaCompleta = await getContaCorrente(c.id);
      setSelectedConta(contaCompleta);
      setEditingContaId(c.id);
      setIsContaFormOpen(true);
    } catch (e: any) {
      contasEditLock.release(c.id);
      addToast(e?.message || 'Não foi possível carregar os detalhes da conta.', 'error');
      clearOpenParam();
    }
  }, [addToast, clearOpenParam, confirm, contasEditLock]);

  const closeContaForm = useCallback(() => {
    setIsContaFormOpen(false);
    setSelectedConta(null);
    clearOpenParam();
    if (editingContaId) contasEditLock.release(editingContaId);
    setEditingContaId(null);
  }, [clearOpenParam, contasEditLock, editingContaId]);

  const handleEditMov = useCallback(async (m: Movimentacao) => {
    const readOnly = Boolean(m.conciliado);
    setMovReadOnly(readOnly);

    if (!readOnly) {
      const claimed = await movEditLock.claim(m.id, {
        confirmConflict: async () =>
          confirm({
            title: 'Esta movimentação já está aberta em outra aba',
            description: 'Para evitar edição concorrente, abra em apenas uma aba. Deseja abrir mesmo assim nesta aba?',
            confirmText: 'Abrir mesmo assim',
            cancelText: 'Cancelar',
            variant: 'danger',
          }),
      });
      if (!claimed) {
        clearOpenParam();
        return;
      }
    }

    setSelectedMov(m);
    setEditingMovId(m.id);
    setIsMovFormOpen(true);
  }, [clearOpenParam, confirm, movEditLock]);

  const closeMovForm = useCallback(() => {
    setIsMovFormOpen(false);
    setSelectedMov(null);
    setMovReadOnly(false);
    clearOpenParam();
    if (editingMovId && !movReadOnly) movEditLock.release(editingMovId);
    setEditingMovId(null);
  }, [clearOpenParam, editingMovId, movEditLock, movReadOnly]);

  const closeTransferForm = useCallback(() => {
    setIsTransferFormOpen(false);
  }, []);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    closeContaForm();
    closeMovForm();
    closeTransferForm();
    setContaToDelete(null);
    setMovToDelete(null);
    setSelectedContaId(null);
    setConciliacaoItem(null);
    setIsImportModalOpen(false);
    setBusyExtratoId(null);
    setBulkConciliando(false);
    setBulkThreshold(85);

    if (prevEmpresaId && activeEmpresaId) {
      addToast('Empresa alterada. Recarregando tesouraria…', 'info');
    }

    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId, addToast, closeContaForm, closeMovForm, closeTransferForm]);

  const holdUi = authLoading || !activeEmpresaId || empresaChanged;

  const setTab = useCallback((nextTab: 'contas' | 'movimentos' | 'conciliacao' | 'regras') => {
    // evita modais/locks "perdidos" ao trocar de aba
    closeContaForm();
    closeMovForm();
    closeTransferForm();
    setConciliacaoItem(null);
    setIsImportModalOpen(false);
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [closeContaForm, closeMovForm, closeTransferForm, searchParams, setSearchParams]);

  useEffect(() => {
    if (!tabFromQuery) return;
    if (tabFromQuery !== 'contas' && tabFromQuery !== 'movimentos' && tabFromQuery !== 'conciliacao' && tabFromQuery !== 'regras') return;
    if (activeTab === tabFromQuery) return;
    setActiveTab(tabFromQuery);
  }, [activeTab, tabFromQuery]);

  const resolvedTab = useMemo(() => {
    if (tabFromQuery === 'contas' || tabFromQuery === 'movimentos' || tabFromQuery === 'conciliacao' || tabFromQuery === 'regras') {
      return tabFromQuery;
    }
    return activeTab;
  }, [activeTab, tabFromQuery]);

  useEffect(() => {
    if (!openId) return;
    if (resolvedTab === 'contas') {
      if (isContaFormOpen && (selectedConta?.id ?? null) === openId) return;
      void (async () => {
        try {
          const conta = await getContaCorrente(openId);
          setSelectedContaId(conta.id);
          await handleEditConta(conta);
        } catch (e: any) {
          addToast(e?.message || 'Não foi possível abrir a conta.', 'error');
          clearOpenParam();
        }
      })();
      return;
    }

    if (resolvedTab === 'movimentos') {
      if (isMovFormOpen && (selectedMov?.id ?? null) === openId) return;
      void (async () => {
        try {
          const mov = await getMovimentacao(openId);
          setSelectedContaId(mov.conta_corrente_id);
          await handleEditMov(mov);
        } catch (e: any) {
          addToast(e?.message || 'Não foi possível abrir a movimentação.', 'error');
          clearOpenParam();
        }
      })();
    }
  }, [
    addToast,
    clearOpenParam,
    handleEditConta,
    handleEditMov,
    isContaFormOpen,
    isMovFormOpen,
    openId,
    resolvedTab,
    selectedConta?.id,
    selectedMov?.id,
  ]);

  // --- Handlers Contas ---
  const handleNewConta = () => {
    setSelectedConta(null);
    setIsContaFormOpen(true);
  };

  const handleDeleteConta = async () => {
    if (!contaToDelete) return;
    try {
      await deleteContaCorrente(contaToDelete.id);
      addToast('Conta removida.', 'success');
      refreshContas();
      setContaToDelete(null);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleSetPadrao = async (conta: ContaCorrente, para: 'pagamentos' | 'recebimentos') => {
    const label = para === 'pagamentos' ? 'Pagamentos' : 'Recebimentos';
	    const ok = await confirm({
	      title: `Definir padrão para ${label}`,
	      description: `Deseja definir "${conta.nome}" como conta padrão para ${label.toLowerCase()}?`,
	      confirmText: 'Definir como padrão',
	      cancelText: 'Cancelar',
	      variant: 'primary',
	    });
    if (!ok) return;

    try {
      await setContaCorrentePadrao({ id: conta.id, para });
      addToast(`Conta padrão de ${label.toLowerCase()} atualizada.`, 'success');
      refreshContas();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao definir padrão.', 'error');
    }
  };

  // --- Handlers Movimentos ---
  const handleNewMov = () => {
    if (!selectedContaId) {
        addToast('Selecione uma conta corrente primeiro.', 'warning');
        return;
    }
    setMovReadOnly(false);
    setSelectedMov(null);
    setIsMovFormOpen(true);
  };

  const handleDeleteMov = async () => {
    if (!movToDelete) return;
    try {
      await deleteMovimentacao(movToDelete.id);
      addToast('Movimentação removida.', 'success');
      refreshMov();
      setMovToDelete(null);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleNewTransfer = () => {
    if (contas.length < 2) {
      addToast('Cadastre ao menos duas contas correntes para registrar transferências.', 'warning');
      return;
    }
    setIsTransferFormOpen(true);
  };

  // --- Handlers Extratos ---
  const handleImport = async (itens: any[]) => {
    if (!selectedContaId) return;
    await importarExtrato(selectedContaId, itens);
    // UX: após import, garantir que o usuário veja o período importado (e primeira página).
    try {
      const dates = (itens || [])
        .map((i: any) => String(i?.data_lancamento || ''))
        .filter((s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s))
        .map((s: string) => new Date(`${s}T00:00:00`))
        .filter((d: Date) => !Number.isNaN(d.getTime()));
      if (dates.length > 0) {
        const min = new Date(Math.min(...dates.map((d) => d.getTime())));
        const max = new Date(Math.max(...dates.map((d) => d.getTime())));
        setExtratoStartDate(min);
        setExtratoEndDate(max);
      }
    } catch {
      // best-effort
    }
    setExtratoPage(1);
    refreshExtrato();
  };

  const handleConciliate = async (movimentacaoId: string) => {
    if (!conciliacaoItem) return;
    if (busyExtratoId) return;
    setBusyExtratoId(conciliacaoItem.id);
    try {
        await conciliarExtrato(conciliacaoItem.id, movimentacaoId);
        addToast('Conciliação realizada!', 'success');
        setConciliacaoItem(null);
        refreshExtrato();
        refreshMov(); // Update movements list too
        refreshContas();
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setBusyExtratoId(null);
    }
  };

  const handleUnconciliate = async (item: ExtratoItem) => {
    const ok = await confirm({
      title: 'Reverter conciliação',
      description: 'Isso removerá o vínculo do extrato. Se a movimentação tiver sido gerada pela conciliação, ela também será removida (e o saldo voltará ao estado anterior).',
      confirmText: 'Reverter',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    if (busyExtratoId) return;
    setBusyExtratoId(item.id);
    try {
        const res = await reverterConciliacaoExtrato(item.id);
        if (res.kind === 'deleted_movimentacao') {
          addToast(res.message || 'Conciliação revertida e movimentação removida.', 'success');
        } else if (res.kind === 'unlinked_only') {
          addToast(res.message || 'Vínculo removido. A movimentação foi mantida.', 'warning', {
            title: 'Reversão parcial',
            durationMs: 9000,
            action: res.movimentacao_id
              ? {
                  label: 'Abrir movimentação',
                  ariaLabel: 'Abrir movimentação para estornar ou ajustar',
                  onClick: () => {
                    const next = new URLSearchParams(searchParams);
                    next.set('tab', 'movimentos');
                    next.set('open', res.movimentacao_id!);
                    setActiveTab('movimentos');
                    setSearchParams(next);
                  },
                }
              : undefined,
          });
        } else {
          addToast(res.message || 'Nada para reverter.', 'info');
        }
        refreshExtrato();
        refreshMov();
        refreshContas();
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setBusyExtratoId(null);
    }
  };

  useEffect(() => {
    if (activeTab !== 'conciliacao' || !selectedContaId || !extratos?.length) {
      setTransferAssistByExtratoId({});
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const allDates = extratos
          .map((item) => parseIsoDate(item.data_lancamento))
          .filter((date): date is Date => !!date);

        if (allDates.length === 0) {
          if (!cancelled) setTransferAssistByExtratoId({});
          return;
        }

        const minDate = new Date(Math.min(...allDates.map((date) => date.getTime())));
        minDate.setDate(minDate.getDate() - 3);
        const maxDate = new Date(Math.max(...allDates.map((date) => date.getTime())));
        maxDate.setDate(maxDate.getDate() + 3);

        const { data: movWindow } = await listMovimentacoes({
          contaCorrenteId: selectedContaId,
          startDate: minDate,
          endDate: maxDate,
          tipoMov: null,
          page: 1,
          pageSize: 500,
        });

        const movementById = new Map<string, Movimentacao>();
        for (const mov of movWindow) {
          movementById.set(mov.id, mov);
        }

        const conciliatedMovIds = extratos
          .filter((item) => item.conciliado && !!item.movimentacao_id)
          .map((item) => item.movimentacao_id!)
          .filter((movId) => !movementById.has(movId));

        if (conciliatedMovIds.length > 0) {
          const details = await Promise.all(
            conciliatedMovIds.map(async (movId) => {
              try {
                return await getMovimentacao(movId);
              } catch {
                return null;
              }
            }),
          );
          for (const mov of details) {
            if (mov) movementById.set(mov.id, mov);
          }
        }

        const assistMap: Record<string, TransferAssistInfo> = {};

        for (const item of extratos) {
          if (item.conciliado && item.movimentacao_id) {
            const linkedMov = movementById.get(item.movimentacao_id);
            if (linkedMov && isTransferenciaInterna(linkedMov.origem_tipo)) {
              assistMap[item.id] = {
                kind: 'conciliated_transfer',
                movimentacaoId: linkedMov.id,
              };
            }
            continue;
          }

          const expectedType = item.tipo_lancamento === 'credito' ? 'entrada' : 'saida';
          const candidates = (movWindow || []).filter((mov) => {
            if (mov.conciliado) return false;
            if (mov.tipo_mov !== expectedType) return false;
            if (!isTransferenciaInterna(mov.origem_tipo)) return false;
            const movValue = resolveMovimentacaoValor(mov);
            if (movValue === null) return false;
            if (Math.abs(movValue - Number(item.valor || 0)) > 0.01) return false;
            const distanceDays = diffDaysAbs(item.data_lancamento, mov.data_movimento);
            return distanceDays <= 2;
          });

          if (candidates.length === 0) continue;

          const strictCandidates = candidates.filter(
            (mov) => diffDaysAbs(item.data_lancamento, mov.data_movimento) <= 1,
          );
          if (strictCandidates.length === 1) {
            assistMap[item.id] = {
              kind: 'detected_unique',
              movimentacaoId: strictCandidates[0].id,
              candidatesCount: 1,
            };
            continue;
          }

          assistMap[item.id] = {
            kind: 'detected_multiple',
            candidatesCount: candidates.length,
          };
        }

        if (!cancelled) setTransferAssistByExtratoId(assistMap);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Tesouraria][TransferAssist] erro ao detectar correspondências internas.', error);
        }
        if (!cancelled) setTransferAssistByExtratoId({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, extratos, selectedContaId]);

  const handleQuickLinkTransfer = async (item: ExtratoItem, movimentacaoId: string) => {
    if (busyExtratoId || bulkConciliando) return;
    setBusyExtratoId(item.id);
    try {
      await conciliarExtrato(item.id, movimentacaoId);
      addToast('Transferência interna vinculada e conciliada.', 'success');
      refreshExtrato();
      refreshMov();
      refreshContas();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao vincular transferência interna.', 'error');
    } finally {
      setBusyExtratoId(null);
    }
  };

  const handleAutoConciliarPagina = async () => {
    if (!selectedContaId) {
      addToast('Selecione uma conta corrente primeiro.', 'warning');
      return;
    }
    if (busyExtratoId || bulkConciliando) return;

    const pendentes = (extratos || []).filter((e) => !e.conciliado);
    if (pendentes.length === 0) {
      addToast('Nenhum lançamento pendente nesta página.', 'info');
      return;
    }

    setBulkConciliando(true);
    let conciliados = 0;
    let pulados = 0;
    let falhas = 0;

    try {
      for (const extratoItem of pendentes) {
        try {
          const date = new Date(extratoItem.data_lancamento);
          const startDate = new Date(date);
          startDate.setDate(date.getDate() - 5);
          const endDate = new Date(date);
          endDate.setDate(date.getDate() + 5);

          const { data } = await listMovimentacoes({
            contaCorrenteId: selectedContaId,
            startDate,
            endDate,
            tipoMov: extratoItem.tipo_lancamento === 'credito' ? 'entrada' : 'saida',
            page: 1,
            pageSize: 50,
          });

          const unconciliated = (data || []).filter((m) => !m.conciliado);
          if (unconciliated.length === 0) {
            pulados++;
            continue;
          }

          let best: { id: string; score: number } | null = null;
          for (const mov of unconciliated) {
            const movValor =
              (typeof mov.valor === 'number' && Number.isFinite(mov.valor))
                ? mov.valor
                : (
                  (typeof mov.valor_entrada === 'number' && Number.isFinite(mov.valor_entrada) && mov.valor_entrada > 0)
                    ? mov.valor_entrada
                    : (
                      (typeof mov.valor_saida === 'number' && Number.isFinite(mov.valor_saida) && mov.valor_saida > 0)
                        ? mov.valor_saida
                        : null
                    )
                );
            if (movValor === null) {
              if (import.meta.env.DEV) {
                console.error('[Tesouraria][AutoConciliacao] movimentação sem valor válido', { mov, extratoId: extratoItem.id });
              }
              continue;
            }
            const { score } = scoreExtratoToMovimentacao({
              extratoDescricao: extratoItem.descricao || '',
              extratoDocumento: extratoItem.documento_ref,
              extratoValor: extratoItem.valor,
              extratoDataISO: extratoItem.data_lancamento,
              movDescricao: mov.descricao,
              movDocumento: mov.documento_ref,
              movValor,
              movDataISO: mov.data_movimento,
            });
            if (!best || score > best.score) best = { id: mov.id, score };
          }

          if (!best || best.score < bulkThreshold) {
            pulados++;
            continue;
          }

          await conciliarExtrato(extratoItem.id, best.id);
          conciliados++;
        } catch (e: any) {
          falhas++;
          addToast(e?.message || 'Erro ao conciliar um lançamento.', 'error');
        }
      }
    } finally {
      setBulkConciliando(false);
      refreshExtrato();
      refreshMov();
      refreshContas();
      addToast(`Auto-conciliação: ${conciliados} conciliado(s), ${pulados} pulado(s), ${falhas} falha(s).`, falhas > 0 ? 'warning' : 'success');
    }
  };

  return holdUi ? (
    <div className="p-4 min-h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-500" size={32} />
    </div>
  ) : (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Landmark className="text-blue-600" /> Tesouraria
          </h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de contas, fluxo de caixa e conciliação.</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
                onClick={() => setTab('contas')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'contas' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Contas Correntes
            </button>
            <button
                onClick={() => setTab('movimentos')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'movimentos' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Movimentações
            </button>
            <button
                onClick={() => setTab('conciliacao')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'conciliacao' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Conciliação
            </button>
            <button
                onClick={() => setTab('regras')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'regras' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Regras
            </button>
        </div>
      </div>

      {activeTab === 'contas' && (
        <>
            <div className="mb-6 flex justify-between items-center">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar contas..."
                        value={searchContas}
                        onChange={(e) => setSearchContas(e.target.value)}
                        className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <Button onClick={handleNewConta} className="gap-2">
                  <PlusCircle size={18} /> Nova Conta
                </Button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                {loadingContas ? (
                    <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>
                ) : (
                    <ContasCorrentesTable 
                        contas={contas} 
                        onEdit={handleEditConta} 
                        onDelete={setContaToDelete} 
                        onSetPadrao={handleSetPadrao}
                    />
                )}
            </div>
        </>
      )}

      {activeTab === 'movimentos' && (
        <div className="flex flex-1 flex-col min-h-0">
            <div className="mb-6 grid grid-cols-1 gap-4 items-end md:grid-cols-12">
                <div className="md:col-span-4 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Conta Corrente</label>
                    <select 
                        value={selectedContaId || ''} 
                        onChange={e => setSelectedContaId(e.target.value)}
                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Selecione uma conta...</option>
                        {contas.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                    </select>
                </div>
                
                <div className="md:col-span-5 min-w-0 flex flex-wrap gap-3">
                    <DatePicker label="De" value={movStartDate} onChange={setMovStartDate} className="min-w-[11rem] flex-1" />
                    <DatePicker label="Até" value={movEndDate} onChange={setMovEndDate} className="min-w-[11rem] flex-1" />
                </div>

                <div className="md:col-span-3 flex justify-start md:justify-end">
                  <div className="w-full md:w-auto flex gap-2">
                    <Button
                      onClick={handleNewTransfer}
                      variant="outline"
                      disabled={contas.length < 2}
                      className="gap-2 w-full md:w-auto"
                    >
                      <ArrowRightLeft size={18} /> Transferir
                    </Button>
                  <Button
                    onClick={handleNewMov}
                    disabled={!selectedContaId}
                    className="gap-2 w-full md:w-auto"
                  >
                    <ArrowRightLeft size={18} /> Registrar Movimento
                  </Button>
                  </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0">
                {!selectedContaId ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <Landmark size={48} className="mb-4 opacity-20" />
                        <p>Selecione uma conta corrente para visualizar o extrato.</p>
                    </div>
                ) : loadingMov ? (
                    <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>
                ) : (
                  <div className="h-full overflow-auto">
                    <MovimentacoesTable 
                        movimentacoes={movimentacoes} 
                        onEdit={handleEditMov} 
                        onDelete={setMovToDelete} 
                    />
                  </div>
                )}
            </div>
        </div>
      )}

      {activeTab === 'conciliacao' && (
        <div className="flex flex-1 flex-col min-h-0">
            <div className="mb-6 grid grid-cols-1 gap-4 items-end md:grid-cols-12">
                <div className="md:col-span-3 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Conta Corrente</label>
                    <select 
                        value={selectedContaId || ''} 
                        onChange={e => setSelectedContaId(e.target.value)}
                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Selecione uma conta...</option>
                        {contas.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                    </select>
                </div>

                <div className="md:col-span-2 flex items-end">
                  <div className="w-full bg-white p-2 rounded-lg border">
                      <Toggle 
                          label="Apenas Pendentes" 
                          name="pendentes" 
                          checked={filterConciliado === false} 
                          onChange={(checked) => setFilterConciliado(checked ? false : null)} 
                      />
                  </div>
                </div>

                <div className="md:col-span-4 min-w-0 flex flex-wrap gap-3">
                  <DatePicker
                    label="De"
                    value={extratoStartDate}
                    onChange={(d) => {
                      setExtratoStartDate(d);
                      setExtratoPage(1);
                    }}
                    className="min-w-[11rem] flex-1"
                  />
                  <DatePicker
                    label="Até"
                    value={extratoEndDate}
                    onChange={(d) => {
                      setExtratoEndDate(d);
                      setExtratoPage(1);
                    }}
                    className="min-w-[11rem] flex-1"
                  />
                </div>

                <div className="md:col-span-3 min-w-0">
                  <div className="w-full flex flex-wrap items-end gap-2 bg-white p-2 rounded-lg border">
                    <label className="text-xs text-gray-600">
                      Threshold
                      <select
                        value={bulkThreshold}
                        onChange={(e) => setBulkThreshold(Number(e.target.value))}
                        className="mt-1 w-[120px] rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                        disabled={!selectedContaId || bulkConciliando}
                      >
                        {[70, 75, 80, 85, 90, 95].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleAutoConciliarPagina()}
                      disabled={!selectedContaId || bulkConciliando || !!busyExtratoId}
                      className="gap-2 flex-1"
                      title="Tenta conciliar automaticamente todos os lançamentos pendentes da página atual."
                    >
                      {bulkConciliando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft size={18} />}
                      Auto conciliar (página)
                    </Button>
                  </div>
                </div>

                <div className="md:col-span-12 flex justify-start md:justify-end">
                  <Button
                    onClick={() => setIsImportModalOpen(true)}
                    disabled={!selectedContaId}
                    className="gap-2 w-full md:w-auto"
                  >
                    <UploadCloud size={18} /> Importar Extrato
                  </Button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0">
                {!selectedContaId ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <FileSpreadsheet size={48} className="mb-4 opacity-20" />
                        <p>Selecione uma conta corrente para realizar a conciliação.</p>
                    </div>
                ) : loadingExtrato ? (
                    <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>
                ) : (
                  <div className="h-full overflow-auto">
                    <ExtratosTable 
                        extratos={extratos} 
                        onConciliate={(item) => (busyExtratoId ? undefined : setConciliacaoItem(item))} 
                        onUnconciliate={handleUnconciliate}
                        busyExtratoId={busyExtratoId}
                        transferAssistByExtratoId={transferAssistByExtratoId}
                        onQuickLinkTransfer={handleQuickLinkTransfer}
                    />
                  </div>
                )}
            </div>

            {selectedContaId && extratoCount > 0 ? (
              <ListPaginationBar sticky={false} className="mt-4" innerClassName="px-3 sm:px-4">
                <Pagination
                  currentPage={extratoPage}
                  totalCount={extratoCount}
                  pageSize={extratoPageSize}
                  onPageChange={setExtratoPage}
                  onPageSizeChange={(next) => {
                    setExtratoPage(1);
                    setExtratoPageSize(next);
                  }}
                />
              </ListPaginationBar>
            ) : null}
        </div>
      )}

      {activeTab === 'regras' && (
        <ConciliacaoRegrasPanel
          contas={contas}
          selectedContaId={selectedContaId}
          setSelectedContaId={setSelectedContaId}
        />
      )}

      {/* Modals */}
      <Modal isOpen={isContaFormOpen} onClose={closeContaForm} title={selectedConta ? 'Editar Conta' : 'Nova Conta'}>
        <ContaCorrenteFormPanel 
            conta={selectedConta} 
            onSaveSuccess={() => { closeContaForm(); refreshContas(); }} 
            onClose={closeContaForm} 
        />
      </Modal>

      <Modal
        isOpen={isMovFormOpen}
        onClose={closeMovForm}
        title={selectedMov ? (movReadOnly ? 'Movimentação (leitura)' : 'Editar Movimentação') : 'Nova Movimentação'}
      >
        <MovimentacaoFormPanel 
            movimentacao={selectedMov} 
            contaCorrenteId={selectedContaId!}
            onSaveSuccess={() => { closeMovForm(); refreshMov(); refreshContas(); }} 
            onClose={closeMovForm} 
            readOnly={movReadOnly}
        />
      </Modal>

      <Modal
        isOpen={isTransferFormOpen}
        onClose={closeTransferForm}
        title="Transferência entre contas"
      >
        <TransferenciaEntreContasFormPanel
          contas={contas}
          defaultContaOrigemId={selectedContaId}
          onSaveSuccess={() => {
            closeTransferForm();
            refreshMov();
            refreshExtrato();
            refreshContas();
          }}
          onClose={closeTransferForm}
        />
      </Modal>

      <ImportarExtratoModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImport={handleImport}
        contaCorrenteId={selectedContaId!}
        onImported={() => { refreshExtrato(); refreshMov(); refreshContas(); }}
      />

      <ConciliacaoDrawer 
        isOpen={!!conciliacaoItem} 
        onClose={() => setConciliacaoItem(null)} 
        extratoItem={conciliacaoItem}
        contaCorrenteId={selectedContaId!}
        onConciliate={handleConciliate}
      />

      <ConfirmationModal
        isOpen={!!contaToDelete}
        onClose={() => setContaToDelete(null)}
        onConfirm={handleDeleteConta}
        title="Excluir Conta"
        description={`Tem certeza que deseja excluir a conta "${contaToDelete?.nome}"?`}
        isLoading={false}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={!!movToDelete}
        onClose={() => setMovToDelete(null)}
        onConfirm={handleDeleteMov}
        title="Excluir Movimentação"
        description="Tem certeza que deseja excluir esta movimentação? O saldo será recalculado."
        isLoading={false}
        variant="danger"
      />
    </div>
  );
}

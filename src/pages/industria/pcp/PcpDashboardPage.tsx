import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, BarChart3, BellRing, Filter, GripVertical, LineChart, Loader2, PackageSearch, PieChart, RefreshCw, TrendingUp } from 'lucide-react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useToast } from '@/contexts/ToastProvider';
import {
  EstoqueProjetadoPoint,
  listPcpAtpCtp,
  listPcpCargaCapacidade,
  listPcpEstoqueProjetado,
  listPcpGantt,
  listPcpKpis,
  listPcpOrdensLeadTime,
  listPcpParetoRefugos,
  pcpApsSequenciarCentro,
  pcpApsListRuns,
  pcpApsUndo,
  pcpApsGetRunChanges,
  pcpApsPreviewSequenciarCentro,
  pcpApsResequenciarCentro,
  pcpApsSequenciarTodosCts,
  pcpReplanejarCentroSobrecarga,
  pcpReplanejarCentroSobrecargaApplySubset,
  pcpReplanCentroSobrecargaPreview,
  setOperacaoApsLock,
  PcpAtpCtp,
  PcpApsBatchSequencingRow,
  PcpCargaCapacidade,
  PcpGanttOperacao,
  PcpKpis,
  PcpOrdemLeadTime,
  PcpParetoItem,
  PcpReplanPreviewRow
} from '@/services/industriaProducao';
import { getCentroApsConfig } from '@/services/industriaCentros';
import { differenceInCalendarDays, format } from 'date-fns';
import Modal from '@/components/ui/Modal';

const fmtInput = (date: Date) => date.toISOString().slice(0, 10);

const formatHours = (hours?: number | null) => {
  if (hours === null || hours === undefined) return '0 h';
  if (hours >= 24) {
    const dias = Math.floor(hours / 24);
    const resto = hours % 24;
    return `${dias}d ${resto.toFixed(0)}h`;
  }
  return `${hours.toFixed(1)} h`;
};

const formatPercent = (value?: number | null, digits = 1) => {
  if (value === null || value === undefined) return '0%';
  return `${value.toFixed(digits)}%`;
};

type AlertSeverity = 'critical' | 'warning';

interface PcpAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  helper?: string;
  actionLabel?: string;
  action?: () => void;
}

type CapacitySuggestion = {
  peakDay?: string;
  peakRatio: number;
  overloadHours: number;
  suggestedDay?: string;
  suggestedSpanDays?: number;
  suggestedFreeHours?: number;
  message?: string;
};


export default function PcpDashboardPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const ganttSectionRef = useRef<HTMLDivElement | null>(null);
  const [carga, setCarga] = useState<PcpCargaCapacidade[]>([]);
  const [gantt, setGantt] = useState<PcpGanttOperacao[]>([]);
  const [kpis, setKpis] = useState<PcpKpis | null>(null);
  const [atpCtp, setAtpCtp] = useState<PcpAtpCtp[]>([]);
  const [pareto, setPareto] = useState<PcpParetoItem[]>([]);
  const [leadTimes, setLeadTimes] = useState<PcpOrdemLeadTime[]>([]);
  const [selectedProdutoId, setSelectedProdutoId] = useState<string | null>(null);
  const [estoqueProjetado, setEstoqueProjetado] = useState<EstoqueProjetadoPoint[]>([]);
  const [estoqueLoading, setEstoqueLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(fmtInput(new Date(Date.now() - 3 * 24 * 3600 * 1000)));
  const [endDate, setEndDate] = useState(fmtInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)));
  const [ganttCtFilter, setGanttCtFilter] = useState<string>('all');
  const [ganttStatusFilter, setGanttStatusFilter] = useState<string>('all');
  const [ganttApsFilter, setGanttApsFilter] = useState<string>('all');
  const [applyingCtId, setApplyingCtId] = useState<string | null>(null);
  const [sequencingCtId, setSequencingCtId] = useState<string | null>(null);

  const [apsModal, setApsModal] = useState<{
    open: boolean;
    ctId?: string;
    ctNome?: string;
  }>({ open: false });
  const [apsPreview, setApsPreview] = useState<null | {
    total_operacoes: number;
    updated_operacoes: number;
    unscheduled_operacoes: number;
  }>(null);
  const [apsRuns, setApsRuns] = useState<any[]>([]);
  const [apsLoading, setApsLoading] = useState(false);
  const [apsPreviewRows, setApsPreviewRows] = useState<any[]>([]);
  const [apsSelectedRunId, setApsSelectedRunId] = useState<string | null>(null);
  const [apsRunChanges, setApsRunChanges] = useState<any[]>([]);
  const [apsFreezeDias, setApsFreezeDias] = useState<number>(0);
  const [apsConfigLoading, setApsConfigLoading] = useState(false);
  const [manualSeqRows, setManualSeqRows] = useState<PcpGanttOperacao[]>([]);
  const [manualSeqDirty, setManualSeqDirty] = useState(false);
  const [manualSeqSaving, setManualSeqSaving] = useState(false);
  const [batchSequencing, setBatchSequencing] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchRows, setBatchRows] = useState<PcpApsBatchSequencingRow[]>([]);
  const [batchPreviewed, setBatchPreviewed] = useState(false);
  const [replanModalOpen, setReplanModalOpen] = useState(false);
  const [replanApplying, setReplanApplying] = useState(false);
  const [replanResults, setReplanResults] = useState<Record<string, any>>({});
  const [replanSelected, setReplanSelected] = useState<Record<string, boolean>>({});
  const [replanPreview, setReplanPreview] = useState<Record<string, {
    rows: PcpReplanPreviewRow[];
    summary: {
      total: number;
      canMove: number;
      locked: number;
      noSlot: number;
      zeroHours: number;
      noOverload: number;
      freezeUntil?: string;
    };
  }>>({});
  const [replanPreviewingCtId, setReplanPreviewingCtId] = useState<string | null>(null);
  const [replanPreviewDetails, setReplanPreviewDetails] = useState<{
    open: boolean;
    ctId?: string;
    ctNome?: string;
    peakDay?: string;
  }>({ open: false });
  const [replanPreviewReasonFilter, setReplanPreviewReasonFilter] = useState<string>('all');
  const [replanPreviewSelectedOps, setReplanPreviewSelectedOps] = useState<Record<string, boolean>>({});
  const [replanApplyingSubsetCtId, setReplanApplyingSubsetCtId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cargaData, ganttData, kpisData, atpData, paretoData, leadTimeData] = await Promise.all([
        listPcpCargaCapacidade(startDate, endDate),
        listPcpGantt(startDate, endDate),
        listPcpKpis(30),
        listPcpAtpCtp(endDate),
        listPcpParetoRefugos(startDate, endDate),
        listPcpOrdensLeadTime(startDate, endDate)
      ]);
      setCarga(cargaData);
      setGantt(ganttData);
      setKpis(kpisData);
      setAtpCtp(atpData);
      setPareto(paretoData);
      setLeadTimes(leadTimeData);
      setSelectedProdutoId(prev => {
        if (prev && atpData.some(item => item.produto_id === prev)) {
          return prev;
        }
        return atpData[0]?.produto_id || null;
      });
      if (atpData.length === 0) {
        setEstoqueProjetado([]);
      }
    } catch (error: any) {
      addToast(error.message || 'Não foi possível carregar PCP.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, endDate, startDate]);

  const openGanttForCt = useCallback((ctId: string) => {
    setGanttCtFilter(ctId);
    setGanttStatusFilter('all');
    setGanttApsFilter('all');
    setTimeout(() => ganttSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  const applyReplanForCt = useCallback(async (ctId: string, peakDay?: string) => {
    if (!peakDay) return;
    if (!confirm('Aplicar replanejamento automático? Isso vai mover operações (menor prioridade) para dias com folga no período.')) return;
    setApplyingCtId(ctId);
    try {
      const result = await pcpReplanejarCentroSobrecarga(ctId, peakDay, endDate);
      const moved = result?.moved ?? 0;
      const remaining = result?.remaining_overload_hours ?? 0;
      const freezeInfo = result?.freeze_until ? ` (Freeze até ${format(new Date(result.freeze_until), 'dd/MM')})` : '';
      addToast(
        moved > 0
          ? `Replanejamento aplicado: ${moved} operação(ões) movida(s).${remaining > 0.1 ? ` Restante ~${remaining.toFixed(1)}h.` : ''} (Undo disponível em Sequenciar)`
          : `${result?.message || 'Nada para mover no período.'}${freezeInfo}`,
        moved > 0 ? 'success' : 'warning'
      );
      await loadData();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao aplicar replanejamento.', 'error');
    } finally {
      setApplyingCtId(null);
    }
  }, [addToast, endDate]);

  const runSequencerForCt = useCallback(async (ctId: string) => {
    setApsModal({ open: true, ctId, ctNome: capacitySummary.find(c => c.id === ctId)?.nome });
  }, [addToast, endDate, startDate, openGanttForCt]);

  const loadApsRuns = useCallback(async (ctId: string) => {
    try {
      const data = await pcpApsListRuns(ctId, 5);
      setApsRuns(data || []);
    } catch {
      setApsRuns([]);
    }
  }, []);

  useEffect(() => {
    if (!apsModal.open || !apsModal.ctId) return;
    setApsPreview(null);
    setApsRuns([]);
    setApsPreviewRows([]);
    setApsSelectedRunId(null);
    setApsRunChanges([]);
    setApsFreezeDias(0);
    setManualSeqRows([]);
    setManualSeqDirty(false);
    loadApsRuns(apsModal.ctId);
    setApsConfigLoading(true);
    getCentroApsConfig(apsModal.ctId)
      .then((cfg) => setApsFreezeDias(Number(cfg?.freeze_dias ?? 0) || 0))
      .catch(() => setApsFreezeDias(0))
      .finally(() => setApsConfigLoading(false));
  }, [apsModal.open, apsModal.ctId, loadApsRuns]);

  useEffect(() => {
    if (!apsModal.open || !apsModal.ctId) return;
    if (manualSeqDirty) return;
    const rows = (gantt || [])
      .filter((r) => r.centro_trabalho_id === apsModal.ctId)
      .filter((r) => !['em_execucao', 'concluida', 'cancelada'].includes(String(r.status_operacao || '').toLowerCase()))
      .sort((a, b) => (a.operacao_sequencia ?? 0) - (b.operacao_sequencia ?? 0));
    setManualSeqRows(rows);
  }, [apsModal.open, apsModal.ctId, gantt, manualSeqDirty]);

  const handleDragManualSeq = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    setManualSeqRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setManualSeqDirty(true);
  }, []);

  const handleSaveManualSeq = useCallback(async () => {
    if (!apsModal.ctId) return;
    if (manualSeqRows.length === 0) return;
    if (!confirm('Salvar ordem manual deste CT? Isso vai atualizar o campo sequencia das operações (Undo disponível em Runs).')) return;
    setManualSeqSaving(true);
    try {
      const result = await pcpApsResequenciarCentro(apsModal.ctId, manualSeqRows.map((r) => r.operacao_id));
      addToast(`Ordem salva: ${result.updated}/${result.total} operações atualizadas.`, result.updated > 0 ? 'success' : 'warning');
      setManualSeqDirty(false);
      await loadData();
      await loadApsRuns(apsModal.ctId);
      if (result.run_id) setApsSelectedRunId(String(result.run_id));
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar ordem manual.', 'error');
    } finally {
      setManualSeqSaving(false);
    }
  }, [addToast, apsModal.ctId, loadApsRuns, loadData, manualSeqRows]);

  const runBatchSequencing = useCallback(async (apply: boolean) => {
    setBatchSequencing(true);
    try {
      const rows = await pcpApsSequenciarTodosCts({ dataInicial: startDate, dataFinal: endDate, apply });
      setBatchRows(rows || []);
      setBatchPreviewed(true);
      if (apply) {
        const total = (rows || []).reduce((acc, r) => acc + (r.total_operacoes || 0), 0);
        const updated = (rows || []).reduce((acc, r) => acc + (r.updated_operacoes || 0), 0);
        const unscheduled = (rows || []).reduce((acc, r) => acc + (r.unscheduled_operacoes || 0), 0);
        addToast(
          `APS em lote concluído: ${updated}/${total} operações atualizadas.${unscheduled > 0 ? ` ${unscheduled} sem agenda.` : ''}`,
          unscheduled > 0 ? 'warning' : 'success'
        );
        await loadData();
      } else {
        addToast('Preview em lote gerado (nenhuma alteração aplicada).', 'success');
      }
    } catch (e: any) {
      addToast(e?.message || 'Falha no APS em lote.', 'error');
    } finally {
      setBatchSequencing(false);
    }
  }, [addToast, endDate, loadData, startDate]);

  const openBatchModal = useCallback(() => {
    setBatchModalOpen(true);
    setBatchRows([]);
    setBatchPreviewed(false);
  }, []);

  const openApsForCt = useCallback((ctId: string, ctNome?: string) => {
    setBatchModalOpen(false);
    setApsModal({ open: true, ctId, ctNome });
  }, []);

  const undoBatchRun = useCallback(async (runId: string) => {
    if (!confirm(`Desfazer o run ${runId.slice(0, 8)}?`)) return;
    setBatchSequencing(true);
    try {
      const res = await pcpApsUndo(runId);
      addToast(`Undo concluído: ${res.restored} revertidas, ${res.skipped} ignoradas.`, res.skipped > 0 ? 'warning' : 'success');
      await loadData();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao desfazer run.', 'error');
    } finally {
      setBatchSequencing(false);
    }
  }, [addToast, loadData]);

  const fetchPreview = useCallback(async (silent = false) => {
    if (!apsModal.ctId) return;
    const rows = await pcpApsPreviewSequenciarCentro({
      centroTrabalhoId: apsModal.ctId,
      dataInicial: startDate,
      dataFinal: endDate,
      limit: 200,
    });
    setApsPreviewRows(rows || []);
    const unscheduled = (rows || []).filter(r => r.scheduled === false && !r.skip_reason).length;
    const skipped = (rows || []).filter(r => !!r.skip_reason).length;
    const changed = (rows || []).filter(r => r.scheduled === true).length;
    setApsPreview({
      total_operacoes: rows.length,
      updated_operacoes: changed,
      unscheduled_operacoes: unscheduled + skipped,
    });
    if (!silent) addToast('Preview gerado (nenhuma alteração aplicada).', 'success');
  }, [addToast, apsModal.ctId, endDate, startDate]);

  const handlePreview = useCallback(async () => {
    setApsLoading(true);
    try {
      await fetchPreview(false);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar preview.', 'error');
    } finally {
      setApsLoading(false);
    }
  }, [addToast, fetchPreview]);

  const handleApplySequencing = useCallback(async () => {
    if (!apsModal.ctId) return;
    if (!confirm('Aplicar sequenciamento automático (capacidade finita)? Isso vai atualizar as datas previstas das operações elegíveis.')) return;
    setSequencingCtId(apsModal.ctId);
    try {
      const result = await pcpApsSequenciarCentro({
        centroTrabalhoId: apsModal.ctId,
        dataInicial: startDate,
        dataFinal: endDate,
        apply: true,
      });
      if (typeof result.freeze_dias === 'number') setApsFreezeDias(result.freeze_dias);
      addToast(
        `Sequenciamento aplicado: ${result.updated_operacoes}/${result.total_operacoes} operações atualizadas.${result.unscheduled_operacoes > 0 ? ` ${result.unscheduled_operacoes} sem agenda.` : ''}${typeof result.freeze_dias === 'number' && result.freeze_dias > 0 ? ` (Freeze: ${result.freeze_dias} dias)` : ''}`,
        result.unscheduled_operacoes > 0 ? 'warning' : 'success'
      );
      await loadData();
      await loadApsRuns(apsModal.ctId);
      openGanttForCt(apsModal.ctId);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao sequenciar centro.', 'error');
    } finally {
      setSequencingCtId(null);
    }
  }, [addToast, apsModal.ctId, endDate, loadApsRuns, openGanttForCt, startDate]);

  const handleToggleLockOperacao = useCallback(async (operacaoId: string, locked: boolean, currentReason?: string | null) => {
    const nextLocked = !locked;
    const promptResult = nextLocked ? prompt('Motivo do bloqueio (opcional):', currentReason || '') : null;
    if (nextLocked && promptResult === null) return;
    const reason = nextLocked ? (promptResult || '').trim() : null;
    if (!nextLocked && !confirm('Desbloquear esta operação para o APS?')) return;

    setApsLoading(true);
    try {
      await setOperacaoApsLock(operacaoId, nextLocked, reason || null);
      addToast(nextLocked ? 'Operação bloqueada para APS.' : 'Operação desbloqueada.', 'success');
      if (apsModal.ctId) {
        await loadData();
        await fetchPreview(true);
        if (apsSelectedRunId) {
          const rows = await pcpApsGetRunChanges(apsSelectedRunId, 200);
          setApsRunChanges(rows || []);
        }
      }
    } catch (e: any) {
      addToast(e?.message || 'Falha ao atualizar bloqueio APS.', 'error');
    } finally {
      setApsLoading(false);
    }
  }, [addToast, apsModal.ctId, apsSelectedRunId, fetchPreview]);

  const handleUndoLast = useCallback(async () => {
    if (!apsModal.ctId) return;
    const last = apsRuns?.find((r) => r.kind === 'sequencing') || apsRuns?.[0];
    if (!last?.id) return;
    if (!confirm('Desfazer o último sequenciamento aplicado?')) return;
    setApsLoading(true);
    try {
      const result = await pcpApsUndo(last.id);
      addToast(`Undo concluído: ${result.restored} revertidas, ${result.skipped} ignoradas.`, result.skipped > 0 ? 'warning' : 'success');
      await loadData();
      await loadApsRuns(apsModal.ctId);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao desfazer.', 'error');
    } finally {
      setApsLoading(false);
    }
  }, [addToast, apsModal.ctId, apsRuns, loadApsRuns]);

  useEffect(() => {
    if (!apsModal.open) return;
    if (!apsSelectedRunId) return;
    setApsLoading(true);
    pcpApsGetRunChanges(apsSelectedRunId, 200)
      .then((rows) => setApsRunChanges(rows || []))
      .catch(() => setApsRunChanges([]))
      .finally(() => setApsLoading(false));
  }, [apsModal.open, apsSelectedRunId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedProdutoId) {
      setEstoqueProjetado([]);
      return;
    }
    setEstoqueLoading(true);
    listPcpEstoqueProjetado(selectedProdutoId)
      .then(setEstoqueProjetado)
      .catch((error: any) => addToast(error.message || 'Não foi possível carregar estoque projetado.', 'error'))
      .finally(() => setEstoqueLoading(false));
  }, [selectedProdutoId, addToast]);

  const capacitySummary = useMemo(() => {
    const map = new Map<string, {
      id: string;
      nome: string;
      totalCapacidade: number;
      totalCarga: number;
      totalSetup: number;
      totalProducao: number;
      totalExecucao: number;
      dias: PcpCargaCapacidade[];
      ratio: number;
    }>();

    carga.forEach(item => {
      const entry = map.get(item.centro_trabalho_id) || {
        id: item.centro_trabalho_id,
        nome: item.centro_trabalho_nome,
        totalCapacidade: 0,
        totalCarga: 0,
        totalSetup: 0,
        totalProducao: 0,
        totalExecucao: 0,
        dias: []
      };
      entry.totalCapacidade += item.capacidade_horas;
      entry.totalCarga += item.carga_total_horas;
      entry.totalSetup += item.carga_setup_horas;
      entry.totalProducao += item.carga_producao_horas;
      entry.totalExecucao += item.carga_em_execucao_horas;
      entry.dias.push(item);
      map.set(item.centro_trabalho_id, entry);
    });

    return Array.from(map.values())
      .map(entry => ({
        ...entry,
        ratio: entry.totalCapacidade > 0 ? entry.totalCarga / entry.totalCapacidade : 0
      }))
      .sort((a, b) => b.totalCarga - a.totalCarga);
  }, [carga]);

  const principalGargaloId = useMemo(() => {
    if (capacitySummary.length === 0) return null;
    const maisCritico = capacitySummary.reduce((prev, curr) => (curr.ratio > prev.ratio ? curr : prev));
    return maisCritico.id;
  }, [capacitySummary]);

  const capacitySuggestions = useMemo(() => {
    const map = new Map<string, CapacitySuggestion>();
    for (const ct of capacitySummary) {
      if (!ct.dias?.length) {
        map.set(ct.id, { peakRatio: 0, overloadHours: 0, message: 'Sem dados no período.' });
        continue;
      }
      const dias = [...ct.dias].sort((a, b) => new Date(a.dia).getTime() - new Date(b.dia).getTime());
      const peak = dias.reduce(
        (acc, dia) => {
          const ratioDia = dia.capacidade_horas > 0 ? dia.carga_total_horas / dia.capacidade_horas : 0;
          return ratioDia > acc.ratio ? { ratio: ratioDia, dia } : acc;
        },
        { ratio: 0, dia: dias[0] }
      );

      const overloadHours = Math.max(0, peak.dia.carga_total_horas - peak.dia.capacidade_horas);
      if (overloadHours <= 0.01) {
        map.set(ct.id, {
          peakDay: peak.dia.dia,
          peakRatio: peak.ratio,
          overloadHours: 0,
          message: 'Sem sobrecarga no período.',
        });
        continue;
      }

      const startIndex = dias.findIndex(d => d.dia === peak.dia.dia);
      let cumulativeFree = 0;
      let suggestedDay: string | undefined;
      let suggestedSpanDays = 0;
      let suggestedFreeHours: number | undefined;

      for (let i = Math.max(0, startIndex + 1); i < dias.length; i++) {
        const free = Math.max(0, dias[i].capacidade_horas - dias[i].carga_total_horas);
        cumulativeFree += free;
        suggestedSpanDays++;
        if (cumulativeFree + 1e-6 >= overloadHours) {
          suggestedDay = dias[i].dia;
          suggestedFreeHours = free;
          break;
        }
      }

      map.set(ct.id, {
        peakDay: peak.dia.dia,
        peakRatio: peak.ratio,
        overloadHours,
        suggestedDay,
        suggestedSpanDays: suggestedDay ? suggestedSpanDays : undefined,
        suggestedFreeHours,
        message: suggestedDay
          ? `Mover ~${overloadHours.toFixed(1)}h após o pico (folga acumulada em ${suggestedSpanDays} dia(s)).`
          : 'Sem folga suficiente no período selecionado.',
      });
    }
    return map;
  }, [capacitySummary]);

  const replanCandidates = useMemo(() => {
    const rows = capacitySummary
      .map((ct) => {
        const sug = capacitySuggestions.get(ct.id);
        if (!sug?.peakDay || (sug.overloadHours ?? 0) <= 0.01) return null;
        return {
          centro_id: ct.id,
          centro_nome: ct.nome,
          peak_day: sug.peakDay,
          peak_ratio: sug.peakRatio,
          overload_hours: sug.overloadHours,
          suggested_day: sug.suggestedDay,
          suggested_span_days: sug.suggestedSpanDays,
          message: sug.message,
        };
      })
      .filter(Boolean) as Array<{
        centro_id: string;
        centro_nome: string;
        peak_day: string;
        peak_ratio: number;
        overload_hours: number;
        suggested_day?: string;
        suggested_span_days?: number;
        message?: string;
      }>;

    return rows.sort((a, b) => (b.overload_hours || 0) - (a.overload_hours || 0));
  }, [capacitySummary, capacitySuggestions]);

  const selectedReplanCandidates = useMemo(
    () => replanCandidates.filter((r) => replanSelected[r.centro_id] !== false),
    [replanCandidates, replanSelected]
  );

  const openReplanModal = useCallback(() => {
    setReplanModalOpen(true);
    setReplanResults({});
    setReplanPreview({});
    setReplanPreviewingCtId(null);
    setReplanPreviewDetails({ open: false });
    setReplanPreviewReasonFilter('all');
    setReplanPreviewSelectedOps({});
    setReplanApplyingSubsetCtId(null);
    setReplanSelected(
      replanCandidates.reduce((acc, r) => {
        acc[r.centro_id] = true;
        return acc;
      }, {} as Record<string, boolean>)
    );
  }, [replanCandidates]);

  const applyReplanBatch = useCallback(async () => {
    if (selectedReplanCandidates.length === 0) return;
    if (!confirm(`Aplicar replanejamento automático para ${selectedReplanCandidates.length} CT(s) selecionado(s) com sobrecarga no período?`)) return;
    setReplanApplying(true);
    setReplanResults({});
    try {
      for (const item of selectedReplanCandidates) {
        try {
          const res = await pcpReplanejarCentroSobrecarga(item.centro_id, item.peak_day, endDate);
          setReplanResults((prev) => ({ ...prev, [item.centro_id]: res }));
        } catch (e: any) {
          setReplanResults((prev) => ({ ...prev, [item.centro_id]: { message: e?.message || 'Falha', moved: 0 } }));
        }
      }
      addToast('Replanejamento em lote concluído.', 'success');
      await loadData();
    } finally {
      setReplanApplying(false);
    }
  }, [addToast, endDate, loadData, selectedReplanCandidates]);

  const previewReplanForCt = useCallback(async (ctId: string, ctNome: string, peakDay: string) => {
    setReplanPreviewingCtId(ctId);
    try {
      const rows = await pcpReplanCentroSobrecargaPreview(ctId, peakDay, endDate, 200);
      const summary = rows.reduce((acc, row) => {
        acc.total += 1;
        if (row.can_move) acc.canMove += 1;
        if (row.reason === 'locked') acc.locked += 1;
        if (row.reason === 'no_slot') acc.noSlot += 1;
        if (row.reason === 'zero_hours') acc.zeroHours += 1;
        if (row.reason === 'no_overload') acc.noOverload += 1;
        if (!acc.freezeUntil && row.freeze_until) acc.freezeUntil = row.freeze_until;
        return acc;
      }, { total: 0, canMove: 0, locked: 0, noSlot: 0, zeroHours: 0, noOverload: 0, freezeUntil: undefined as string | undefined });

      setReplanPreview((prev) => ({ ...prev, [ctId]: { rows, summary } }));

      addToast(
        `Preview ${ctNome}: ${summary.canMove}/${summary.total} movíveis${summary.locked > 0 ? `, ${summary.locked} locked` : ''}${summary.noSlot > 0 ? `, ${summary.noSlot} sem slot` : ''}${summary.freezeUntil ? ` (Freeze até ${format(new Date(summary.freezeUntil), 'dd/MM')})` : ''}.`,
        summary.canMove > 0 ? 'success' : 'warning'
      );
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar preview do replanejamento.', 'error');
    } finally {
      setReplanPreviewingCtId(null);
    }
  }, [addToast, endDate]);

  const openReplanPreviewDetailsForCt = useCallback(async (ctId: string, ctNome: string, peakDay: string) => {
    const existing = replanPreview[ctId]?.rows;
    if (existing?.length) {
      setReplanPreviewDetails({ open: true, ctId, ctNome, peakDay });
      setReplanPreviewSelectedOps(
        existing.reduce((acc, r) => {
          if (r.can_move) acc[r.operacao_id] = true;
          return acc;
        }, {} as Record<string, boolean>)
      );
      return;
    }

    setReplanPreviewingCtId(ctId);
    try {
      const rows = await pcpReplanCentroSobrecargaPreview(ctId, peakDay, endDate, 200);
      const summary = rows.reduce((acc, row) => {
        acc.total += 1;
        if (row.can_move) acc.canMove += 1;
        if (row.reason === 'locked') acc.locked += 1;
        if (row.reason === 'no_slot') acc.noSlot += 1;
        if (row.reason === 'zero_hours') acc.zeroHours += 1;
        if (row.reason === 'no_overload') acc.noOverload += 1;
        if (!acc.freezeUntil && row.freeze_until) acc.freezeUntil = row.freeze_until;
        return acc;
      }, { total: 0, canMove: 0, locked: 0, noSlot: 0, zeroHours: 0, noOverload: 0, freezeUntil: undefined as string | undefined });

      setReplanPreview((prev) => ({ ...prev, [ctId]: { rows, summary } }));
      setReplanPreviewDetails({ open: true, ctId, ctNome, peakDay });
      setReplanPreviewSelectedOps(
        rows.reduce((acc, r) => {
          if (r.can_move) acc[r.operacao_id] = true;
          return acc;
        }, {} as Record<string, boolean>)
      );
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar detalhes do preview.', 'error');
    } finally {
      setReplanPreviewingCtId(null);
    }
  }, [addToast, endDate, replanPreview]);

  const applyReplanSelectedOpsForCurrentCt = useCallback(async () => {
    const ctId = replanPreviewDetails.ctId;
    const ctNome = replanPreviewDetails.ctNome || 'CT';
    const peakDay = replanPreviewDetails.peakDay;
    if (!ctId || !peakDay) return;

    const previewRows = replanPreview[ctId]?.rows || [];
    const selectedIds = previewRows
      .filter((r) => r.can_move && replanPreviewSelectedOps[r.operacao_id] === true)
      .map((r) => r.operacao_id);

    if (selectedIds.length === 0) {
      addToast('Nenhuma operação movível selecionada.', 'warning');
      return;
    }

    if (!confirm(`Aplicar replanejamento para ${selectedIds.length} operação(ões) selecionada(s) de ${ctNome}?`)) return;

    setReplanApplyingSubsetCtId(ctId);
    try {
      const res = await pcpReplanejarCentroSobrecargaApplySubset(ctId, peakDay, selectedIds, endDate);
      setReplanResults((prev) => ({ ...prev, [ctId]: res }));
      const moved = Number(res?.moved ?? 0) || 0;
      const remaining = Number(res?.remaining_overload_hours ?? 0) || 0;
      addToast(
        moved > 0
          ? `Replanejamento aplicado: ${moved} operação(ões) movida(s).${remaining > 0.1 ? ` Restante ~${remaining.toFixed(1)}h.` : ''}`
          : (res?.message || 'Nenhuma alteração aplicada.'),
        moved > 0 ? 'success' : 'warning'
      );
      setReplanPreviewDetails({ open: false });
      await loadData();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao aplicar replanejamento (selecionadas).', 'error');
    } finally {
      setReplanApplyingSubsetCtId(null);
    }
  }, [addToast, endDate, loadData, replanPreview, replanPreviewDetails.ctId, replanPreviewDetails.ctNome, replanPreviewDetails.peakDay, replanPreviewSelectedOps]);

  const weeklySeries = useMemo(() => {
    const dailyMap = new Map<string, { label: string; carga: number; capacidade: number }>();
    carga.forEach(item => {
      const label = format(new Date(item.dia), 'dd/MM');
      const point = dailyMap.get(item.dia) || { label, carga: 0, capacidade: 0 };
      point.carga += item.carga_total_horas;
      point.capacidade += item.capacidade_horas;
      dailyMap.set(item.dia, point);
    });
    const serie = Array.from(dailyMap.entries())
      .map(([dia, value]) => ({
        ...value,
        dia
      }))
      .sort((a, b) => new Date(a.dia).getTime() - new Date(b.dia).getTime());
    const maxCarga = serie.reduce((max, item) => Math.max(max, item.carga, item.capacidade), 0);
    return { serie, max: maxCarga || 1 };
  }, [carga]);

  const ganttRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.max(differenceInCalendarDays(end, start), 1);
    return { start, end, totalDays };
  }, [startDate, endDate]);

  const ganttRows = useMemo(() => {
    const filtered = gantt.filter(item => {
      const matchCt = ganttCtFilter === 'all' || item.centro_trabalho_id === ganttCtFilter;
      const matchStatus = ganttStatusFilter === 'all' || item.status_operacao === ganttStatusFilter;
      const isLocked = !!item.aps_locked;
      const isFreeze = !!item.aps_in_freeze;
      const matchAps =
        ganttApsFilter === 'all'
        || (ganttApsFilter === 'locked' && isLocked)
        || (ganttApsFilter === 'freeze' && !isLocked && isFreeze)
        || (ganttApsFilter === 'blocked' && (isLocked || isFreeze))
        || (ganttApsFilter === 'eligible' && !isLocked && !isFreeze);
      return matchCt && matchStatus && matchAps;
    });

    return filtered.map(item => {
      const start = new Date(item.data_inicio);
      const end = new Date(item.data_fim);
      const startOffset = differenceInCalendarDays(start, ganttRange.start);
      const duration = Math.max(differenceInCalendarDays(end, start) + 1, 1);
      const offsetPercent = Math.max((startOffset / ganttRange.totalDays) * 100, 0);
      const durationPercent = Math.min((duration / ganttRange.totalDays) * 100, 100);
      return {
        ...item,
        offsetPercent,
        durationPercent,
        transferPercent: Math.min(item.transfer_ratio * 100, 100)
      };
    });
  }, [gantt, ganttRange, ganttCtFilter, ganttStatusFilter]);

  const selectedProdutoInfo = useMemo(
    () => atpCtp.find(item => item.produto_id === selectedProdutoId) || null,
    [atpCtp, selectedProdutoId]
  );

  const ganttCtOptions = useMemo(() => {
    const options = Array.from(
      new Map(
        gantt
          .filter(item => item.centro_trabalho_id)
          .map(item => [item.centro_trabalho_id as string, item.centro_trabalho_nome || 'Sem CT'])
      ).entries()
    );
    return options;
  }, [gantt]);

  const ganttStatusOptions = useMemo(() => {
    return Array.from(new Set(gantt.map(item => item.status_operacao))).filter(Boolean);
  }, [gantt]);

  const paretoAggregated = useMemo(() => {
    const map = new Map<string, { motivo_id: string | null; motivo_nome: string; total: number }>();
    pareto.forEach(item => {
      const key = item.motivo_id || 'sem-motivo';
      const existing = map.get(key) || { motivo_id: item.motivo_id, motivo_nome: item.motivo_nome, total: 0 };
      existing.total += item.total_refugo;
      map.set(key, existing);
    });
    const total = Array.from(map.values()).reduce((sum, item) => sum + item.total, 0);
    return {
      total,
      itens: Array.from(map.values())
        .map(item => ({
          ...item,
          percentual: total > 0 ? (item.total / total) * 100 : 0
        }))
        .sort((a, b) => b.total - a.total)
    };
  }, [pareto]);

  const estoqueGraph = useMemo(() => {
    if (!estoqueProjetado.length) {
      return { points: '', min: 0, max: 0 };
    }
    const valores = estoqueProjetado.map(p => p.saldo_projetado);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const range = max - min || 1;
    const points = estoqueProjetado.map((p, idx) => {
      const percentX = estoqueProjetado.length === 1 ? 0 : (idx / (estoqueProjetado.length - 1)) * 100;
      const percentY = 100 - ((p.saldo_projetado - min) / range) * 100;
      return `${percentX},${percentY}`;
    }).join(' ');
    return { points, min, max };
  }, [estoqueProjetado]);

  const rupturas = useMemo(
    () => estoqueProjetado.filter(p => p.saldo_projetado < 0),
    [estoqueProjetado]
  );

  const pcpAlerts = useMemo(() => {
    const alerts: PcpAlert[] = [];

    const overloadInfos = capacitySummary.map(ct => {
      const peak = ct.dias.reduce(
        (acc, dia) => {
          const ratioDia = dia.capacidade_horas > 0 ? dia.carga_total_horas / dia.capacidade_horas : 0;
          return ratioDia > acc.ratio ? { ratio: ratioDia, dia: dia.dia } : acc;
        },
        { ratio: 0, dia: ct.dias[0]?.dia }
      );
      return { ...ct, peakRatio: peak.ratio, peakDay: peak.dia };
    });

    const overloaded = overloadInfos
      .filter(info => info.peakRatio > 1.02)
      .sort((a, b) => b.peakRatio - a.peakRatio);
    if (overloaded.length > 0) {
      const primary = overloaded[0];
      const suggestion = capacitySuggestions.get(primary.id);
      const suggestionText = suggestion?.suggestedDay
        ? `Sugestão: buscar folga até ${format(new Date(suggestion.suggestedDay), 'dd/MM')}.`
        : 'Sugestão: ampliar janela/redistribuir carga.';
      alerts.push({
        id: 'ct-overload',
        severity: 'critical',
        title: 'Capacidade excedida',
        description: `${primary.nome} está com ${Math.round(primary.peakRatio * 100)}% na data ${primary.peakDay ? format(new Date(primary.peakDay), 'dd/MM') : 'informada'}.`,
        helper: overloaded.length > 1
          ? `${suggestionText} + ${overloaded.length - 1} centros também acima da capacidade.`
          : suggestionText,
        actionLabel: 'Ver no Gantt',
        action: () => openGanttForCt(primary.id)
      });
    } else if (capacitySummary.length > 0 && capacitySummary[0].ratio > 0.85) {
      alerts.push({
        id: 'ct-near-limit',
        severity: 'warning',
        title: 'CT próximo do limite',
        description: `${capacitySummary[0].nome} opera a ${(capacitySummary[0].ratio * 100).toFixed(0)}% no período.`,
        helper: 'Considere antecipar setups ou mover ordens antes do pico.',
        actionLabel: 'Reprogramar PCP',
        action: () => navigate('/app/industria/pcp')
      });
    }

    const faltasAtp = atpCtp.filter(item => item.disponibilidade_atp < 0);
    if (faltasAtp.length > 0) {
      const produtoCritico = faltasAtp[0];
      alerts.push({
        id: 'atp-shortage',
        severity: 'critical',
        title: `Falta prevista em ${produtoCritico.produto_nome}`,
        description: `ATP está em ${produtoCritico.disponibilidade_atp.toLocaleString('pt-BR')} unidades.`,
        helper: produtoCritico.data_ctp
          ? `Capacidade só libera novamente em ${format(new Date(produtoCritico.data_ctp), 'dd/MM')}.`
          : 'Sugestão: gerar transferência ou RC imediata.',
        actionLabel: 'Abrir MRP',
        action: () =>
          navigate({
            pathname: '/app/industria/mrp',
            search: `?produtoId=${produtoCritico.produto_id}&produtoNome=${encodeURIComponent(produtoCritico.produto_nome)}`
          })
      });
    }

    if (rupturas.length > 0 && selectedProdutoInfo) {
      const primeira = rupturas[0];
      alerts.push({
        id: 'estoque-ruptura',
        severity: 'warning',
        title: 'Ruptura projetada',
        description: `${selectedProdutoInfo.produto_nome} ficará negativo em ${format(new Date(primeira.dia), 'dd/MM')}.`,
        helper: `Saldo previsto: ${primeira.saldo_projetado.toFixed(0)} unidades.`,
        actionLabel: 'Ver Estoque',
        action: () =>
          navigate({
            pathname: '/app/suprimentos/estoque',
            search: `?produto=${encodeURIComponent(selectedProdutoInfo.produto_nome)}`
          })
      });
    }

    return alerts;
  }, [capacitySummary, atpCtp, rupturas, selectedProdutoInfo, navigate, capacitySuggestions, openGanttForCt]);

  const kpiCards = useMemo(() => [
    {
      label: 'OTIF (On Time In Full)',
      value: kpis ? formatPercent(kpis.otif_percent) : '—',
      helper: kpis ? `${kpis.ordens_concluidas} OPs concluídas` : 'Calculando...',
      trendColor: kpis && kpis.otif_percent >= 95 ? 'text-emerald-600' : 'text-amber-600'
    },
    {
      label: 'Lead time real',
      value: kpis ? formatHours(kpis.lead_time_real_horas) : '—',
      helper: kpis ? `Planejado: ${formatHours(kpis.lead_time_planejado_horas)}` : 'Planejado: —',
      trendColor:
        kpis && kpis.lead_time_real_horas > kpis.lead_time_planejado_horas ? 'text-red-600' : 'text-emerald-600'
    },
    {
      label: '% Refugo',
      value: kpis ? formatPercent(kpis.percentual_refugo) : '—',
      helper: 'Taxa média de refugo no período',
      trendColor: kpis && kpis.percentual_refugo > 3 ? 'text-red-600' : 'text-emerald-600'
    },
    {
      label: 'Aderência de ciclo',
      value: kpis ? formatPercent(kpis.aderencia_ciclo * 100, 0) : '—',
      helper: 'Lead time real ÷ padrão',
      trendColor: kpis && kpis.aderencia_ciclo <= 1 ? 'text-emerald-600' : 'text-amber-600'
    }
  ], [kpis]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-emerald-600" /> PCP - Visão integrada
          </h1>
          <p className="text-sm text-gray-500">
            Acompanhe gargalos, transferências OVERLAP e disponibilidade (ATP/CTP) em um único lugar.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            onClick={openBatchModal}
            disabled={loading || batchSequencing}
            title="Aplica APS (sequenciamento) para todos os CTs no período"
          >
            <Activity size={16} className={batchSequencing ? 'animate-spin' : ''} />
            {batchSequencing ? 'APS em lote…' : 'APS: Sequenciar todos'}
          </button>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            onClick={openReplanModal}
            disabled={loading}
            title="Sugere e aplica replanejamento (mover menor prioridade) nos CTs com sobrecarga"
          >
            <AlertTriangle size={16} />
            Replan: sobrecarga
          </button>
        </div>
      </header>

      <Modal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        title="APS • Sequenciar todos os CTs"
        size="lg"
      >
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm text-gray-700 space-y-1">
            <div>Período: <span className="font-semibold">{format(new Date(startDate), 'dd/MM')}</span> → <span className="font-semibold">{format(new Date(endDate), 'dd/MM')}</span></div>
            <div className="text-xs text-gray-500">
              Use Preview para estimar impacto. Aplicar cria runs por CT (undo disponível em cada CT via “Sequenciar”).
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runBatchSequencing(false)}
              disabled={batchSequencing}
              className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm font-semibold disabled:opacity-50"
            >
              {batchSequencing ? 'Processando…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm('Aplicar APS em lote? Isso vai atualizar datas previstas e gerar runs.')) return;
                runBatchSequencing(true);
              }}
              disabled={batchSequencing || !batchPreviewed}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 text-sm font-semibold disabled:opacity-50"
              title={!batchPreviewed ? 'Gere um preview antes de aplicar.' : ''}
            >
              {batchSequencing ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="border-b px-4 py-2 text-sm font-semibold text-gray-800 flex items-center justify-between">
              <span>Resumo por CT</span>
              {batchRows.length > 0 && (
                <span className="text-xs text-gray-500">
                  {batchRows.reduce((acc, r) => acc + (r.updated_operacoes || 0), 0)}/
                  {batchRows.reduce((acc, r) => acc + (r.total_operacoes || 0), 0)} atualizadas
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Centro</th>
                    <th className="px-3 py-2 text-right">Atualizadas</th>
                    <th className="px-3 py-2 text-right">Sem agenda</th>
                    <th className="px-3 py-2 text-right">Freeze</th>
                    <th className="px-3 py-2 text-left">Run</th>
                    <th className="px-3 py-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((r) => (
                    <tr key={r.centro_id} className="border-t">
                      <td className="px-3 py-2 text-gray-900 font-medium">{r.centro_nome}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{(r.updated_operacoes ?? 0)}/{(r.total_operacoes ?? 0)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{r.unscheduled_operacoes ?? 0}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{r.freeze_dias ?? 0}d</td>
                      <td className="px-3 py-2 text-gray-500">{r.run_id ? String(r.run_id).slice(0, 8) : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50"
                            onClick={() => openApsForCt(r.centro_id, r.centro_nome)}
                          >
                            Abrir
                          </button>
                          <button
                            type="button"
                            className="text-[11px] px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            disabled={!r.run_id || batchSequencing}
                            onClick={() => r.run_id && undoBatchRun(r.run_id)}
                            title={!r.run_id ? 'Sem run (nenhuma alteração aplicada)' : 'Desfaz o run deste CT'}
                          >
                            Undo
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {batchRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-sm text-gray-500">
                        {batchSequencing ? 'Processando…' : 'Clique em Preview para carregar o resumo.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={replanModalOpen}
        onClose={() => setReplanModalOpen(false)}
        title="PCP • Replanejamento por sobrecarga (lote)"
        size="lg"
      >
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-sm text-amber-900 space-y-1">
            <div>Período: <span className="font-semibold">{format(new Date(startDate), 'dd/MM')}</span> → <span className="font-semibold">{format(new Date(endDate), 'dd/MM')}</span></div>
            <div className="text-xs text-amber-800">
              Move operações de menor prioridade do dia de pico para dias com folga (respeita Freeze/Locked). Gera runs e permite Undo por CT.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyReplanBatch}
              disabled={replanApplying || selectedReplanCandidates.length === 0}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 text-sm font-semibold disabled:opacity-50"
            >
              {replanApplying ? 'Aplicando…' : `Aplicar selecionados (${selectedReplanCandidates.length}/${replanCandidates.length})`}
            </button>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="border-b px-4 py-2 text-sm font-semibold text-gray-800">CTs com sobrecarga (preview)</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left w-[1%]">
                      <input
                        type="checkbox"
                        checked={replanCandidates.length > 0 && replanCandidates.every((r) => replanSelected[r.centro_id] !== false)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setReplanSelected(
                            replanCandidates.reduce((acc, r) => {
                              acc[r.centro_id] = checked;
                              return acc;
                            }, {} as Record<string, boolean>)
                          );
                        }}
                        title="Selecionar todos"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Centro</th>
                    <th className="px-3 py-2 text-right">Sobrecarga</th>
                    <th className="px-3 py-2 text-left">Pico</th>
                    <th className="px-3 py-2 text-left">Sugestão</th>
                    <th className="px-3 py-2 text-left">Preview</th>
                    <th className="px-3 py-2 text-left">Resultado</th>
                    <th className="px-3 py-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {replanCandidates.map((r) => {
                    const res = replanResults[r.centro_id];
                    const prev = replanPreview[r.centro_id]?.summary;
                    const runId = res?.run_id as string | undefined;
                    const moved = Number(res?.moved ?? 0) || 0;
                    const msg = res?.message as string | undefined;
                    const freezeUntil = res?.freeze_until as string | undefined;
                    const previewLoading = replanPreviewingCtId === r.centro_id;
                    const isSelected = replanSelected[r.centro_id] !== false;
                    return (
                      <tr key={r.centro_id} className="border-t">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => setReplanSelected((prevSel) => ({ ...prevSel, [r.centro_id]: e.target.checked }))}
                            disabled={replanApplying}
                            title="Incluir este CT no lote"
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-900 font-medium">{r.centro_nome}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{(r.overload_hours || 0).toFixed(1)}h</td>
                        <td className="px-3 py-2 text-gray-700">{format(new Date(r.peak_day), 'dd/MM')}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.suggested_day ? `${format(new Date(r.suggested_day), 'dd/MM')} (${r.suggested_span_days || 1}d)` : '—'}
                          {r.message ? <div className="text-[11px] text-gray-500">{r.message}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {prev ? (
                            <div className="space-y-0.5">
                              <div>{prev.canMove}/{prev.total} movíveis</div>
                              <div className="text-[11px] text-gray-500">
                                {prev.locked > 0 ? `${prev.locked} locked` : null}
                                {prev.locked > 0 && prev.noSlot > 0 ? ' • ' : null}
                                {prev.noSlot > 0 ? `${prev.noSlot} sem slot` : null}
                                {(prev.locked > 0 || prev.noSlot > 0) && prev.zeroHours > 0 ? ' • ' : null}
                                {prev.zeroHours > 0 ? `${prev.zeroHours} 0h` : null}
                              </div>
                              {prev.freezeUntil ? <div className="text-[11px] text-gray-500">Freeze até {format(new Date(prev.freezeUntil), 'dd/MM')}</div> : null}
                            </div>
                          ) : (
                            <span className="text-gray-400">{previewLoading ? 'Carregando…' : '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {res ? (
                            <div className="space-y-0.5">
                              <div>{moved > 0 ? `${moved} movida(s)` : (msg || 'Sem mudanças')}</div>
                              {freezeUntil ? <div className="text-[11px] text-gray-500">Freeze até {format(new Date(freezeUntil), 'dd/MM')}</div> : null}
                              {runId ? <div className="text-[11px] text-gray-500">Run {runId.slice(0, 8)}</div> : null}
                            </div>
                          ) : (
                            <span className="text-gray-400">{replanApplying ? '...' : '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
                              onClick={() => previewReplanForCt(r.centro_id, r.centro_nome, r.peak_day)}
                              disabled={replanApplying || previewLoading}
                              title="Simula o que seria movido e por quê (sem aplicar)"
                            >
                              {previewLoading ? 'Preview…' : 'Preview'}
                            </button>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
                              onClick={() => openReplanPreviewDetailsForCt(r.centro_id, r.centro_nome, r.peak_day)}
                              disabled={replanApplying || previewLoading}
                              title="Ver operações do preview (motivos, old→new)"
                            >
                              Detalhes
                            </button>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50"
                              onClick={() => openGanttForCt(r.centro_id)}
                            >
                              Ver Gantt
                            </button>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                              disabled={!runId || replanApplying}
                              onClick={() => runId && undoBatchRun(runId)}
                              title={!runId ? 'Sem run (nada aplicado)' : 'Desfaz o run'}
                            >
                              Undo
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {replanCandidates.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-sm text-gray-500">
                        Nenhum CT com sobrecarga no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={replanPreviewDetails.open}
        onClose={() => setReplanPreviewDetails({ open: false })}
        title={`PCP • Preview detalhado${replanPreviewDetails.ctNome ? ` • ${replanPreviewDetails.ctNome}` : ''}`}
        size="xl"
      >
        <div className="p-6 space-y-4">
          {(() => {
            const ctId = replanPreviewDetails.ctId;
            const peakDay = replanPreviewDetails.peakDay;
            const preview = ctId ? replanPreview[ctId] : undefined;
            const rows = preview?.rows || [];
            const movableRows = rows.filter((r) => r.can_move);
            const selectedMovableCount = movableRows.filter((r) => replanPreviewSelectedOps[r.operacao_id] === true).length;
            const allMovableSelected = movableRows.length > 0 && movableRows.every((r) => replanPreviewSelectedOps[r.operacao_id] === true);
            const summary = preview?.summary;
            const filtered =
              replanPreviewReasonFilter === 'all'
                ? rows
                : rows.filter((r) => (r.reason || 'ok') === replanPreviewReasonFilter);

            const reasonLabel: Record<string, string> = {
              ok: 'OK',
              locked: 'Locked',
              no_slot: 'Sem slot',
              zero_hours: '0h',
              no_overload: 'Sem sobrecarga',
            };

            const fmtDate = (d?: string | null) => (d ? format(new Date(d), 'dd/MM') : '—');

            return (
              <>
                <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-800 space-y-1">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <div>CT: <span className="font-semibold">{replanPreviewDetails.ctNome || ctId || '—'}</span></div>
                    <div>Pico: <span className="font-semibold">{peakDay ? format(new Date(peakDay), 'dd/MM') : '—'}</span></div>
                    <div>
                      Resumo:{' '}
                      <span className="font-semibold">
                        {(summary?.canMove ?? 0)}/{(summary?.total ?? 0)} movíveis
                      </span>
                      {summary?.locked ? <span className="text-gray-600"> • {summary.locked} locked</span> : null}
                      {summary?.noSlot ? <span className="text-gray-600"> • {summary.noSlot} sem slot</span> : null}
                      {summary?.zeroHours ? <span className="text-gray-600"> • {summary.zeroHours} 0h</span> : null}
                      {summary?.freezeUntil ? <span className="text-gray-600"> • Freeze até {format(new Date(summary.freezeUntil), 'dd/MM')}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-gray-600">Filtro:</label>
                  <select
                    className="text-xs border rounded-md px-2 py-1 bg-white"
                    value={replanPreviewReasonFilter}
                    onChange={(e) => setReplanPreviewReasonFilter(e.target.value)}
                  >
                    <option value="all">Todos</option>
                    <option value="ok">OK</option>
                    <option value="locked">Locked</option>
                    <option value="no_slot">Sem slot</option>
                    <option value="zero_hours">0h</option>
                    <option value="no_overload">Sem sobrecarga</option>
                  </select>
                  <button
                    type="button"
                    className="ml-2 text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
                    disabled={!ctId || movableRows.length === 0}
                    onClick={() => {
                      setReplanPreviewSelectedOps(
                        movableRows.reduce((acc, r) => {
                          acc[r.operacao_id] = true;
                          return acc;
                        }, {} as Record<string, boolean>)
                      );
                    }}
                    title="Seleciona todas as operações movíveis"
                  >
                    Selecionar movíveis
                  </button>
                  <button
                    type="button"
                    className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
                    disabled={!ctId || movableRows.length === 0}
                    onClick={() => setReplanPreviewSelectedOps({})}
                    title="Limpa a seleção"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    className="ml-auto px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-500 text-xs font-semibold disabled:opacity-50"
                    disabled={!ctId || selectedMovableCount === 0 || replanApplying || (replanApplyingSubsetCtId === ctId)}
                    onClick={applyReplanSelectedOpsForCurrentCt}
                  >
                    {replanApplyingSubsetCtId === ctId ? 'Aplicando…' : `Aplicar selecionadas (${selectedMovableCount})`}
                  </button>
                  <div className="text-xs text-gray-500">
                    {filtered.length}/{rows.length} operações
                  </div>
                </div>

                <div className="bg-white border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left w-[1%]">
                            <input
                              type="checkbox"
                              disabled={movableRows.length === 0}
                              checked={allMovableSelected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                if (!checked) {
                                  setReplanPreviewSelectedOps({});
                                  return;
                                }
                                setReplanPreviewSelectedOps(
                                  movableRows.reduce((acc, r) => {
                                    acc[r.operacao_id] = true;
                                    return acc;
                                  }, {} as Record<string, boolean>)
                                );
                              }}
                              title="Selecionar todas as operações movíveis"
                            />
                          </th>
                          <th className="px-3 py-2 text-left">Ordem</th>
                          <th className="px-3 py-2 text-left">Produto</th>
                          <th className="px-3 py-2 text-right">Horas</th>
                          <th className="px-3 py-2 text-left">Old</th>
                          <th className="px-3 py-2 text-left">New</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => {
                          const statusText = r.can_move ? 'Movível' : (reasonLabel[r.reason] || r.reason || '—');
                          const badge =
                            r.can_move
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : r.reason === 'locked'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : r.reason === 'no_slot'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-gray-50 text-gray-700 border-gray-200';
                          return (
                            <tr key={r.operacao_id} className="border-t">
                              <td className="px-3 py-2">
                                {r.can_move ? (
                                  <input
                                    type="checkbox"
                                    checked={replanPreviewSelectedOps[r.operacao_id] === true}
                                    onChange={(e) => setReplanPreviewSelectedOps((prevSel) => ({ ...prevSel, [r.operacao_id]: e.target.checked }))}
                                    disabled={replanApplying || (replanApplyingSubsetCtId === ctId)}
                                    title="Incluir na aplicação"
                                  />
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-gray-900 font-medium">{r.ordem_numero ?? '—'}</td>
                              <td className="px-3 py-2 text-gray-700">{r.produto_nome || '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{formatHours(r.horas)}</td>
                              <td className="px-3 py-2 text-gray-700">{fmtDate(r.old_ini)} → {fmtDate(r.old_fim)}</td>
                              <td className="px-3 py-2 text-gray-700">{fmtDate(r.new_ini)} → {fmtDate(r.new_fim)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border ${badge}`}>
                                  {statusText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-sm text-gray-500">
                              {rows.length === 0 ? 'Nenhuma operação retornada no preview.' : 'Nenhuma operação neste filtro.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </Modal>

      {pcpAlerts.length > 0 && (
        <section className="bg-white border rounded-lg shadow-sm">
          <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
            <BellRing className="text-amber-500" size={18} /> Alertas operacionais
          </div>
          <div className="divide-y">
            {pcpAlerts.map(alert => {
              const color =
                alert.severity === 'critical'
                  ? 'text-red-600 bg-red-50 border-red-200'
                  : 'text-amber-600 bg-amber-50 border-amber-200';
              return (
                <div key={alert.id} className={`flex gap-3 px-4 py-3 border-l-4 ${color}`}>
                  <AlertTriangle size={18} className="mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{alert.title}</p>
                    <p className="text-sm text-gray-700">{alert.description}</p>
                    {alert.helper && <p className="text-xs text-gray-500 mt-1">{alert.helper}</p>}
                  </div>
                  {alert.action && alert.actionLabel && (
                    <button
                      onClick={alert.action}
                      className="self-center text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline-offset-2 hover:underline"
                    >
                      {alert.actionLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(card => (
          <div key={card.label} className="bg-white border rounded-lg shadow-sm p-4 relative">
            <Activity className="text-blue-400 absolute right-4 top-4" size={18} />
            <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className={`text-2xl font-semibold mt-2 ${card.trendColor}`}>{card.value}</p>
            <p className="text-xs text-gray-500 mt-2">{card.helper}</p>
          </div>
        ))}
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <PieChart className="text-rose-600" size={18} /> Pareto de refugos
        </div>
        <div className="p-4">
          {paretoAggregated.itens.length === 0 ? (
            <p className="text-sm text-gray-500">Sem refugos registrados no período.</p>
          ) : (
            <div className="space-y-3">
              {paretoAggregated.itens.slice(0, 8).map(item => (
                <div key={item.motivo_id || item.motivo_nome}>
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>{item.motivo_nome}</span>
                    <span className="font-semibold">{item.total.toFixed(1)} un ({item.percentual.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${Math.min(item.percentual, 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <LineChart className="text-indigo-600" size={18} /> Lead time real x planejado (OP)
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">OP</th>
                <th className="px-4 py-2 text-left">Produto</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Planejado (h)</th>
                <th className="px-4 py-2 text-right">Real (h)</th>
                <th className="px-4 py-2 text-right">Δ horas</th>
              </tr>
            </thead>
            <tbody>
              {leadTimes.map(item => (
                <tr key={item.ordem_id} className="border-t">
                  <td className="px-4 py-2 font-medium text-gray-900">#{item.ordem_numero}</td>
                  <td className="px-4 py-2 text-gray-700">{item.produto_nome}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.cumpriu_prazo === false
                          ? 'bg-red-100 text-red-700'
                          : item.cumpriu_prazo === true
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{item.lead_time_planejado_horas.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right">{item.lead_time_real_horas.toFixed(1)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${item.atraso_horas > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {item.atraso_horas.toFixed(1)}
                  </td>
                </tr>
              ))}
              {leadTimes.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-6">Nenhuma OP encontrada no período.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <BarChart3 className="text-emerald-600" size={18} /> Tendência semanal (h)
        </div>
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-4 min-w-full">
            {weeklySeries.serie.map(point => {
              const cargaPercent = Math.min((point.carga / weeklySeries.max) * 100, 100);
              const capacidadePercent = Math.min((point.capacidade / weeklySeries.max) * 100, 100);
              return (
                <div key={point.dia} className="flex flex-col items-center flex-1 min-w-[70px]">
                  <div className="relative h-32 w-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-emerald-400"
                      style={{ height: `${capacidadePercent}%`, opacity: 0.6 }}
                    ></div>
                    <div
                      className="absolute bottom-0 left-1 right-1 bg-indigo-600 rounded-full"
                      style={{ height: `${cargaPercent}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{point.label}</p>
                  <p className="text-[11px] text-gray-700">{point.carga.toFixed(1)}h / {point.capacidade.toFixed(1)}h</p>
                </div>
              );
            })}
            {weeklySeries.serie.length === 0 && (
              <p className="text-sm text-gray-500">Sem dados no período selecionado.</p>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <BarChart3 className="text-blue-600" size={18} /> Carga x Capacidade
        </div>
        {loading && carga.length === 0 ? (
          <div className="py-10 flex items-center justify-center text-blue-600 gap-2">
            <Loader2 className="animate-spin" /> Calculando...
          </div>
        ) : (
          <div className="p-4 grid gap-4 md:grid-cols-2">
            {capacitySummary.map(ct => {
              const ratio = ct.ratio;
              const gargaloSevero = ratio > 1;
              const isPrincipal = principalGargaloId === ct.id;
              const suggestion = capacitySuggestions.get(ct.id);
              return (
                <div key={ct.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Centro de Trabalho</p>
                      <h3 className="text-lg font-semibold text-gray-900">{ct.nome}</h3>
                    </div>
                    {(gargaloSevero || isPrincipal) && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${
                          gargaloSevero ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'
                        }`}
                      >
                        <AlertTriangle size={14} />
                        {gargaloSevero ? 'Gargalo' : 'Maior carga'}
                      </span>
                    )}
                  </div>
                  {suggestion && (
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm text-gray-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-gray-500">Simulação</span>
                          <div className="mt-1">
                            <span className="font-semibold">
                              Pico {suggestion.peakDay ? format(new Date(suggestion.peakDay), 'dd/MM') : '—'}
                            </span>
                            {suggestion.overloadHours > 0 && (
                              <span className="ml-2 text-red-700 font-semibold">+{suggestion.overloadHours.toFixed(1)}h</span>
                            )}
                            {suggestion.overloadHours <= 0 && (
                              <span className="ml-2 text-emerald-700 font-semibold">OK</span>
                            )}
                          </div>
                          {suggestion.suggestedDay && suggestion.overloadHours > 0 && (
                            <div className="text-xs text-gray-600 mt-1">
                              Melhor folga até {format(new Date(suggestion.suggestedDay), 'dd/MM')}
                              {typeof suggestion.suggestedSpanDays === 'number' ? ` (${suggestion.suggestedSpanDays} dia(s))` : ''}.
                            </div>
                          )}
                          {suggestion.message && (
                            <div className="text-xs text-gray-500 mt-1">{suggestion.message}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {suggestion.overloadHours > 0.01 && (
                            <button
                              type="button"
                              disabled={applyingCtId === ct.id}
                              onClick={() => applyReplanForCt(ct.id, suggestion.peakDay)}
                              className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline-offset-2 hover:underline disabled:opacity-50"
                            >
                              {applyingCtId === ct.id ? 'Aplicando…' : 'Aplicar'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={sequencingCtId === ct.id}
                            onClick={() => runSequencerForCt(ct.id)}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 underline-offset-2 hover:underline disabled:opacity-50"
                          >
                            {sequencingCtId === ct.id ? 'Sequenciando…' : 'Sequenciar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openGanttForCt(ct.id)}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline-offset-2 hover:underline"
                          >
                            Ver no Gantt
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-6">
                    <div>
                      <p className="text-gray-500">Capacidade total</p>
                      <p className="text-gray-900 font-semibold">{ct.totalCapacidade.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Carga total</p>
                      <p className="text-gray-900 font-semibold">{ct.totalCarga.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Utilização</p>
                      <p className={`font-semibold ${gargaloSevero ? 'text-red-600' : 'text-green-600'}`}>
                        {(ratio * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Setup</p>
                      <p className="text-gray-900 font-semibold">{ct.totalSetup.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Produção</p>
                      <p className="text-gray-900 font-semibold">{ct.totalProducao.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Em execução</p>
                      <p className="text-gray-900 font-semibold">{ct.totalExecucao.toFixed(1)} h</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ct.dias.slice(0, 7).map(dia => {
                      const dayRatio = dia.capacidade_horas > 0 ? dia.carga_total_horas / dia.capacidade_horas : 0;
                      const totalDia = dia.carga_total_horas;
                      const basePercent =
                        dia.capacidade_horas > 0 ? Math.min((totalDia / dia.capacidade_horas) * 100, 100) : 0;
                      const setupPercent =
                        totalDia > 0 ? basePercent * (dia.carga_setup_horas / Math.max(totalDia, 0.0001)) : 0;
                      const prodPercent = Math.max(basePercent - setupPercent, 0);
                      const excedentePercent =
                        dia.capacidade_horas > 0 && totalDia > dia.capacidade_horas
                          ? Math.min(((totalDia - dia.capacidade_horas) / dia.capacidade_horas) * 100, 100)
                          : 0;
                      return (
                        <div key={`${ct.id}-${dia.dia}`} className="text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">{format(new Date(dia.dia), 'dd/MM')}</span>
                            <span className={dayRatio > 1 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                              {dia.carga_total_horas.toFixed(1)} / {dia.capacidade_horas.toFixed(1)} h
                            </span>
                          </div>
                          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-amber-400"
                              style={{ width: `${setupPercent}%` }}
                            ></div>
                            <div
                              className="absolute inset-y-0 bg-blue-500"
                              style={{
                                width: `${prodPercent}%`,
                                left: `${setupPercent}%`
                              }}
                            ></div>
                            {excedentePercent > 0 && (
                              <div
                                className="absolute inset-y-0 right-0 bg-red-500/60"
                                style={{ width: `${Math.min(excedentePercent, 100)}%` }}
                              ></div>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">
                            Setup {dia.carga_setup_horas.toFixed(1)} h • Produção {dia.carga_producao_horas.toFixed(1)} h
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {capacitySummary.length === 0 && (
              <div className="col-span-full text-center text-gray-500 py-8">
                Nenhum centro de trabalho com carga planejada neste período.
              </div>
            )}
          </div>
        )}
      </section>

      <section ref={ganttSectionRef} className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex flex-col gap-2 text-gray-700 font-semibold md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="text-purple-600" size={18} /> Gantt simplificado
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <div className="flex items-center gap-1">
              <Filter size={14} />
              <select
                value={ganttCtFilter}
                onChange={(e) => setGanttCtFilter(e.target.value)}
                className="border rounded-md px-2 py-1 text-xs"
              >
                <option value="all">Todos os CTs</option>
                {ganttCtOptions.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <select
              value={ganttStatusFilter}
              onChange={(e) => setGanttStatusFilter(e.target.value)}
              className="border rounded-md px-2 py-1 text-xs"
            >
              <option value="all">Todos os status</option>
              {ganttStatusOptions.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              value={ganttApsFilter}
              onChange={(e) => setGanttApsFilter(e.target.value)}
              className="border rounded-md px-2 py-1 text-xs"
              title="Filtro APS (o que o sequenciador ignora)"
            >
              <option value="all">APS: todos</option>
              <option value="eligible">APS: elegíveis</option>
              <option value="blocked">APS: bloqueados</option>
              <option value="freeze">APS: freeze</option>
              <option value="locked">APS: locked</option>
            </select>
          </div>
        </div>
        {loading && gantt.length === 0 ? (
          <div className="py-10 flex items-center justify-center text-blue-600 gap-2">
            <Loader2 className="animate-spin" /> Carregando ordens...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">OP</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-left">CT / Seq</th>
                  <th className="px-4 py-2 text-left">APS</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left w-2/5">Linha do tempo</th>
                </tr>
              </thead>
              <tbody>
                {ganttRows.map(item => (
                  <tr key={item.operacao_id} className="border-t">
                    <td className="px-4 py-2 font-medium text-gray-800">OP #{item.ordem_numero}</td>
                    <td className="px-4 py-2 text-gray-700">{item.produto_nome}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {item.centro_trabalho_nome || '—'}
                      <span className="ml-1 text-xs text-gray-500">seq {item.operacao_sequencia}</span>
                      {item.permite_overlap && (
                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">Overlap</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {item.aps_locked ? (
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700"
                          title={item.aps_lock_reason || 'Operação bloqueada manualmente para APS'}
                        >
                          Locked
                        </span>
                      ) : item.aps_in_freeze ? (
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800"
                          title="Dentro do horizonte congelado (freeze) do CT"
                        >
                          Freeze
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700" title="Elegível para APS">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.status_operacao === 'concluida'
                          ? 'bg-green-100 text-green-700'
                          : item.status_operacao === 'em_execucao'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                        {item.status_operacao}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500 flex justify-between mb-1">
                        <span>{format(new Date(item.data_inicio), 'dd/MM')}</span>
                        <span>{format(new Date(item.data_fim), 'dd/MM')}</span>
                      </div>
                      <div className="relative bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="absolute inset-y-0 rounded-full overflow-hidden"
                          style={{
                            left: `${Math.max(item.offsetPercent, 0)}%`,
                            width: `${Math.min(item.durationPercent, 100)}%`
                          }}
                        >
                          <div className="h-full w-full bg-gradient-to-r from-purple-500 to-purple-700 relative">
                            {item.permite_overlap && (
                              <div className="absolute inset-0 border-2 border-dashed border-white/50 rounded-full pointer-events-none"></div>
                            )}
                            {item.transfer_ratio > 0 && (
                              <div
                                className="absolute top-0 left-0 h-full bg-white/40"
                                style={{ width: `${item.transferPercent}%` }}
                              ></div>
                            )}
                          </div>
                        </div>
                      </div>
                      {(item.quantidade_transferida > 0 || item.permite_overlap) && (
                        <p className="text-[11px] text-gray-500 mt-1 flex justify-between">
                          {item.permite_overlap && <span>OVERLAP ativo</span>}
                          {item.quantidade_transferida > 0 && (
                            <span>
                              Transferido: {item.quantidade_transferida} ({Math.round(item.transfer_ratio * 100)}%)
                            </span>
                          )}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
                {ganttRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-6">Nenhuma OP encontrada no período selecionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={apsModal.open}
        onClose={() => setApsModal({ open: false })}
        title={`APS • Sequenciamento ${apsModal.ctNome ? `— ${apsModal.ctNome}` : ''}`}
        size="lg"
      >
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm text-gray-700 space-y-1">
            <div>Período: <span className="font-semibold">{format(new Date(startDate), 'dd/MM')}</span> → <span className="font-semibold">{format(new Date(endDate), 'dd/MM')}</span></div>
            <div className="text-xs text-gray-600">
              Freeze: <span className="font-semibold">{apsConfigLoading ? '…' : `${apsFreezeDias} dia(s)`}</span> (APS não altera operações dentro do horizonte)
            </div>
            <div className="text-xs text-gray-500">
              Preview não altera nada. Aplicar cria um log e permite desfazer (undo) se as datas ainda não foram alteradas manualmente depois.
            </div>
          </div>

          {apsPreview && (
            <div className="bg-white border rounded-lg p-4 text-sm">
              <div className="font-semibold text-gray-900">Preview</div>
              <div className="text-gray-700 mt-1">
                Atualizaria {apsPreview.updated_operacoes}/{apsPreview.total_operacoes} operações.
                {apsPreview.unscheduled_operacoes > 0 ? ` ${apsPreview.unscheduled_operacoes} ficariam sem agenda.` : ''}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={apsLoading || sequencingCtId !== null}
              className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm font-semibold disabled:opacity-50"
            >
              {apsLoading ? 'Processando…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={handleApplySequencing}
              disabled={apsLoading || sequencingCtId !== null || !apsModal.ctId}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 text-sm font-semibold disabled:opacity-50"
            >
              {sequencingCtId ? 'Sequenciando…' : 'Aplicar'}
            </button>
            <button
              type="button"
              onClick={handleUndoLast}
              disabled={apsLoading || apsRuns.length === 0}
              className="px-4 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm font-semibold disabled:opacity-50"
              title="Desfaz o último run registrado (se possível)"
            >
              Desfazer último
            </button>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="border-b px-4 py-2 text-sm font-semibold text-gray-800 flex items-center justify-between gap-2">
              <span>Sequência manual (drag-and-drop)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-gray-700 hover:underline disabled:opacity-50"
                  disabled={manualSeqSaving || apsLoading}
                  onClick={() => {
                    setManualSeqDirty(false);
                    if (apsModal.ctId) {
                      const rows = (gantt || [])
                        .filter((r) => r.centro_trabalho_id === apsModal.ctId)
                        .filter((r) => !['em_execucao', 'concluida', 'cancelada'].includes(String(r.status_operacao || '').toLowerCase()))
                        .sort((a, b) => (a.operacao_sequencia ?? 0) - (b.operacao_sequencia ?? 0));
                      setManualSeqRows(rows);
                    }
                  }}
                >
                  Resetar
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-700 hover:underline disabled:opacity-50"
                  disabled={!manualSeqDirty || manualSeqSaving || apsLoading}
                  onClick={handleSaveManualSeq}
                >
                  {manualSeqSaving ? 'Salvando…' : 'Salvar ordem'}
                </button>
              </div>
            </div>
            <div className="p-3">
              {manualSeqRows.length === 0 ? (
                <div className="text-sm text-gray-500">Nenhuma operação elegível encontrada para este CT no período.</div>
              ) : (
                <DragDropContext onDragEnd={handleDragManualSeq}>
                  <Droppable droppableId="pcp-aps-manual-seq">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                        {manualSeqRows.slice(0, 80).map((r, index) => (
                          <Draggable key={r.operacao_id} draggableId={r.operacao_id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                                  snapshot.isDragging ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white'
                                }`}
                              >
                                <div {...provided.dragHandleProps} className="text-gray-400 cursor-grab">
                                  <GripVertical size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">#{r.ordem_numero}</span>
                                    <span className="text-gray-700 truncate">{r.produto_nome}</span>
                                    <span className="text-[11px] text-gray-500">seq {r.operacao_sequencia}</span>
                                  </div>
                                  <div className="text-[11px] text-gray-500">
                                    {r.data_inicio ? format(new Date(r.data_inicio), 'dd/MM') : '—'} → {r.data_fim ? format(new Date(r.data_fim), 'dd/MM') : '—'} • {r.status_operacao}
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {manualSeqRows.length > 80 && (
                          <div className="text-xs text-gray-500 pt-2">Mostrando 80 de {manualSeqRows.length} operações.</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>
          </div>

          {apsPreviewRows.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="border-b px-4 py-2 text-sm font-semibold text-gray-800">Preview (mudanças)</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">OP</th>
                      <th className="px-3 py-2 text-left">Produto</th>
                      <th className="px-3 py-2 text-left">Antes</th>
                      <th className="px-3 py-2 text-left">Depois</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">APS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apsPreviewRows.slice(0, 120).map((r) => (
                      <tr key={r.operacao_id} className="border-t">
                        <td className="px-3 py-2 font-medium text-gray-900">#{r.ordem_numero}</td>
                        <td className="px-3 py-2 text-gray-700">{r.produto_nome}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.old_ini ? format(new Date(r.old_ini), 'dd/MM') : '—'}{r.old_fim && r.old_fim !== r.old_ini ? ` → ${format(new Date(r.old_fim), 'dd/MM')}` : ''}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.new_ini ? format(new Date(r.new_ini), 'dd/MM') : '—'}{r.new_fim && r.new_fim !== r.new_ini ? ` → ${format(new Date(r.new_fim), 'dd/MM')}` : ''}
                        </td>
                        <td className="px-3 py-2">
                          {r.skip_reason ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800">
                              Ignorado ({r.skip_reason})
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.scheduled ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {r.scheduled ? 'OK' : 'Sem agenda'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.aps_locked ? 'bg-slate-100 text-slate-700' : 'bg-gray-50 text-gray-700'}`}>
                              {r.aps_locked ? 'Locked' : 'Livre'}
                            </span>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
                              disabled={apsLoading}
                              onClick={() => handleToggleLockOperacao(r.operacao_id, !!r.aps_locked, r.aps_lock_reason)}
                              title={r.aps_lock_reason || ''}
                            >
                              {r.aps_locked ? 'Desbloquear' : 'Bloquear'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {apsPreviewRows.length > 120 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-gray-500">Mostrando 120 de {apsPreviewRows.length} linhas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="border-b px-4 py-2 text-sm font-semibold text-gray-800">Últimos runs</div>
            <div className="divide-y">
              {apsRuns.map((r) => (
                <div key={r.id} className="px-4 py-2 text-sm text-gray-700 flex justify-between gap-3">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {r.kind}
                      <button
                        type="button"
                        className="text-xs font-semibold text-indigo-700 hover:underline"
                        onClick={() => setApsSelectedRunId(r.id)}
                      >
                        Detalhes
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-700 hover:underline"
                        onClick={() => pcpApsUndo(r.id).then((res) => {
                          addToast(`Undo concluído: ${res.restored} revertidas, ${res.skipped} ignoradas.`, res.skipped > 0 ? 'warning' : 'success');
                          loadData();
                          if (apsModal.ctId) loadApsRuns(apsModal.ctId);
                        }).catch((e: any) => addToast(e?.message || 'Falha ao desfazer.', 'error'))}
                      >
                        Desfazer
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-xs text-gray-600 text-right">
                    {r.kind === 'manual_resequence'
                      ? `${r.summary?.updated ?? 0}/${r.summary?.total ?? 0} reordenadas`
                      : `${r.summary?.updated_operacoes ?? 0}/${r.summary?.total_operacoes ?? 0} atualizadas`}
                    {r.kind !== 'manual_resequence' && r.summary?.unscheduled_operacoes ? ` • ${r.summary.unscheduled_operacoes} sem agenda` : ''}
                  </div>
                </div>
              ))}
              {apsRuns.length === 0 && (
                <div className="px-4 py-6 text-sm text-gray-500">Nenhum run registrado para este centro.</div>
              )}
            </div>
          </div>

          {apsSelectedRunId && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="border-b px-4 py-2 text-sm font-semibold text-gray-800">
                Detalhes do run {apsSelectedRunId.slice(0, 8)}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">OP</th>
                      <th className="px-3 py-2 text-left">Produto</th>
                      <th className="px-3 py-2 text-left">Seq</th>
                      <th className="px-3 py-2 text-left">Antes</th>
                      <th className="px-3 py-2 text-left">Depois</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">APS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apsRunChanges.map((r) => (
                      <tr key={r.operacao_id} className="border-t">
                        <td className="px-3 py-2 font-medium text-gray-900">#{r.ordem_numero}</td>
                        <td className="px-3 py-2 text-gray-700">{r.produto_nome}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {typeof r.old_seq === 'number' || typeof r.new_seq === 'number'
                            ? `${r.old_seq ?? '—'} → ${r.new_seq ?? '—'}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.old_ini ? format(new Date(r.old_ini), 'dd/MM') : '—'}{r.old_fim && r.old_fim !== r.old_ini ? ` → ${format(new Date(r.old_fim), 'dd/MM')}` : ''}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.new_ini ? format(new Date(r.new_ini), 'dd/MM') : '—'}{r.new_fim && r.new_fim !== r.new_ini ? ` → ${format(new Date(r.new_fim), 'dd/MM')}` : ''}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.status_operacao}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.aps_locked ? 'bg-slate-100 text-slate-700' : 'bg-gray-50 text-gray-700'}`}>
                              {r.aps_locked ? 'Locked' : 'Livre'}
                            </span>
                            <button
                              type="button"
                              className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
                              disabled={apsLoading}
                              onClick={() => handleToggleLockOperacao(r.operacao_id, !!r.aps_locked, r.aps_lock_reason)}
                              title={r.aps_lock_reason || ''}
                            >
                              {r.aps_locked ? 'Desbloquear' : 'Bloquear'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {apsRunChanges.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-gray-500">
                          {apsLoading ? 'Carregando...' : 'Sem mudanças registradas.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex items-center gap-2 text-gray-700 font-semibold">
          <PackageSearch className="text-emerald-600" size={18} /> ATP / CTP por produto
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">Produto</th>
                <th className="px-4 py-2 text-right">Estoque</th>
                <th className="px-4 py-2 text-right">Em produção</th>
                <th className="px-4 py-2 text-right">Demanda</th>
                <th className="px-4 py-2 text-right">ATP</th>
                <th className="px-4 py-2 text-right">Carga pendente (h)</th>
                <th className="px-4 py-2 text-left">Data CTP</th>
              </tr>
            </thead>
            <tbody>
              {atpCtp.map(item => {
                const falta = item.disponibilidade_atp < 0;
                return (
                  <tr key={item.produto_id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedProdutoId(item.produto_id)}>
                    <td className="px-4 py-2 text-gray-900 font-medium">{item.produto_nome}</td>
                    <td className="px-4 py-2 text-right">{item.estoque_atual.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right">{item.em_producao.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right">{item.demanda_confirmada.toLocaleString('pt-BR')}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${falta ? 'text-red-600' : 'text-emerald-600'}`}>
                      {item.disponibilidade_atp.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2 text-right">{item.carga_horas_pendente.toFixed(1)}</td>
                    <td className="px-4 py-2 text-left">
                      {item.data_ctp ? format(new Date(item.data_ctp), 'dd/MM') : '—'}
                    </td>
                  </tr>
                );
              })}
              {atpCtp.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-500 py-6">
                    Sem itens com cálculo ATP/CTP para o período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm">
        <div className="border-b px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between text-gray-700 font-semibold">
          <div className="flex items-center gap-2">
            <LineChart className="text-sky-600" size={18} /> Estoque projetado
          </div>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedProdutoId || ''}
            onChange={(e) => setSelectedProdutoId(e.target.value || null)}
            disabled={atpCtp.length === 0}
          >
            <option value="">Selecione um produto</option>
            {atpCtp.map(item => (
              <option key={item.produto_id} value={item.produto_id}>
                {item.produto_nome}
              </option>
            ))}
          </select>
        </div>
        <div className="p-4 flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            {!selectedProdutoId ? (
              <p className="text-sm text-gray-500">Escolha um produto para visualizar a curva projetada.</p>
            ) : estoqueLoading ? (
              <div className="h-48 flex items-center justify-center text-blue-600 gap-2">
                <Loader2 className="animate-spin" /> Gerando curva...
              </div>
            ) : estoqueProjetado.length === 0 ? (
              <p className="text-sm text-gray-500">Sem dados de estoque projetado.</p>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-48">
                    {estoqueGraph.points && (
                      <polyline
                        points={estoqueGraph.points}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>Min: {estoqueGraph.min.toFixed(0)}</span>
                    <span>Max: {estoqueGraph.max.toFixed(0)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {estoqueProjetado.slice(0, 7).map(ponto => (
                    <div key={ponto.dia} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{format(new Date(ponto.dia), 'dd/MM')}</span>
                      <span className={ponto.saldo_projetado < 0 ? 'text-red-600 font-semibold' : 'text-gray-800'}>
                        {ponto.saldo_projetado.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="w-full lg:w-72 bg-gray-50 rounded-lg p-4 space-y-4">
            {selectedProdutoInfo ? (
              <>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Produto</p>
                  <p className="text-sm font-semibold text-gray-900">{selectedProdutoInfo.produto_nome}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Estoque atual</p>
                    <p className="font-semibold text-gray-900">{selectedProdutoInfo.estoque_atual.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">ATP</p>
                    <p
                      className={`font-semibold ${
                        selectedProdutoInfo.disponibilidade_atp < 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {selectedProdutoInfo.disponibilidade_atp.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  {rupturas.length > 0 ? (
                    <p className="text-red-600 font-semibold">
                      Ruptura prevista em {format(new Date(rupturas[0].dia), 'dd/MM')} ({rupturas[0].saldo_projetado.toFixed(0)})
                    </p>
                  ) : (
                    <p>Nenhuma ruptura prevista nos próximos dias.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Clique em um item do ATP para ver detalhes.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

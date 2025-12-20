import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listMinhaFila, OperacaoFila, apontarExecucao, getChaoDeFabricaOverview, CentroStatusSnapshot } from '@/services/industriaExecucao';
import { listCentrosTrabalho, CentroTrabalho } from '@/services/industriaCentros';
import { replanejarOperacao } from '@/services/industria';
import { Loader2, Play, Pause, CheckCircle, AlertTriangle, User, Monitor, RefreshCw, Activity, Package } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { formatOrderNumber } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AndonGrid from '@/components/industria/chao/AndonGrid';
import { useChaoDeFabricaRealtime } from '@/hooks/useChaoDeFabricaRealtime';
import { useMemo } from 'react';
import { createOperacaoDocSignedUrl, listOperacaoDocs, OperacaoDoc } from '@/services/industriaOperacaoDocs';
import { logger } from '@/lib/logger';

export default function ChaoDeFabricaPage() {
  const { addToast } = useToast();
  const [mode, setMode] = useState<'overview' | 'fila' | 'andon'>('overview');
  const [tvMode, setTvMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [overview, setOverview] = useState<CentroStatusSnapshot[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [lastRealtimePulse, setLastRealtimePulse] = useState<Date | null>(null);
  const lastAlertRef = useRef<Map<string, number>>(new Map());
  const skipNextPulseForReplan = useRef(false);

  const [centros, setCentros] = useState<CentroTrabalho[]>([]);
  const [selectedCentroId, setSelectedCentroId] = useState<string>('');
  const [fila, setFila] = useState<OperacaoFila[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOp, setSelectedOp] = useState<OperacaoFila | null>(null);

  // Modal de Apontamento
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'pausar' | 'concluir' | null>(null);
  const [qtdBoas, setQtdBoas] = useState<number>(0);
  const [qtdRefugadas, setQtdRefugadas] = useState<number>(0);
  const [motivoRefugo, setMotivoRefugo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [replanCentroId, setReplanCentroId] = useState<string>('');
  const [replanLoading, setReplanLoading] = useState(false);
  const [replanDirty, setReplanDirty] = useState(false);
  const [docs, setDocs] = useState<OperacaoDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const ALERT_COOLDOWN_MS = 3 * 60 * 1000;

  const kpis = useMemo(() => {
    if (!overview.length) {
      return {
        emExecucao: 0,
        fila: 0,
        bloqueadas: 0,
        concluidasHoje: 0,
        utilizacaoMedia: 0,
        atrasadas: 0,
      };
    }
    const emExecucao = overview.reduce((sum, c) => sum + c.emExecucao.length, 0);
    const fila = overview.reduce((sum, c) => sum + c.fila.length, 0);
    const bloqueadas = overview.reduce((sum, c) => sum + c.bloqueadas.length, 0);
    const concluidasHoje = overview.reduce((sum, c) => sum + (c.concluidasHoje || 0), 0);
    const atrasadas = overview.reduce((sum, c) => sum + (c.atrasadas || 0), 0);
    const utilizacaoMedia = Math.round(
      overview.reduce((sum, c) => sum + (c.utilizacao || 0), 0) / Math.max(overview.length, 1)
    );
    return { emExecucao, fila, bloqueadas, concluidasHoje, utilizacaoMedia, atrasadas };
  }, [overview]);

  const processAlerts = useCallback((data: CentroStatusSnapshot[]) => {
    const now = Date.now();
    data.forEach((snap) => {
      const hasRisk = snap.bloqueadas.length > 0 || snap.atrasadas > 0 || (snap.paradas || 0) > 0;
      if (!hasRisk) return;
      const last = lastAlertRef.current.get(snap.centro.id) || 0;
      if (now - last < ALERT_COOLDOWN_MS) return;

      const motivos: string[] = [];
      if (snap.bloqueadas.length > 0) motivos.push(`${snap.bloqueadas.length} bloqueada(s)`);
      if (snap.atrasadas > 0) motivos.push(`${snap.atrasadas} atrasada(s)`);
      if ((snap.paradas || 0) > 0) motivos.push(`${snap.paradas} parada(s)`);

      addToast(`Alerta em ${snap.centro.nome}: ${motivos.join(' • ')}`, 'warning');
      lastAlertRef.current.set(snap.centro.id, now);
    });
  }, [addToast]);

  const fetchOverview = useCallback(async (withLoader = true) => {
    if (withLoader) setOverviewLoading(true);
    try {
      const data = await getChaoDeFabricaOverview();
      setOverview(data);
      processAlerts(data);
    } catch (e: any) {
      addToast(e.message || 'Erro ao carregar o painel.', 'error');
    } finally {
      if (withLoader) setOverviewLoading(false);
    }
  }, [addToast, processAlerts]);

  useEffect(() => {
    listCentrosTrabalho(undefined, true)
      .then(data => {
          setCentros(data);
          if (data.length > 0) setSelectedCentroId(data[0].id);
      })
      .catch((e: any) => {
        logger.error('[Indústria][Chão] Falha ao carregar centros de trabalho', e);
        addToast(e?.message || 'Erro ao carregar centros de trabalho.', 'error');
      });

    fetchOverview();
  }, [fetchOverview]);

  const isFetchingFila = useRef(false);
  const selectedOpRef = useRef<OperacaoFila | null>(null);
  useEffect(() => {
    selectedOpRef.current = selectedOp;
  }, [selectedOp]);

  const fetchFila = useCallback(async (withLoader = true) => {
    if (!selectedCentroId) return;
    if (isFetchingFila.current) return;
    isFetchingFila.current = true;
    if (withLoader) setLoading(true);
    try {
      const data = await listMinhaFila(selectedCentroId);
      setFila(data);
      const currentSelectedId = selectedOpRef.current?.id || null;
      if (currentSelectedId) {
        const updated = data.find(op => op.id === currentSelectedId);
        if (updated) {
          setSelectedOp(updated);
        } else {
          setSelectedOp(data[0] || null);
        }
      } else {
        setSelectedOp(data[0] || null);
      }
    } catch (e) {
      logger.error('[Indústria][Chão] Falha ao carregar fila do centro', e, { selectedCentroId });
      addToast((e as any)?.message || 'Falha ao carregar fila do centro.', 'error');
    } finally {
      isFetchingFila.current = false;
      if (withLoader) setLoading(false);
    }
  }, [selectedCentroId]);

  useEffect(() => {
    setSelectedOp(null);
    setReplanCentroId('');
    setReplanDirty(false);
    fetchFila();
  }, [selectedCentroId, fetchFila]);

  useEffect(() => {
    // Ao trocar a operação selecionada, reinicia o replanejamento para o centro atual
    setReplanCentroId(selectedOp?.centro_trabalho_id || '');
    setReplanDirty(false);
  }, [selectedOp?.id]);

  useEffect(() => {
    if (!selectedOp?.id) {
      setDocs([]);
      return;
    }
    (async () => {
      setDocsLoading(true);
      try {
        const latest = await listOperacaoDocs(selectedOp.id, true);
        setDocs(latest);
      } catch {
        setDocs([]);
      } finally {
        setDocsLoading(false);
      }
    })();
  }, [selectedOp?.id]);

  useEffect(() => {
    if (mode === 'overview' || mode === 'andon') {
      fetchOverview(false);
    } else {
      fetchFila(false);
    }
  }, [mode, fetchOverview, fetchFila]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchOverview(false);
      fetchFila(false);
    }, 15000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchOverview, fetchFila]);

  const handleRealtimePulse = useCallback(() => {
    if (skipNextPulseForReplan.current) {
      skipNextPulseForReplan.current = false;
      return;
    }
    fetchOverview(false);
    fetchFila(false);
    setLastRealtimePulse(new Date());
  }, [fetchOverview, fetchFila]);

  const realtimeConnected = useChaoDeFabricaRealtime(handleRealtimePulse);

  const handleGlobalRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchOverview(false),
      fetchFila(false),
    ]);
    setIsRefreshing(false);
  };

  const handleStart = async () => {
    if (!selectedOp) return;
    try {
        await apontarExecucao(selectedOp.id, 'iniciar');
        addToast('Operação iniciada.', 'success');
        fetchFila();
    } catch (e: any) {
        addToast(e.message, 'error');
    }
  };

  const openModal = (action: 'pausar' | 'concluir') => {
    setModalAction(action);
    setQtdBoas(0);
    setQtdRefugadas(0);
    setMotivoRefugo('');
    setObservacoes('');
    setIsModalOpen(true);
  };

  const handleConfirmApontamento = async () => {
    if (!selectedOp || !modalAction) return;
    setIsSaving(true);
    try {
        await apontarExecucao(selectedOp.id, modalAction, qtdBoas, qtdRefugadas, motivoRefugo, observacoes);
        addToast(`Operação ${modalAction === 'pausar' ? 'pausada' : 'concluída'}.`, 'success');
        setIsModalOpen(false);
        fetchFila();
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setIsSaving(false);
    }
  };

  const handleReplan = async () => {
    if (!selectedOp || !replanCentroId || selectedOp.centro_trabalho_id === replanCentroId) return;
    setReplanLoading(true);
    try {
      await replanejarOperacao(selectedOp.id, replanCentroId);
      addToast('Operação movida para o novo centro.', 'success');
      skipNextPulseForReplan.current = true; // evita sobrescrever seleção logo após replanejar
      setReplanDirty(false);
      // Muda a visão para o centro de destino para o usuário "seguir" a operação
      setSelectedCentroId(replanCentroId);
      fetchOverview(false);
    } catch (e: any) {
      addToast(e.message || 'Falha ao replanejar.', 'error');
    } finally {
      setReplanLoading(false);
    }
  };

  const containerClass = tvMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900';

  return (
    <div className={`p-4 h-full flex flex-col transition-colors duration-300 ${containerClass}`}>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Chão de Fábrica</h1>
          <p className={`text-sm ${tvMode ? 'text-gray-300' : 'text-gray-600'}`}>Visão em tempo real e fila do operador</p>
          <div className={`mt-2 flex items-center gap-2 text-xs ${tvMode ? 'text-gray-300' : 'text-gray-500'}`}>
            <span className={`h-2 w-2 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            <span>{realtimeConnected ? 'Streaming em tempo real ativo' : 'Aguardando conexão em tempo real'}</span>
            {lastRealtimePulse && (
              <span className="text-[11px]">
                • Último evento {formatDistanceToNow(lastRealtimePulse, { addSuffix: true, locale: ptBR })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={handleGlobalRefresh}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${tvMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            Atualizar agora
          </button>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="form-checkbox rounded text-blue-600"
            />
            Auto refresh
          </label>
          <button
            onClick={() => setTvMode(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${tvMode ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
          >
            <Monitor size={18} />
            {tvMode ? 'Modo padrão' : 'Modo TV'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <GlassCard className="p-3 flex flex-col gap-1">
          <span className="text-xs text-gray-500">Em execução</span>
          <span className="text-2xl font-bold">{kpis.emExecucao}</span>
        </GlassCard>
        <GlassCard className="p-3 flex flex-col gap-1">
          <span className="text-xs text-gray-500">Em fila</span>
          <span className="text-2xl font-bold">{kpis.fila}</span>
        </GlassCard>
        <GlassCard className="p-3 flex flex-col gap-1">
          <span className="text-xs text-gray-500">Bloqueadas</span>
          <span className={`text-2xl font-bold ${kpis.bloqueadas > 0 ? 'text-amber-600' : ''}`}>{kpis.bloqueadas}</span>
        </GlassCard>
        <GlassCard className="p-3 flex flex-col gap-1">
          <span className="text-xs text-gray-500">Paradas</span>
          <span className={`text-2xl font-bold ${overview.reduce((s,c)=>s+(c.paradas||0),0) > 0 ? 'text-amber-600' : ''}`}>
            {overview.reduce((s,c)=>s+(c.paradas||0),0)}
          </span>
        </GlassCard>
        <GlassCard className="p-3 flex flex-col gap-1">
          <span className="text-xs text-gray-500">Atrasadas</span>
          <span className={`text-2xl font-bold ${kpis.atrasadas > 0 ? 'text-rose-600' : ''}`}>{kpis.atrasadas}</span>
        </GlassCard>
        <GlassCard className="p-3 flex flex-col gap-1">
          <span className="text-xs text-gray-500">Concluídas hoje</span>
          <span className="text-2xl font-bold">{kpis.concluidasHoje}</span>
        </GlassCard>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setMode('overview')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            mode === 'overview'
              ? 'bg-blue-600 text-white shadow-lg'
              : tvMode
                ? 'bg-gray-800 text-gray-300'
                : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Painel em Tempo Real
        </button>
        <button
          onClick={() => setMode('andon')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            mode === 'andon'
              ? 'bg-indigo-600 text-white shadow-lg'
              : tvMode
                ? 'bg-gray-800 text-gray-300'
                : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Painel Andon
        </button>
        <button
          onClick={() => setMode('fila')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            mode === 'fila'
              ? 'bg-blue-600 text-white shadow-lg'
              : tvMode
                ? 'bg-gray-800 text-gray-300'
                : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          Fila do Operador
        </button>
      </div>

      {mode === 'overview' || mode === 'andon' ? (
        overviewLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          </div>
        ) : mode === 'overview' ? (
          <FactoryOverviewGrid data={overview} loading={false} tvMode={tvMode} />
        ) : (
          <AndonGrid
            data={overview}
            tvMode={tvMode}
            connected={realtimeConnected}
            lastPulse={lastRealtimePulse}
          />
        )
      ) : (
        <>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <select 
              value={selectedCentroId} 
              onChange={e => setSelectedCentroId(e.target.value)}
              className={`p-2 rounded-lg min-w-[250px] border ${tvMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 shadow-sm'}`}
            >
                <option value="">Selecione o Centro de Trabalho</option>
                {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => fetchFila()}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${tvMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              >
                <RefreshCw size={16} />
                Atualizar fila
              </button>
            </div>
          </div>

          {!selectedCentroId ? (
            <div className="flex-grow flex items-center justify-center text-gray-500">
              Selecione um centro de trabalho para visualizar a fila.
            </div>
          ) : (
            <div className="flex-grow flex gap-6 overflow-hidden">
              {/* Lista da Fila (Esquerda) */}
              <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-styled">
                  {loading && fila.length === 0 ? (
                      <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-blue-500" /></div>
                  ) : fila.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">Fila vazia.</div>
                  ) : (
                      fila.map(op => (
                          <div 
                              key={op.id}
                              onClick={() => setSelectedOp(op)}
                              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                  selectedOp?.id === op.id 
                                      ? 'bg-blue-50 border-blue-500 shadow-md' 
                                      : 'bg-white border-gray-200 hover:border-blue-300'
                              }`}
                          >
                              <div className="flex justify-between items-start mb-2">
                                  <span className="font-bold text-gray-800">{formatOrderNumber(op.ordem_numero)}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${
                                      op.status === 'em_execucao' ? 'bg-green-100 text-green-800' : 
                                      op.status === 'em_espera' ? 'bg-orange-100 text-orange-800' : 
                                      'bg-gray-100 text-gray-600'
                                  }`}>
                                      {op.status.replace(/_/g, ' ')}
                                  </span>
                              </div>
                              <p className="text-sm font-medium text-gray-700 line-clamp-2 mb-2">{op.produto_nome}</p>
                              <div className="flex justify-between text-xs text-gray-500">
                                  <span>Plan: {op.quantidade_planejada}</span>
                                  <span>Prod: {op.quantidade_produzida}</span>
                              </div>
                              {op.atrasada && (
                                  <div className="mt-2 flex items-center gap-1 text-xs text-red-600 font-bold">
                                      <AlertTriangle size={12} /> Atrasada
                                  </div>
                              )}
                          </div>
                      ))
                  )}
              </div>

              {/* Detalhe da Operação (Direita) */}
              <div className="w-2/3">
                  {selectedOp ? (
                      <GlassCard className="h-full flex flex-col p-8 gap-6">
                          <div className="border-b border-gray-200 pb-4 mb-6">
                              <div className="flex justify-between items-start gap-4 flex-wrap">
                                  <div>
                                      <h2 className="text-2xl font-bold text-gray-800 mb-1">Ordem {formatOrderNumber(selectedOp.ordem_numero)}</h2>
                                      <p className="text-lg text-gray-600">{selectedOp.produto_nome}</p>
                                      <p className="text-xs text-gray-500">
                                        Centro atual: {centros.find(c => c.id === selectedOp.centro_trabalho_id)?.nome || '—'}
                                      </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                      <div className="text-right">
                                          <p className="text-sm text-gray-500">Prioridade</p>
                                          <p className="text-xl font-bold text-blue-600">{selectedOp.prioridade}</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                          <select
                                              value={replanCentroId}
                                              onChange={(e) => {
                                                setReplanCentroId(e.target.value);
                                                setReplanDirty(true);
                                              }}
                                              className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                          >
                                              <option value={selectedOp.centro_trabalho_id}>Manter centro</option>
                                              {centros
                                                .filter(c => c.id !== selectedOp.centro_trabalho_id)
                                                .map(c => (
                                                  <option key={c.id} value={c.id}>{c.nome}</option>
                                                ))}
                                          </select>
                                          <button
                                              onClick={handleReplan}
                                              disabled={replanLoading || !replanCentroId || replanCentroId === selectedOp.centro_trabalho_id}
                                              className="px-3 py-2 rounded-lg border border-blue-400 text-blue-600 hover:bg-blue-50 disabled:opacity-50 text-sm font-semibold"
                                          >
                                              {replanLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mover'}
                                          </button>
                                      </div>
                                  </div>
                              </div>
                              {selectedOp.cliente_nome && (
                                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                                      <User size={16} /> {selectedOp.cliente_nome}
                                  </div>
                              )}
                          </div>

                          <div className="grid grid-cols-3 gap-4">
                              <div className="bg-gray-50 p-5 rounded-2xl text-center border border-gray-200">
                                  <p className="text-xs text-gray-500 uppercase font-bold">Planejado</p>
                                  <p className="text-2xl font-bold text-gray-800">{selectedOp.quantidade_planejada}</p>
                              </div>
                              <div className="bg-green-50 p-5 rounded-2xl text-center border border-green-200">
                                  <p className="text-xs text-green-600 uppercase font-bold">Produzido</p>
                                  <p className="text-2xl font-bold text-green-700">{selectedOp.quantidade_produzida}</p>
                              </div>
                              <div className="bg-red-50 p-5 rounded-2xl text-center border border-red-200">
                                  <p className="text-xs text-red-600 uppercase font-bold">Refugo</p>
                                  <p className="text-2xl font-bold text-red-700">{selectedOp.quantidade_refugada}</p>
                              </div>
                          </div>

                          <div className="flex-grow bg-yellow-50 rounded-2xl p-5 border border-yellow-100 space-y-3">
                              <h4 className="font-bold text-yellow-800 flex items-center gap-2">
                                  <AlertTriangle size={18} /> Instruções de Trabalho
                              </h4>
                              {docsLoading ? (
                                <div className="text-sm text-yellow-900 flex items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando documentos...
                                </div>
                              ) : docs.length === 0 ? (
                                <p className="text-sm text-yellow-900">
                                  Nenhum documento anexado para esta operação.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {docs.map((d) => (
                                    <button
                                      key={d.id}
                                      onClick={async () => {
                                        try {
                                          const url = await createOperacaoDocSignedUrl(d.arquivo_path);
                                          window.open(url, '_blank', 'noopener,noreferrer');
                                        } catch (e: any) {
                                          addToast(e.message || 'Falha ao abrir documento.', 'error');
                                        }
                                      }}
                                      className="w-full text-left bg-white/70 hover:bg-white border border-yellow-200 rounded-xl px-4 py-3 transition flex items-center justify-between gap-3"
                                    >
                                      <div>
                                        <div className="font-semibold text-yellow-900">{d.titulo} <span className="text-xs text-yellow-700">v{d.versao}</span></div>
                                        {d.descricao && <div className="text-xs text-yellow-700">{d.descricao}</div>}
                                      </div>
                                      <span className="text-xs font-semibold text-yellow-800">Abrir</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                          </div>

                          <div className="grid grid-cols-3 gap-4 mt-auto">
                              <button
                                  onClick={handleStart}
                                  disabled={selectedOp.status === 'em_execucao' || selectedOp.status === 'concluida'}
                                  className="flex flex-col items-center justify-center gap-2 bg-blue-600 text-white p-5 rounded-2xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                              >
                                  <Play size={32} />
                                  <span className="font-bold">INICIAR</span>
                              </button>
                              <button
                                  onClick={() => openModal('pausar')}
                                  disabled={selectedOp.status !== 'em_execucao'}
                                  className="flex flex-col items-center justify-center gap-2 bg-orange-500 text-white p-5 rounded-2xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                              >
                                  <Pause size={32} />
                                  <span className="font-bold">PAUSAR</span>
                              </button>
                              <button
                                  onClick={() => openModal('concluir')}
                                  disabled={selectedOp.status === 'concluida'}
                                  className="flex flex-col items-center justify-center gap-2 bg-green-600 text-white p-5 rounded-2xl hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                              >
                                  <CheckCircle size={32} />
                                  <span className="font-bold">CONCLUIR</span>
                              </button>
                          </div>
                      </GlassCard>
                  ) : (
                      <div className="h-full flex items-center justify-center bg-white rounded-2xl border border-gray-200 text-gray-400">
                          <div className="text-center">
                              <Package size={64} className="mx-auto mb-4 opacity-20" />
                              <p>Selecione uma operação na fila para ver detalhes.</p>
                          </div>
                      </div>
                  )}
              </div>
            </div>
          )}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalAction === 'pausar' ? 'Apontar Parada' : 'Apontar Conclusão'} size="md">
        <div className="p-6 space-y-4">
            <Input 
                label="Quantidade Boa" 
                name="qtdBoas" 
                type="number" 
                value={qtdBoas} 
                onChange={e => setQtdBoas(parseFloat(e.target.value))} 
            />
            <Input 
                label="Quantidade Refugada" 
                name="qtdRefugadas" 
                type="number" 
                value={qtdRefugadas} 
                onChange={e => setQtdRefugadas(parseFloat(e.target.value))} 
            />
            {qtdRefugadas > 0 && (
                <Input 
                    label="Motivo do Refugo" 
                    name="motivo" 
                    value={motivoRefugo} 
                    onChange={e => setMotivoRefugo(e.target.value)} 
                />
            )}
            <TextArea 
                label="Observações" 
                name="obs" 
                value={observacoes} 
                onChange={e => setObservacoes(e.target.value)} 
                rows={3} 
            />
            <div className="flex justify-end gap-2 pt-4">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancelar</button>
                <button 
                    onClick={handleConfirmApontamento} 
                    disabled={isSaving}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                    {isSaving && <Loader2 className="animate-spin" size={16} />}
                    Confirmar
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
}

type OverviewGridProps = {
  data: CentroStatusSnapshot[];
  loading: boolean;
  tvMode: boolean;
};

const ALERT_CONFIG = {
  ok: {
    label: 'Operando',
    badge: 'bg-green-100 text-green-700',
    border: 'border-green-200',
  },
  warning: {
    label: 'Atenção',
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
  },
  danger: {
    label: 'Bloqueado',
    badge: 'bg-red-100 text-red-700',
    border: 'border-red-200',
  },
} as const;

const FactoryOverviewGrid: React.FC<OverviewGridProps> = ({ data, loading, tvMode }) => {
  const formatHora = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return '—';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Nenhum centro de trabalho ativo encontrado.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 overflow-y-auto pr-2">
      {data.map((snapshot) => {
        const alertCfg = ALERT_CONFIG[snapshot.alerta];
        return (
          <div
            key={snapshot.centro.id}
            className={`rounded-2xl border p-5 shadow-sm transition-colors ${
              tvMode ? 'bg-gray-800/80 border-gray-700 text-white' : `bg-white ${alertCfg.border} text-gray-900`
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className={`text-xs uppercase tracking-wide ${tvMode ? 'text-gray-400' : 'text-gray-500'}`}>Centro</p>
                <h3 className="text-xl font-bold">{snapshot.centro.nome}</h3>
                {snapshot.centro.codigo && (
                  <p className={`text-sm ${tvMode ? 'text-gray-400' : 'text-gray-500'}`}>{snapshot.centro.codigo}</p>
                )}
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${alertCfg.badge}`}>
                {alertCfg.label}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="p-3 rounded-xl bg-blue-50/60 text-blue-800">
                <p className="text-2xl font-bold">{snapshot.emExecucao.length}</p>
                <p className="text-xs uppercase font-semibold">Em execução</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/60 text-amber-800">
                <p className="text-2xl font-bold">{snapshot.fila.length}</p>
                <p className="text-xs uppercase font-semibold">Na fila</p>
              </div>
              <div className="p-3 rounded-xl bg-red-50/70 text-red-800">
                <p className="text-2xl font-bold">{snapshot.bloqueadas.length}</p>
                <p className="text-xs uppercase font-semibold">Bloqueadas</p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div>
                <p className={`text-xs font-semibold uppercase ${tvMode ? 'text-gray-400' : 'text-gray-500'}`}>Utilização</p>
                <p className="text-3xl font-bold">{snapshot.utilizacao}%</p>
              </div>
              <div className={`text-sm flex items-center gap-2 ${tvMode ? 'text-gray-300' : 'text-gray-500'}`}>
                <Activity size={16} />
                Atualizado {formatHora(snapshot.ultimaAtualizacao)}
              </div>
            </div>

            <div className={`rounded-xl p-3 ${tvMode ? 'bg-gray-900/60' : 'bg-gray-50'}`}>
              <p className={`text-xs uppercase font-semibold mb-1 ${tvMode ? 'text-gray-400' : 'text-gray-500'}`}>Próxima entrega</p>
              <p className="text-sm font-bold">{formatHora(snapshot.proximaEntrega)}</p>
              {snapshot.proximaOrdem && (
                <p className={`text-xs mt-1 ${tvMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {formatOrderNumber(snapshot.proximaOrdem.ordem_numero)} • {snapshot.proximaOrdem.produto_nome}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

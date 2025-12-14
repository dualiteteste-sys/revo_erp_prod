import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { listCentrosTrabalho, CentroTrabalho } from '@/services/industriaCentros';
import { listMinhaFila, OperacaoFila, apontarExecucao } from '@/services/industriaExecucao';
import { useToast } from '@/contexts/ToastProvider';
import {
  Loader2,
  Play,
  Pause,
  CheckCircle,
  RefreshCw,
  MonitorUp,
  KeyRound,
  LogOut,
  QrCode,
  AlertTriangle,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { formatOrderNumber } from '@/lib/utils';
import QuickScanDialog from '@/components/industria/chao/QuickScanDialog';

const REFRESH_INTERVAL = 10000;

const OperadorPage: React.FC = () => {
  const { addToast } = useToast();
  const [centros, setCentros] = useState<CentroTrabalho[]>([]);
  const [selectedCentroId, setSelectedCentroId] = useState('');
  const [fila, setFila] = useState<OperacaoFila[]>([]);
  const [loadingFila, setLoadingFila] = useState(false);

  const [operatorName, setOperatorName] = useState('');
  const [operatorPin, setOperatorPin] = useState('');
  const [isLogged, setIsLogged] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [highlightCode, setHighlightCode] = useState('');
  const [scannerContext, setScannerContext] = useState<'login' | 'fila' | null>(null);
  const [pinBypass] = useState<string | null>(import.meta.env.VITE_OPERATOR_DEV_PIN || null);

  const [modalAction, setModalAction] = useState<'pausar' | 'concluir' | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [qtdBoas, setQtdBoas] = useState(0);
  const [qtdRefugadas, setQtdRefugadas] = useState(0);
  const [motivoRefugo, setMotivoRefugo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listCentrosTrabalho(undefined, true)
      .then((data) => {
        setCentros(data);
        if (data.length > 0) {
          setSelectedCentroId(data[0].id);
        }
      })
      .catch(() => addToast('Não foi possível carregar centros de trabalho.', 'error'));
  }, [addToast]);

  const fetchFila = async (withLoader = true) => {
    if (!selectedCentroId) return;
    if (withLoader) setLoadingFila(true);
    try {
      const data = await listMinhaFila(selectedCentroId);
      setFila(data);
    } catch (error: any) {
      addToast(error.message || 'Falha ao carregar fila.', 'error');
    } finally {
      if (withLoader) setLoadingFila(false);
    }
  };

  useEffect(() => {
    if (selectedCentroId) {
      fetchFila();
    }
  }, [selectedCentroId]);

  useEffect(() => {
    if (!autoRefresh || !selectedCentroId) return;
    const interval = setInterval(() => fetchFila(false), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedCentroId]);

  const currentOp = useMemo(() => {
    if (!highlightCode) return fila[0] || null;
    return (
      fila.find(
        (op) =>
          formatOrderNumber(op.ordem_numero).toLowerCase().includes(highlightCode.toLowerCase()) ||
          op.produto_nome.toLowerCase().includes(highlightCode.toLowerCase()),
      ) || fila[0] || null
    );
  }, [fila, highlightCode]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorName.trim() || (operatorPin.length < 4 && !pinBypass)) {
      addToast('Informe nome e PIN (4 dígitos).', 'warning');
      return;
    }
    setIsLogged(true);
  };

  const handleLogout = () => {
    setIsLogged(false);
    setOperatorPin('');
  };

  const openModal = (action: 'pausar' | 'concluir') => {
    setModalAction(action);
    setQtdBoas(0);
    setQtdRefugadas(0);
    setMotivoRefugo('');
    setObservacoes('');
    setModalOpen(true);
  };

  const handleStart = async () => {
    if (!currentOp) return;
    try {
      await apontarExecucao(currentOp.id, 'iniciar');
      addToast('Operação iniciada.', 'success');
      fetchFila(false);
    } catch (error: any) {
      addToast(error.message || 'Falha ao iniciar.', 'error');
    }
  };

  const handleConfirmModal = async () => {
    if (!currentOp || !modalAction) return;
    setIsSaving(true);
    try {
      await apontarExecucao(
        currentOp.id,
        modalAction,
        qtdBoas,
        qtdRefugadas,
        qtdRefugadas > 0 ? motivoRefugo : undefined,
        observacoes,
      );
      addToast(`Operação ${modalAction === 'pausar' ? 'pausada' : 'concluída'}.`, 'success');
      setModalOpen(false);
      fetchFila(false);
    } catch (error: any) {
      addToast(error.message || 'Falha no apontamento.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchFila();
    setIsRefreshing(false);
  };

  const focusOperationFromCode = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setHighlightCode(trimmed);
      addToast('Código reconhecido. Buscando operação...', 'success');
    },
    [addToast]
  );

  const applyLoginScan = useCallback(
    (payload: string) => {
      const sanitized = payload.trim();
      if (!sanitized) return;
      const segments = sanitized.split(/[\s|,;]+/).filter(Boolean);
      if (segments.length === 1) {
        setOperatorPin(segments[0].replace(/\D/g, '').slice(0, 8));
      } else {
        setOperatorName(segments[0]);
        setOperatorPin(segments[1].replace(/\D/g, '').slice(0, 8));
      }
      const centroToken = segments.find((segment) =>
        segment.toLowerCase().startsWith('ct:')
      );
      if (centroToken) {
        const code = centroToken.split(':')[1];
        const found = centros.find(
          (c) => c.codigo?.toLowerCase() === code?.toLowerCase()
        );
        if (found) setSelectedCentroId(found.id);
      }
      addToast('Credenciais capturadas via QR.', 'success');
    },
    [centros, addToast]
  );

  const handleScanResult = useCallback(
    (value: string) => {
      if (scannerContext === 'login') {
        applyLoginScan(value);
      } else if (scannerContext === 'fila') {
        focusOperationFromCode(value);
      }
      setScannerContext(null);
    },
    [scannerContext, applyLoginScan, focusOperationFromCode]
  );

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6"
        >
          <div className="text-center space-y-2">
            <MonitorUp className="mx-auto w-10 h-10 text-blue-400" />
            <h1 className="text-2xl font-bold">Modo Operador</h1>
            <p className="text-slate-400 text-sm">Identifique-se para acessar sua fila de produção.</p>
          </div>
          <Input
            label="Nome do Operador"
            name="operadorNome"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Ex: João Silva"
          />
          <Input
            label="PIN (4 dígitos)"
            name="operadorPin"
            type="password"
            maxLength={4}
            inputMode="numeric"
            value={operatorPin}
            onChange={(e) => setOperatorPin(e.target.value.replace(/\D/g, ''))}
            placeholder="0000"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScannerContext('login')}
              className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 py-3 flex items-center justify-center gap-2 text-sm text-slate-300 hover:bg-slate-900"
            >
              <QrCode size={18} />
              Ler QR do crachá
            </button>
            {pinBypass && (
              <button
                type="button"
                onClick={() => setOperatorPin(pinBypass)}
                className="px-3 rounded-2xl border border-emerald-500 text-emerald-300 text-xs"
              >
                PIN dev
              </button>
            )}
          </div>
          <select
            value={selectedCentroId}
            onChange={(e) => setSelectedCentroId(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3"
          >
            <option value="">Selecione o centro</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 transition-colors rounded-2xl py-3 font-semibold text-white flex items-center justify-center gap-2"
          >
            <KeyRound size={18} /> Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="p-4 flex flex-col gap-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">Operador</p>
            <h1 className="text-2xl font-semibold">{operatorName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-2"
            >
              <LogOut size={16} /> Sair
            </button>
            <button
              onClick={handleManualRefresh}
              className="px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-2"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <label className="flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
            <span className="text-xs uppercase text-slate-500">Centro</span>
            <select
              value={selectedCentroId}
              onChange={(e) => setSelectedCentroId(e.target.value)}
              className="bg-transparent text-white font-semibold outline-none"
            >
              {centros.map((c) => (
                <option key={c.id} value={c.id} className="text-black">
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
            <span className="text-xs uppercase text-slate-500">Destacar ordem / código</span>
            <div className="flex items-center gap-2">
              <input
                value={highlightCode}
                onChange={(e) => setHighlightCode(e.target.value)}
                placeholder="Número, produto ou código"
                className="bg-transparent flex-1 outline-none text-white"
              />
              <button
                type="button"
                onClick={() => setScannerContext('fila')}
                className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                title="Escanear QR da ordem"
              >
                <QrCode size={18} />
              </button>
            </div>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-5 h-5 rounded border-slate-600 bg-slate-800"
            />
            Auto refresh a cada 10s
          </label>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {loadingFila && fila.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
          </div>
        ) : !currentOp ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            Nenhuma operação na fila no momento.
          </div>
        ) : (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-400 text-xs uppercase">Ordem Atual</p>
                <h2 className="text-3xl font-bold">{formatOrderNumber(currentOp.ordem_numero)}</h2>
                <p className="text-slate-300 text-lg">{currentOp.produto_nome}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700">
                Prioridade {currentOp.prioridade}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 my-6 text-center">
              <div className="bg-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-400">Planejado</p>
                <p className="text-2xl font-bold">{currentOp.quantidade_planejada}</p>
              </div>
              <div className="bg-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-400">Produzido</p>
                <p className="text-2xl font-bold text-green-400">{currentOp.quantidade_produzida}</p>
              </div>
              <div className="bg-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-400">Refugo</p>
                <p className="text-2xl font-bold text-red-400">{currentOp.quantidade_refugada}</p>
              </div>
            </div>

            {currentOp.atrasada && (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-400/10 border border-amber-500/40 rounded-2xl px-4 py-2 mb-4">
                <AlertTriangle size={18} /> Ordem atrasada, priorize esta operação.
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleStart}
                disabled={currentOp.status === 'em_execucao'}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-2xl py-6 flex flex-col items-center gap-2 font-semibold"
              >
                <Play size={32} /> Iniciar
              </button>
              <button
                onClick={() => openModal('pausar')}
                disabled={currentOp.status !== 'em_execucao'}
                className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 rounded-2xl py-6 flex flex-col items-center gap-2 font-semibold"
              >
                <Pause size={32} /> Pausar
              </button>
              <button
                onClick={() => openModal('concluir')}
                className="bg-emerald-600 hover:bg-emerald-500 rounded-2xl py-6 flex flex-col items-center gap-2 font-semibold"
              >
                <CheckCircle size={32} /> Concluir
              </button>
            </div>
          </section>
        )}

        <section>
          <h3 className="text-sm uppercase text-slate-500 mb-2">Próximas operações</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {fila.slice(1).map((op) => (
              <div key={op.id} className="min-w-[240px] bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-500">{formatOrderNumber(op.ordem_numero)}</p>
                <p className="font-semibold">{op.produto_nome}</p>
                <p className="text-xs text-slate-500">Plan: {op.quantidade_planejada}</p>
              </div>
            ))}
            {fila.length <= 1 && (
              <div className="text-slate-500 text-sm">Sem mais itens na fila.</div>
            )}
          </div>
        </section>
      </main>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalAction === 'pausar' ? 'Registrar pausa' : 'Concluir operação'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Quantidade boa"
            type="number"
            value={qtdBoas}
            onChange={(e) => setQtdBoas(Number(e.target.value))}
          />
          <Input
            label="Quantidade refugadas"
            type="number"
            value={qtdRefugadas}
            onChange={(e) => setQtdRefugadas(Number(e.target.value))}
          />
          {qtdRefugadas > 0 && (
            <Input
              label="Motivo do refugo"
              value={motivoRefugo}
              onChange={(e) => setMotivoRefugo(e.target.value)}
            />
          )}
          <TextArea
            label="Observações"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmModal}
              disabled={isSaving || (!!modalAction && modalAction === 'concluir' && qtdBoas <= 0)}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
      <QuickScanDialog
        open={scannerContext !== null}
        title={
          scannerContext === 'login'
            ? 'Ler QR do operador'
            : 'Ler QR/Barcode da ordem'
        }
        helper={
          scannerContext === 'login'
            ? 'Aponte para o QR do crachá (Formato: Nome|PIN|CT:COD).'
            : 'Escaneie o QR/Barcode da ficha para localizar a operação.'
        }
        onResult={handleScanResult}
        onClose={() => setScannerContext(null)}
      />
    </div>
  );
};

export default OperadorPage;

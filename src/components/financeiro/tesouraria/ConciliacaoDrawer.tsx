import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Link2, Plus } from 'lucide-react';
import { ExtratoItem, Movimentacao, listMovimentacoes, saveMovimentacao } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import { listConciliacaoRegras, type ConciliacaoRegra } from '@/services/conciliacaoRegras';
import { conciliarExtratoComTitulo, conciliarExtratoComTituloParcial, conciliarExtratoComTitulosLote, searchTitulosParaConciliacao, sugerirTitulosParaExtrato, type ConciliacaoTituloCandidate, type ConciliacaoTituloTipo } from '@/services/conciliacaoTitulos';
import { rankCandidates, scoreExtratoToMovimentacao, type MatchResult } from '@/lib/conciliacao/matching';
import DatePicker from '@/components/ui/DatePicker';
import { formatDatePtBR } from '@/lib/dateDisplay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  extratoItem: ExtratoItem | null;
  contaCorrenteId: string;
  onConciliate: (movimentacaoId: string) => Promise<void>;
}

export default function ConciliacaoDrawer({ isOpen, onClose, extratoItem, contaCorrenteId, onConciliate }: Props) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<'movimentacoes' | 'titulos'>('titulos');
  const [candidates, setCandidates] = useState<Array<MatchResult<Movimentacao>>>([]);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [rules, setRules] = useState<ConciliacaoRegra[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [creatingFromRuleId, setCreatingFromRuleId] = useState<string | null>(null);
  const [titulosLoading, setTitulosLoading] = useState(false);
  const [titulosSuggestions, setTitulosSuggestions] = useState<ConciliacaoTituloCandidate[]>([]);
  const [titulosSearchTerm, setTitulosSearchTerm] = useState('');
  const [titulosStartDate, setTitulosStartDate] = useState<Date | null>(null);
  const [titulosEndDate, setTitulosEndDate] = useState<Date | null>(null);
  const [titulosValorEnabled, setTitulosValorEnabled] = useState(true);
  const [titulosResults, setTitulosResults] = useState<ConciliacaoTituloCandidate[]>([]);
  const [titulosSearching, setTitulosSearching] = useState(false);
  const [titulosCount, setTitulosCount] = useState(0);
  const [titulosPage, setTitulosPage] = useState(1);
  const [titulosSelected, setTitulosSelected] = useState<Record<string, ConciliacaoTituloCandidate>>({});
  const [titulosBatchConciliando, setTitulosBatchConciliando] = useState(false);
  const [titulosParcialConciliando, setTitulosParcialConciliando] = useState(false);

  useEffect(() => {
    if (isOpen && extratoItem) {
      fetchSuggestions();
    }
  }, [isOpen, extratoItem]);

  useEffect(() => {
    if (!isOpen || !extratoItem) return;
    setMode('titulos');
    setTitulosSearchTerm('');
    setTitulosResults([]);
    setTitulosCount(0);
    setTitulosPage(1);
    setTitulosSelected({});

    const date = new Date(extratoItem.data_lancamento);
    const start = new Date(date);
    start.setDate(date.getDate() - 10);
    const end = new Date(date);
    end.setDate(date.getDate() + 10);
    setTitulosStartDate(start);
    setTitulosEndDate(end);
    setTitulosValorEnabled(true);

    void fetchTitulosSuggestions();
  }, [isOpen, extratoItem]);

  useEffect(() => {
    if (!isOpen) return;
    if (!contaCorrenteId) return;
    setLoadingRules(true);
    void (async () => {
      try {
        const r = await listConciliacaoRegras(contaCorrenteId);
        setRules((r || []).filter((x) => x.ativo));
      } catch {
        setRules([]);
      } finally {
        setLoadingRules(false);
      }
    })();
  }, [isOpen, contaCorrenteId]);

  const tipoTitulo = (() => {
    if (!extratoItem) return 'pagar' as ConciliacaoTituloTipo;
    return extratoItem.tipo_lancamento === 'debito' ? 'pagar' : 'receber';
  })();

  const matchedRules = (() => {
    if (!extratoItem) return [];
    const desc = String(extratoItem.descricao || '').toLowerCase();
    const tipo = extratoItem.tipo_lancamento;
    const valor = Number(extratoItem.valor || 0);
    return rules
      .filter((r) => {
        if (r.tipo_lancamento !== tipo) return false;
        const mt = String(r.match_text || '').trim().toLowerCase();
        if (!mt) return false;
        if (!desc.includes(mt)) return false;
        if (r.min_valor != null && valor < Number(r.min_valor)) return false;
        if (r.max_valor != null && valor > Number(r.max_valor)) return false;
        return true;
      })
      .slice(0, 3);
  })();

  const fetchTitulosSuggestions = async () => {
    if (!extratoItem) return;
    setTitulosLoading(true);
    try {
      const rows = await sugerirTitulosParaExtrato(extratoItem.id, 10);
      setTitulosSuggestions(rows);
    } catch (e: any) {
      setTitulosSuggestions([]);
      addToast(e?.message || 'Erro ao buscar sugestões de títulos.', 'error');
    } finally {
      setTitulosLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    if (!extratoItem) return;
    setLoading(true);
    try {
      // Search movements around the date (+- 5 days)
      const date = new Date(extratoItem.data_lancamento);
      const startDate = new Date(date); startDate.setDate(date.getDate() - 5);
      const endDate = new Date(date); endDate.setDate(date.getDate() + 5);

      const { data } = await listMovimentacoes({
        contaCorrenteId,
        startDate,
        endDate,
        tipoMov: extratoItem.tipo_lancamento === 'credito' ? 'entrada' : 'saida',
        page: 1,
        pageSize: 50
      });
      
      const unconciliated = data.filter(m => !m.conciliado);
      const ranked = rankCandidates(
        unconciliated.map((mov) => {
          const { score, reasons } = scoreExtratoToMovimentacao({
            extratoDescricao: extratoItem.descricao || '',
            extratoDocumento: extratoItem.documento_ref,
            extratoValor: extratoItem.valor,
            extratoDataISO: extratoItem.data_lancamento,
            movDescricao: mov.descricao,
            movDocumento: mov.documento_ref,
            movValor: mov.valor,
            movDataISO: mov.data_movimento,
          });
          return { item: mov, score, reasons };
        }),
      );

      setCandidates(ranked);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao buscar movimentações.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTitulosSearch = async (page = 1) => {
    if (!extratoItem) return;
    setTitulosSearching(true);
    try {
      const limit = 25;
      const offset = (page - 1) * limit;
      const { data, count } = await searchTitulosParaConciliacao({
        tipo: tipoTitulo,
        valor: titulosValorEnabled ? extratoItem.valor : null,
        startDate: titulosStartDate ? titulosStartDate.toISOString().slice(0, 10) : null,
        endDate: titulosEndDate ? titulosEndDate.toISOString().slice(0, 10) : null,
        q: titulosSearchTerm.trim() || null,
        limit,
        offset,
      });
      setTitulosResults(data);
      setTitulosCount(count);
      setTitulosPage(page);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao buscar títulos.', 'error');
    } finally {
      setTitulosSearching(false);
    }
  };

  const handleConciliarComTitulo = async (row: ConciliacaoTituloCandidate) => {
    if (!extratoItem) return;
    if (linkingId) return;
    const extratoValor = Number(extratoItem.valor || 0);
    const saldoTitulo = Number(row.saldo_aberto || 0);
    const diff = extratoValor - saldoTitulo;
    if (Math.abs(diff) > 0.01) {
      if (diff < 0) {
        setTitulosSelected({ [row.titulo_id]: row });
        addToast('Título tem saldo maior que o extrato. Use “Registrar parcial e conciliar”.', 'info');
        return;
      }
      addToast('Valor do extrato é maior que o saldo do título. Selecione mais títulos ou crie movimentação/ajuste.', 'error');
      return;
    }
    setLinkingId(row.titulo_id);
    try {
      await conciliarExtratoComTitulo({
        extratoId: extratoItem.id,
        tipo: row.tipo,
        tituloId: row.titulo_id,
      });
      addToast('Título conciliado com o extrato!', 'success');
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao conciliar título.', 'error');
    } finally {
      setLinkingId(null);
    }
  };

  const toggleTituloSelected = (row: ConciliacaoTituloCandidate) => {
    setTitulosSelected((prev) => {
      const next = { ...prev };
      if (next[row.titulo_id]) {
        delete next[row.titulo_id];
      } else {
        next[row.titulo_id] = row;
      }
      return next;
    });
  };

  const clearSelectedTitulos = () => setTitulosSelected({});

  const selectedTitulosArray = Object.values(titulosSelected);
  const selectedTitulosTotal = selectedTitulosArray.reduce((acc, t) => acc + Number(t.saldo_aberto || 0), 0);
  const selectedTitulosDiff = extratoItem ? Number(extratoItem.valor || 0) - selectedTitulosTotal : 0;
  const extratoValor = extratoItem ? Number(extratoItem.valor || 0) : 0;
  const isParcialCandidate =
    !!extratoItem &&
    selectedTitulosArray.length === 1 &&
    (Number(selectedTitulosArray[0]?.saldo_aberto || 0) - extratoValor) > 0.01;
  const titulosSuggestionsExact = extratoItem
    ? (titulosSuggestions || []).filter((t) => Math.abs(Number(t.saldo_aberto || 0) - extratoValor) <= 0.01)
    : (titulosSuggestions || []);

  const handleConciliarTitulosSelecionados = async () => {
    if (!extratoItem) return;
    if (titulosBatchConciliando || linkingId) return;
    if (selectedTitulosArray.length === 0) return;
    if (Math.abs(selectedTitulosDiff) > 0.01) {
      addToast('A soma dos títulos selecionados precisa bater com o valor do extrato.', 'error');
      return;
    }

    setTitulosBatchConciliando(true);
    try {
      const { movimentacaoId } = await conciliarExtratoComTitulosLote({
        extratoId: extratoItem.id,
        tipo: tipoTitulo,
        tituloIds: selectedTitulosArray.map((t) => t.titulo_id),
      });
      await onConciliate(movimentacaoId);
      addToast('Conciliação em lote concluída!', 'success');
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao conciliar em lote.', 'error');
    } finally {
      setTitulosBatchConciliando(false);
    }
  };

  const handleConciliarParcialSelecionado = async () => {
    if (!extratoItem) return;
    if (titulosParcialConciliando || titulosBatchConciliando || !!linkingId) return;
    if (!isParcialCandidate) return;

    const titulo = selectedTitulosArray[0];
    setTitulosParcialConciliando(true);
    try {
      const { movimentacaoId } = await conciliarExtratoComTituloParcial({
        extratoId: extratoItem.id,
        tipo: tipoTitulo,
        tituloId: titulo.titulo_id,
      });
      await onConciliate(movimentacaoId);
      addToast(`${tipoTitulo === 'pagar' ? 'Pagamento' : 'Recebimento'} parcial registrado e extrato conciliado!`, 'success');
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao registrar parcial e conciliar.', 'error');
    } finally {
      setTitulosParcialConciliando(false);
    }
  };

  const handleCreateFromRule = async (rule: ConciliacaoRegra) => {
    if (!extratoItem) return;
    if (creatingFromRuleId) return;
    setCreatingFromRuleId(rule.id);
    try {
      const newMov = await saveMovimentacao({
        conta_corrente_id: contaCorrenteId,
        data_movimento: extratoItem.data_lancamento,
        tipo_mov: extratoItem.tipo_lancamento === 'credito' ? 'entrada' : 'saida',
        valor: extratoItem.valor,
        descricao: rule.descricao_override || extratoItem.descricao,
        documento_ref: extratoItem.documento_ref,
        origem_tipo: `conciliacao_regra:${rule.id}`,
        categoria: rule.categoria,
        centro_custo: rule.centro_custo,
        observacoes: rule.observacoes || 'Gerado via regra de conciliação',
      });
      await onConciliate(newMov.id);
      addToast('Movimentação criada e conciliada (regra).', 'success');
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao aplicar regra.', 'error');
    } finally {
      setCreatingFromRuleId(null);
    }
  };

  const handleCreateAndConciliate = async () => {
    if (!extratoItem) return;
    setIsCreating(true);
    try {
      const newMov = await saveMovimentacao({
        conta_corrente_id: contaCorrenteId,
        data_movimento: extratoItem.data_lancamento,
        tipo_mov: extratoItem.tipo_lancamento === 'credito' ? 'entrada' : 'saida',
        valor: extratoItem.valor,
        descricao: extratoItem.descricao,
        documento_ref: extratoItem.documento_ref,
        origem_tipo: 'conciliacao_automatica',
        observacoes: 'Gerado via conciliação bancária'
      });
      
      await onConciliate(newMov.id);
      addToast('Movimentação criada e conciliada!', 'success');
      onClose();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleLink = async (movId: string) => {
    if (!extratoItem) return;
    if (linkingId) return;
    setLinkingId(movId);
    try {
      await onConciliate(movId);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao conciliar.', 'error');
    } finally {
      setLinkingId(null);
    }
  };

  if (!isOpen) return null;

  const bestCandidate = candidates[0] ?? null;
  const canAutoConciliate = !!bestCandidate && bestCandidate.score >= 85;

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto z-0" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-md bg-white h-full shadow-2xl pointer-events-auto flex flex-col relative z-10"
      >
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-800">Conciliar Lançamento</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-6 bg-blue-50 border-b border-blue-100">
            <p className="text-xs text-blue-600 font-bold uppercase mb-1">Item do Extrato</p>
            <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-gray-800 text-lg">{extratoItem?.descricao}</span>
                <span className={`font-bold text-lg ${extratoItem?.tipo_lancamento === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                    R$ {extratoItem?.valor.toFixed(2)}
                </span>
            </div>
            <div className="flex justify-between text-sm text-blue-800">
              <span>{formatDatePtBR(extratoItem!.data_lancamento)}</span>
              <span>Doc: {extratoItem?.documento_ref || '-'}</span>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMode('titulos')}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  mode === 'titulos' ? 'bg-white border-blue-200 text-blue-700' : 'bg-transparent border-transparent text-gray-600 hover:bg-white/60'
                }`}
              >
                Títulos (pagar/receber)
              </button>
              <button
                type="button"
                onClick={() => setMode('movimentacoes')}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  mode === 'movimentacoes' ? 'bg-white border-blue-200 text-blue-700' : 'bg-transparent border-transparent text-gray-600 hover:bg-white/60'
                }`}
              >
                Movimentações
              </button>
            </div>

            {mode === 'titulos' ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase text-gray-600">Conciliação em lote</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Selecione títulos para que a soma bata com o valor do extrato e clique em <span className="font-semibold">Conciliar selecionados</span>.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearSelectedTitulos}
                      disabled={selectedTitulosArray.length === 0 || titulosBatchConciliando || !!linkingId}
                      className="text-xs text-gray-600 hover:underline disabled:opacity-60"
                    >
                      Limpar
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-600">
                      <div><span className="font-semibold">{selectedTitulosArray.length}</span> selecionado(s)</div>
                      <div className="mt-0.5">
                        Soma: <span className="font-semibold">R$ {selectedTitulosTotal.toFixed(2)}</span>
                        {' · '}
                        Diferença:{' '}
                        <span className={`font-semibold ${Math.abs(selectedTitulosDiff) <= 0.01 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          R$ {selectedTitulosDiff.toFixed(2)}
                        </span>
                      </div>
                    </div>

	                    <button
	                      type="button"
	                      onClick={() => void handleConciliarTitulosSelecionados()}
	                      disabled={
	                        selectedTitulosArray.length === 0 ||
	                        titulosBatchConciliando ||
	                        !!linkingId ||
	                        Math.abs(selectedTitulosDiff) > 0.01
	                      }
	                      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
	                    >
	                      {titulosBatchConciliando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 size={16} />}
	                      Conciliar selecionados
	                    </button>
	                  </div>

                    {isParcialCandidate ? (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <div className="font-semibold">Parcial</div>
                        <div className="mt-1">
                          Título com saldo aberto maior que o extrato. Se confirmar, será registrado um{' '}
                          <span className="font-semibold">{tipoTitulo === 'pagar' ? 'pagamento' : 'recebimento'}</span> parcial de{' '}
                          <span className="font-semibold">R$ {extratoValor.toFixed(2)}</span> e o extrato ficará conciliado.
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div>
                            Restará em aberto:{' '}
                            <span className="font-semibold">
                              R$ {(Number(selectedTitulosArray[0].saldo_aberto || 0) - extratoValor).toFixed(2)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleConciliarParcialSelecionado()}
                            disabled={titulosParcialConciliando || titulosBatchConciliando || !!linkingId}
                            className="inline-flex items-center gap-2 rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
                          >
                            {titulosParcialConciliando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 size={16} />}
                            Registrar parcial e conciliar
                          </button>
                        </div>
                      </div>
                    ) : null}
	                </div>

	                <div className="rounded-lg border bg-white p-3">
	                  <div className="text-xs font-bold uppercase text-gray-600 mb-2">Sugestões automáticas</div>
	                  {titulosLoading ? (
	                    <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3 w-3 animate-spin" /> Buscando…</div>
	                  ) : titulosSuggestionsExact.length === 0 ? (
	                    <div className="text-xs text-gray-500">Nenhuma sugestão exata encontrada.</div>
	                  ) : (
	                    <div className="space-y-2">
	                      {titulosSuggestionsExact.map((t) => {
	                        const disabled = !!linkingId;
	                        const checked = !!titulosSelected[t.titulo_id];
	                        return (
	                          <div key={t.titulo_id} className="border rounded-lg p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <label className="pt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={titulosBatchConciliando || disabled}
                                    onChange={() => toggleTituloSelected(t)}
                                  />
                                </label>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-800">{t.pessoa_nome || '—'}</div>
                                  <div className="text-xs text-gray-500">{t.descricao || '—'}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-gray-800">R$ {Number(t.saldo_aberto).toFixed(2)}</div>
                                <div className="text-[11px] text-gray-500">Venc.: {formatDatePtBR(t.data_vencimento)}</div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="text-[11px] text-gray-600 flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100">{t.tipo}</span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-100">{t.status}</span>
                                {typeof t.score === 'number' ? <span className="px-2 py-0.5 rounded-full bg-slate-100">Score {t.score}</span> : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleConciliarComTitulo(t)}
                                disabled={disabled}
                                className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-60"
                              >
                                {linkingId === t.titulo_id ? 'Conciliando…' : 'Baixar e conciliar'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs font-bold uppercase text-gray-600 mb-2">Buscar manualmente (fallback)</div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={titulosSearchTerm}
                      onChange={(e) => setTitulosSearchTerm(e.target.value)}
                      placeholder="Buscar por nome/descrição/documento…"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <DatePicker label="De" value={titulosStartDate} onChange={setTitulosStartDate} />
                      <DatePicker label="Até" value={titulosEndDate} onChange={setTitulosEndDate} />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 select-none">
                      <input type="checkbox" checked={titulosValorEnabled} onChange={(e) => setTitulosValorEnabled(e.target.checked)} />
                      Usar valor do extrato como filtro (R$ {extratoItem?.valor.toFixed(2)})
                    </label>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void fetchTitulosSearch(1)}
                        disabled={titulosSearching || !!linkingId}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {titulosSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Buscar
                      </button>
                      <div className="text-xs text-gray-500">
                        {titulosCount > 0 ? `${titulosCount} resultado(s)` : null}
                      </div>
                    </div>
                  </div>

                  {titulosResults.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {titulosResults.map((t) => (
                        <div key={t.titulo_id} className="border rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <label className="pt-0.5">
                                <input
                                  type="checkbox"
                                  checked={!!titulosSelected[t.titulo_id]}
                                  disabled={titulosBatchConciliando || !!linkingId}
                                  onChange={() => toggleTituloSelected(t)}
                                />
                              </label>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-800">{t.pessoa_nome || '—'}</div>
                                <div className="text-xs text-gray-500">{t.descricao || '—'}</div>
                                {t.documento_ref ? <div className="text-[11px] text-gray-400">Doc: {t.documento_ref}</div> : null}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-800">R$ {Number(t.saldo_aberto).toFixed(2)}</div>
                              <div className="text-[11px] text-gray-500">Venc.: {formatDatePtBR(t.data_vencimento)}</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="text-[11px] text-gray-600 flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100">{t.tipo}</span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100">{t.status}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleConciliarComTitulo(t)}
                              disabled={!!linkingId}
                              className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-60"
                            >
                              {linkingId === t.titulo_id ? 'Conciliando…' : 'Baixar e conciliar'}
                            </button>
                          </div>
                        </div>
                      ))}

                      {titulosCount > 25 ? (
                        <div className="flex items-center justify-between pt-2">
                          <button
                            type="button"
                            className="text-xs text-blue-700 hover:underline disabled:opacity-60"
                            disabled={titulosPage <= 1 || titulosSearching}
                            onClick={() => void fetchTitulosSearch(Math.max(1, titulosPage - 1))}
                          >
                            Anterior
                          </button>
                          <div className="text-xs text-gray-500">Página {titulosPage}</div>
                          <button
                            type="button"
                            className="text-xs text-blue-700 hover:underline disabled:opacity-60"
                            disabled={titulosSearching || titulosPage * 25 >= titulosCount}
                            onClick={() => void fetchTitulosSearch(titulosPage + 1)}
                          >
                            Próxima
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {mode === 'movimentacoes' ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-gray-700">Movimentações Sugeridas</h4>
                <div className="flex items-center gap-2">
                  {canAutoConciliate ? (
                    <button
                      type="button"
                      onClick={() => void handleLink(bestCandidate.item.id)}
                      disabled={loading || !!linkingId}
                      className="text-emerald-700 text-xs font-semibold hover:underline disabled:opacity-60"
                      title="Conciliar automaticamente com a melhor sugestão (score alto)."
                    >
                      Conciliar melhor sugestão (Score {bestCandidate.score})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={fetchSuggestions}
                    disabled={loading || !!linkingId}
                    className="text-blue-600 text-xs hover:underline disabled:opacity-60"
                  >
                    Atualizar
                  </button>
                </div>
              </div>

              {loadingRules ? (
                <div className="mb-4 text-xs text-gray-500 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando regras…
                </div>
              ) : matchedRules.length > 0 ? (
                <div className="mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
                  <div className="text-xs font-bold uppercase text-emerald-700 mb-2">Sugestão por regra</div>
                  {matchedRules.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-1">
                      <div className="text-xs text-emerald-900">
                        Contém “{r.match_text}”
                        {r.categoria ? <span> · Categoria: {r.categoria}</span> : null}
                        {r.centro_custo ? <span> · Centro: {r.centro_custo}</span> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCreateFromRule(r)}
                        disabled={!!linkingId || isCreating || creatingFromRuleId === r.id}
                        className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60"
                      >
                        {creatingFromRuleId === r.id ? 'Aplicando…' : 'Criar e conciliar'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" /></div>
              ) : candidates.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                    <p>Nenhuma movimentação compatível encontrada.</p>
                    <button 
                        type="button"
                        onClick={handleCreateAndConciliate}
                        disabled={isCreating}
                        className="mt-4 text-blue-600 font-semibold hover:underline flex items-center justify-center gap-1 mx-auto"
                    >
                        {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                        Criar Movimentação Igual
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {candidates.map(({ item: mov, score, reasons }) => {
                        const isExactMatch = mov.valor === extratoItem?.valor;
                        const isLinking = linkingId === mov.id;
                        return (
                            <div key={mov.id} className={`p-3 border rounded-lg hover:border-blue-400 cursor-pointer transition-colors ${isExactMatch ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-medium text-gray-800">{mov.descricao}</span>
                                    <span className={`font-bold ${mov.tipo_mov === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                        R$ {mov.valor.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                                  <span>{formatDatePtBR(mov.data_movimento)}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">Score {score}</span>
                                      {isExactMatch && <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Valor Exato</span>}
                                    </div>
                                </div>
                                {reasons.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 mb-3">
                                    {reasons
                                      .slice()
                                      .sort((a, b) => b.points - a.points)
                                      .slice(0, 4)
                                      .map((r) => (
                                        <span
                                          key={`${mov.id}:${r.label}`}
                                          className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                                        >
                                          {r.label}
                                        </span>
                                      ))}
                                  </div>
                                ) : null}
                                <button 
                                    type="button"
                                    onClick={() => void handleLink(mov.id)}
                                    disabled={!!linkingId}
                                    className="w-full py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isLinking ? <Loader2 className="animate-spin" size={14} /> : <Link2 size={14} />} Vincular
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
            
            {candidates.length > 0 && (
                 <div className="mt-6 pt-6 border-t">
                    <button 
                        type="button"
                        onClick={handleCreateAndConciliate}
                        disabled={isCreating || !!linkingId}
                        className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                    >
                        {isCreating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                        Não encontrou? Criar Nova Movimentação
                    </button>
                 </div>
            )}
            </>
            ) : null}
        </div>
      </motion.div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Link2, Plus } from 'lucide-react';
import { ExtratoItem, Movimentacao, listMovimentacoes, saveMovimentacao } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';
import { listConciliacaoRegras, type ConciliacaoRegra } from '@/services/conciliacaoRegras';
import { conciliarExtratoComTitulo, conciliarExtratoComTituloParcial, conciliarExtratoComTitulosAlocados, conciliarExtratoComTitulosLote, searchTitulosParaConciliacao, sugerirTitulosParaExtrato, type ConciliacaoTituloCandidate, type ConciliacaoTituloTipo } from '@/services/conciliacaoTitulos';
import { rankCandidates, scoreExtratoToMovimentacao, type MatchResult } from '@/lib/conciliacao/matching';
import DatePicker from '@/components/ui/DatePicker';
import { formatDatePtBR } from '@/lib/dateDisplay';
import { useNumericField } from '@/hooks/useNumericField';
import { autoAllocateFifoByVencimento } from '@/lib/conciliacao/allocation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  extratoItem: ExtratoItem | null;
  contaCorrenteId: string;
  onConciliate: (movimentacaoId: string) => Promise<void>;
}

type MovimentacaoCandidate = MatchResult<Movimentacao> & {
  resolvedValor: number | null;
  hasMissingCriticalValue: boolean;
};

function toFiniteMoneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function clampMoney(value: number, min: number, max: number): number {
  const v = Math.round(value * 100) / 100;
  return Math.min(max, Math.max(min, v));
}

function TituloAllocationRow(props: {
  titulo: ConciliacaoTituloCandidate;
  applied: number | null;
  onChangeApplied: (value: number | null) => void;
  disabled?: boolean;
}) {
  const saldo = Number(props.titulo.saldo_aberto || 0);
  const field = useNumericField(props.applied ?? null, (v) => {
    if (v === null) return props.onChangeApplied(null);
    props.onChangeApplied(clampMoney(v, 0, saldo));
  });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{props.titulo.pessoa_nome || '—'}</div>
          <div className="mt-0.5 text-xs text-gray-600 truncate">{props.titulo.descricao || '—'}</div>
          <div className="mt-1 text-[11px] text-gray-500">
            Venc.: {formatDatePtBR(props.titulo.data_vencimento)} · Saldo: <span className="font-semibold">{formatBRL(saldo)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase font-semibold text-gray-500">Aplicar</div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0,00"
            {...field}
            disabled={props.disabled}
            className="mt-1 w-[140px] rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>
      </div>
    </div>
  );
}

export default function ConciliacaoDrawer({ isOpen, onClose, extratoItem, contaCorrenteId, onConciliate }: Props) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<'movimentacoes' | 'titulos'>('titulos');
  const [candidates, setCandidates] = useState<MovimentacaoCandidate[]>([]);
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
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number | null>>({});
  const [allocating, setAllocating] = useState(false);
  const [createCreditoEmConta, setCreateCreditoEmConta] = useState(false);
  const [creditoPessoaId, setCreditoPessoaId] = useState<string | null>(null);

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
    setAllocationOpen(false);
    setAllocations({});
    setAllocating(false);
    setCreateCreditoEmConta(false);
    setCreditoPessoaId(null);

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
          const resolvedValor =
            toFiniteMoneyOrNull(mov.valor) ??
            toFiniteMoneyOrNull(mov.valor_entrada) ??
            toFiniteMoneyOrNull(mov.valor_saida);

          if (resolvedValor === null) {
            if (import.meta.env.DEV) {
              console.error('[Conciliacao][Movimentacoes] valor ausente/invalid para conciliação.', {
                movimentacao: mov,
                field: 'valor',
                value: (mov as any)?.valor,
                valueType: typeof (mov as any)?.valor,
                valor_entrada: (mov as any)?.valor_entrada,
                valor_saida: (mov as any)?.valor_saida,
                extrato_id: extratoItem.id,
                conta_corrente_id: contaCorrenteId,
              });
            }
            return {
              item: mov,
              score: 0,
              reasons: [{ label: 'valor ausente/ inválido', points: 0 }],
            };
          }

          const { score, reasons } = scoreExtratoToMovimentacao({
            extratoDescricao: extratoItem.descricao || '',
            extratoDocumento: extratoItem.documento_ref,
            extratoValor: extratoItem.valor,
            extratoDataISO: extratoItem.data_lancamento,
            movDescricao: mov.descricao,
            movDocumento: mov.documento_ref,
            movValor: resolvedValor,
            movDataISO: mov.data_movimento,
          });
          return { item: mov, score, reasons };
        }),
      ).map((candidate) => ({
        ...candidate,
        resolvedValor:
          toFiniteMoneyOrNull(candidate.item.valor) ??
          toFiniteMoneyOrNull(candidate.item.valor_entrada) ??
          toFiniteMoneyOrNull(candidate.item.valor_saida),
        hasMissingCriticalValue:
          toFiniteMoneyOrNull(candidate.item.valor) === null &&
          toFiniteMoneyOrNull(candidate.item.valor_entrada) === null &&
          toFiniteMoneyOrNull(candidate.item.valor_saida) === null,
      }));

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

  const appliedTotal = Object.values(allocations).reduce<number>(
    (acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0),
    0
  );
  const allocationDiff = extratoItem ? Number(extratoItem.valor || 0) - appliedTotal : 0;

  const distinctPessoaOptions = (() => {
    const map = new Map<string, { id: string; nome: string }>();
    for (const t of selectedTitulosArray) {
      if (!t.pessoa_id) continue;
      if (!map.has(t.pessoa_id)) map.set(t.pessoa_id, { id: t.pessoa_id, nome: t.pessoa_nome || '—' });
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  })();

  const openAllocationWizard = () => {
    if (!extratoItem) return;
    if (selectedTitulosArray.length === 0) return;
    const auto = autoAllocateFifoByVencimento({ titulos: selectedTitulosArray, total: extratoValor });
    const next: Record<string, number | null> = {};
    for (const t of selectedTitulosArray) {
      next[t.titulo_id] = auto[t.titulo_id] ?? 0;
    }
    setAllocations(next);
    setCreateCreditoEmConta(false);
    if (distinctPessoaOptions.length === 1) setCreditoPessoaId(distinctPessoaOptions[0].id);
    else setCreditoPessoaId(null);
    setAllocationOpen(true);
  };

  const autoAllocateAgain = () => {
    if (!extratoItem) return;
    const auto = autoAllocateFifoByVencimento({ titulos: selectedTitulosArray, total: extratoValor });
    setAllocations((prev) => {
      const next: Record<string, number | null> = { ...prev };
      for (const t of selectedTitulosArray) next[t.titulo_id] = auto[t.titulo_id] ?? 0;
      return next;
    });
  };

  const handleConciliarAlocado = async () => {
    if (!extratoItem) return;
    if (allocating || titulosBatchConciliando || titulosParcialConciliando || !!linkingId) return;

    const alocacoes = selectedTitulosArray
      .map((t) => ({ tituloId: t.titulo_id, valor: Number(allocations[t.titulo_id] || 0) }))
      .filter((x) => Number.isFinite(x.valor) && x.valor > 0.0);

    const total = alocacoes.reduce((acc, x) => acc + x.valor, 0);
    const diff = extratoValor - total;

    if (alocacoes.length === 0) {
      addToast('Informe valores para aplicar em ao menos 1 título.', 'error');
      return;
    }
    if (total - extratoValor > 0.01) {
      addToast('Total aplicado maior que o valor do extrato. Ajuste os valores.', 'error');
      return;
    }
    if (diff > 0.01 && (!createCreditoEmConta || !creditoPessoaId)) {
      addToast('Existe sobra no extrato. Ative “Criar crédito em conta” e selecione a pessoa (ou ajuste a alocação).', 'error');
      return;
    }

    setAllocating(true);
    try {
      const res = await conciliarExtratoComTitulosAlocados({
        extratoId: extratoItem.id,
        tipo: tipoTitulo,
        alocacoes,
        overpaymentMode: diff > 0.01 ? 'credito_em_conta' : 'error',
        overpaymentPessoaId: diff > 0.01 ? creditoPessoaId : null,
        observacoes: null,
      });

      const firstMov = res.movimentacao_ids?.[0] ?? null;
      if (firstMov) {
        await onConciliate(firstMov);
      }

      if (res.kind === 'noop') {
        addToast(res.message || 'Extrato já estava conciliado.', 'info');
      } else if (diff > 0.01) {
        addToast('Conciliação concluída com crédito em conta (sobra).', 'success');
      } else {
        addToast('Conciliação concluída!', 'success');
      }
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao conciliar com alocação.', 'error');
    } finally {
      setAllocating(false);
    }
  };

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
	        origem_tipo: `tesouraria_conciliacao_extrato:regra:${rule.id}`,
	        origem_id: extratoItem.id,
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
	        origem_tipo: 'tesouraria_conciliacao_extrato',
	        origem_id: extratoItem.id,
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
    const target = candidates.find((candidate) => candidate.item.id === movId);
    if (!target) return;
    if (target.hasMissingCriticalValue || target.resolvedValor === null) {
      addToast('Movimentação inválida para conciliação: valor ausente. Revise o lançamento antes de vincular.', 'error');
      return;
    }
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
  const canAutoConciliate =
    !!bestCandidate &&
    bestCandidate.score >= 85 &&
    !bestCandidate.hasMissingCriticalValue &&
    bestCandidate.resolvedValor !== null;
  const extratoValorDisplay = toFiniteMoneyOrNull(extratoItem?.valor);
  const hasMissingExtratoValue = extratoValorDisplay === null;

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
                    {extratoValorDisplay === null ? '—' : `R$ ${extratoValorDisplay.toFixed(2)}`}
                </span>
            </div>
            <div className="flex justify-between text-sm text-blue-800">
              <span>{formatDatePtBR(extratoItem!.data_lancamento)}</span>
              <span>Doc: {extratoItem?.documento_ref || '-'}</span>
            </div>
            {hasMissingExtratoValue ? (
              <div className="mt-2 text-xs font-medium text-red-700">
                Lançamento de extrato sem valor válido. A conciliação está bloqueada até corrigir os dados.
              </div>
            ) : null}
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

                    {selectedTitulosArray.length > 0 ? (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={openAllocationWizard}
                          disabled={titulosBatchConciliando || titulosParcialConciliando || allocating || !!linkingId}
                          className="text-xs text-blue-700 hover:underline disabled:opacity-60"
                        >
                          Alocar pagamento (parcial/FIFO/crédito)
                        </button>
                        {allocationOpen ? (
                          <button
                            type="button"
                            onClick={() => setAllocationOpen(false)}
                            className="text-xs text-gray-600 hover:underline"
                          >
                            Fechar alocação
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {allocationOpen ? (
                      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">Alocação do pagamento</div>
                          <button
                            type="button"
                            onClick={() => setAllocationOpen(false)}
                            className="rounded-md p-1 text-gray-600 hover:bg-white/60"
                            title="Fechar"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <div className="mt-2 text-xs text-gray-700">
                          <div>
                            Total do extrato: <span className="font-semibold">{formatBRL(extratoValor)}</span>
                            {' · '}
                            Total aplicado: <span className="font-semibold">{formatBRL(appliedTotal)}</span>
                            {' · '}
                            Diferença:{' '}
                            <span className={`font-semibold ${Math.abs(allocationDiff) <= 0.01 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {formatBRL(allocationDiff)}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            Dica: use “Auto-alocar (FIFO)” para preencher os títulos mais antigos primeiro e depois ajuste manualmente.
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={autoAllocateAgain}
                            disabled={allocating}
                            className="text-xs rounded-md border border-blue-200 bg-white px-3 py-2 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                          >
                            Auto-alocar (FIFO por vencimento)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllocations((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 0])))}
                            disabled={allocating}
                            className="text-xs text-gray-600 hover:underline disabled:opacity-60"
                          >
                            Zerar valores
                          </button>
                        </div>

                        <div className="mt-3 space-y-2">
                          {selectedTitulosArray.map((t) => (
                            <TituloAllocationRow
                              key={t.titulo_id}
                              titulo={t}
                              applied={allocations[t.titulo_id] ?? 0}
                              disabled={allocating}
                              onChangeApplied={(v) => setAllocations((prev) => ({ ...prev, [t.titulo_id]: v }))}
                            />
                          ))}
                        </div>

                        {allocationDiff > 0.01 ? (
                          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            <div className="font-semibold">Sobra detectada</div>
                            <div className="mt-1">
                              O extrato tem <span className="font-semibold">{formatBRL(allocationDiff)}</span> a mais do que o total aplicado.
                              Você pode criar um crédito “em conta” para usar depois.
                            </div>

                            <label className="mt-2 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={createCreditoEmConta}
                                onChange={(e) => setCreateCreditoEmConta(e.target.checked)}
                                disabled={allocating}
                              />
                              <span>Criar crédito em conta (sobra)</span>
                            </label>

                            {createCreditoEmConta ? (
                              <div className="mt-2 flex flex-col gap-1">
                                <div className="text-[11px] text-amber-800">Pessoa (cliente/fornecedor) do crédito</div>
                                <select
                                  value={creditoPessoaId || ''}
                                  onChange={(e) => setCreditoPessoaId(e.target.value || null)}
                                  disabled={allocating}
                                  className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                                >
                                  <option value="">Selecione…</option>
                                  {distinctPessoaOptions.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.nome}
                                    </option>
                                  ))}
                                </select>
                                {distinctPessoaOptions.length > 1 ? (
                                  <div className="text-[11px] text-amber-800">
                                    Dica: se você selecionou títulos de pessoas diferentes, escolha explicitamente para quem o crédito deve ficar.
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setAllocationOpen(false)}
                            disabled={allocating}
                            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleConciliarAlocado()}
                            disabled={
                              allocating ||
                              !!linkingId ||
                              appliedTotal <= 0 ||
                              appliedTotal - extratoValor > 0.01 ||
                              (allocationDiff > 0.01 && (!createCreditoEmConta || !creditoPessoaId))
                            }
                            className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                          >
                            {allocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 size={16} />}
                            Conciliar com alocação
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
                      disabled={loading || !!linkingId || hasMissingExtratoValue}
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
                        disabled={isCreating || hasMissingExtratoValue}
                        className="mt-4 text-blue-600 font-semibold hover:underline flex items-center justify-center gap-1 mx-auto"
                    >
                        {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                        Criar Movimentação Igual
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {candidates.map(({ item: mov, score, reasons }) => {
                        const resolvedValor =
                          toFiniteMoneyOrNull(mov.valor) ??
                          toFiniteMoneyOrNull(mov.valor_entrada) ??
                          toFiniteMoneyOrNull(mov.valor_saida);
                        const hasMissingValue = resolvedValor === null;
                        const isExactMatch = !hasMissingValue && extratoValorDisplay !== null && resolvedValor === extratoValorDisplay;
                        const isLinking = linkingId === mov.id;
                        return (
                            <div key={mov.id} className={`p-3 border rounded-lg hover:border-blue-400 cursor-pointer transition-colors ${isExactMatch ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-medium text-gray-800">{mov.descricao}</span>
                                    <span className={`font-bold ${mov.tipo_mov === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                        {resolvedValor === null ? '—' : `R$ ${resolvedValor.toFixed(2)}`}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
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
                                {hasMissingValue ? (
                                  <div className="mb-3 text-xs font-medium text-red-700">
                                    Movimentação inválida: valor ausente. Este item não pode ser conciliado.
                                  </div>
                                ) : null}
                                <button 
                                    type="button"
                                    onClick={() => void handleLink(mov.id)}
                                    disabled={!!linkingId || hasMissingValue || hasMissingExtratoValue}
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
                        disabled={isCreating || !!linkingId || hasMissingExtratoValue}
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listOrdens, type OrdemIndustria, type StatusOrdem } from '@/services/industria';
import GlassCard from '@/components/ui/GlassCard';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, Search, Download, ExternalLink } from 'lucide-react';
import Select from '@/components/ui/forms/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { formatOrderNumber } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

type SortKey = 'saldo' | 'numero' | 'cliente' | 'produto';
type SortDir = 'asc' | 'desc';

const statusOptions: { value: '' | StatusOrdem; label: string }[] = [
  { value: '', label: 'Todos os Status' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'planejada', label: 'Planejada' },
  { value: 'em_programacao', label: 'Em Programação' },
  { value: 'em_beneficiamento', label: 'Em Beneficiamento' },
  { value: 'parcialmente_entregue', label: 'Parcialmente Entregue' },
  { value: 'em_inspecao', label: 'Em Inspeção' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
];

function computeSaldo(o: OrdemIndustria) {
  return Math.max((o.quantidade_planejada ?? 0) - (o.total_entregue ?? 0), 0);
}

function formatQtyPtBr(value: any) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(n);
}

function exportCsv(filename: string, rows: Record<string, any>[]) {
  const header = Object.keys(rows[0] || {});
  const escape = (v: any) => {
    const s = String(v ?? '');
    const needsQuote = /[",\n;]/.test(s);
    const normalized = s.replace(/"/g, '""');
    return needsQuote ? `"${normalized}"` : normalized;
  };

  const csv = [header.join(';')]
    .concat(rows.map(r => header.map(k => escape(r[k])).join(';')))
    .join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function StatusBeneficiamentosPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 450);
  const [statusFilter, setStatusFilter] = useState<'' | StatusOrdem>('');
  const [onlySaldo, setOnlySaldo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrdemIndustria[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('saldo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOrdens(debouncedSearch, 'beneficiamento', statusFilter || '');
      setOrders(data || []);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar Status de Beneficiamentos.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const base = Array.isArray(orders) ? orders : [];
    return onlySaldo ? base.filter(o => computeSaldo(o) > 0) : base;
  }, [orders, onlySaldo]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortKey === 'saldo') return (computeSaldo(a) - computeSaldo(b)) * dir;
      if (sortKey === 'numero') return (a.numero - b.numero) * dir;
      if (sortKey === 'cliente') return (String(a.cliente_nome || '')).localeCompare(String(b.cliente_nome || ''), 'pt-BR') * dir;
      if (sortKey === 'produto') return (String(a.produto_nome || '')).localeCompare(String(b.produto_nome || ''), 'pt-BR') * dir;
      return 0;
    });
    return copy;
  }, [filtered, sortDir, sortKey]);

  const totals = useMemo(() => {
    const saldoTotal = sorted.reduce((acc, o) => acc + computeSaldo(o), 0);
    const clientes = new Set(sorted.map(o => o.cliente_nome || '—'));
    return { saldoTotal, clientesCount: clientes.size, ordens: sorted.length };
  }, [sorted]);

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDir('desc');
      return;
    }
    setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
  };

  const handleExport = () => {
    if (sorted.length === 0) {
      addToast('Nada para exportar com os filtros atuais.', 'warning');
      return;
    }
    exportCsv(
      `status-beneficiamentos-${new Date().toISOString().slice(0, 10)}.csv`,
      sorted.map(o => ({
        Item: o.produto_nome || '',
        'Qtde. Caixas': o.qtde_caixas ?? '',
        OB: formatOrderNumber(o.numero),
        Cliente: o.cliente_nome || '',
        'Qtde. NF Cliente': o.quantidade_planejada ?? 0,
        NF: o.numero_nf || '',
        Pedido: o.pedido_numero || '',
        'Qtde. Entregue': o.total_entregue ?? 0,
        'Saldo a Entregar': computeSaldo(o),
        Status: o.status || '',
      }))
    );
    addToast('CSV exportado.', 'success');
  };

  const openOrdem = (id: string) => {
    navigate(`/app/industria/ordens?tipo=beneficiamento&open=${encodeURIComponent(id)}`);
  };

  return (
    <div className="p-1 h-full flex flex-col gap-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Status de Beneficiamentos</h1>
          <p className="text-gray-600 text-sm mt-1">
            Acompanhamento de saldo a entregar por Ordem de Beneficiamento (com filtros e exportação).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors"
            title="Exportar lista atual para CSV"
          >
            <Download size={18} />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4">
          <p className="text-xs text-cyan-700 font-semibold">Saldo total a entregar (un)</p>
          <p className="text-2xl font-bold text-cyan-800">{totals.saldoTotal}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs text-indigo-700 font-semibold">Ordens (com filtros)</p>
          <p className="text-2xl font-bold text-indigo-800">{totals.ordens}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-xs text-emerald-700 font-semibold">Clientes (com filtros)</p>
          <p className="text-2xl font-bold text-emerald-800">{totals.clientesCount}</p>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número, produto ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="min-w-[220px]">
          {statusOptions.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
          <input
            type="checkbox"
            checked={onlySaldo}
            onChange={(e) => setOnlySaldo(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Somente com saldo a entregar
        </label>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <Th onClick={() => toggleSort('produto')} active={sortKey === 'produto'} dir={sortDir}>Item</Th>
                <Th>Qtde. Caixas</Th>
                <Th onClick={() => toggleSort('numero')} active={sortKey === 'numero'} dir={sortDir}>OB</Th>
                <Th onClick={() => toggleSort('cliente')} active={sortKey === 'cliente'} dir={sortDir}>Cliente</Th>
                <Th className="text-right">Qtde. NF Cliente</Th>
                <Th>NF</Th>
                <Th>Pedido</Th>
                <Th className="text-right">Qtde. Entregue</Th>
                <Th onClick={() => toggleSort('saldo')} active={sortKey === 'saldo'} dir={sortDir} className="text-right">Saldo a Entregar</Th>
                <Th>Status</Th>
                <Th className="text-right">Ação</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="animate-spin" size={18} /> Carregando...
                    </span>
                  </td>
                </tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-500">
                    Nenhuma ordem encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
              {!loading && sorted.map((o) => {
                const saldo = computeSaldo(o);
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-800">{o.produto_nome || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{formatQtyPtBr(o.qtde_caixas)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatOrderNumber(o.numero)}</td>
                    <td className="px-4 py-3 text-gray-800">{o.cliente_nome || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{formatQtyPtBr(o.quantidade_planejada)}</td>
                    <td className="px-4 py-3 text-gray-700">{o.numero_nf || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{o.pedido_numero || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-800">{formatQtyPtBr(o.total_entregue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatQtyPtBr(saldo)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openOrdem(o.id)}
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold"
                        title="Abrir esta ordem"
                      >
                        <ExternalLink size={16} /> Abrir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <p className="text-xs text-gray-500">
        Observação: a listagem traz até 200 ordens por consulta (RPC). Se precisar, adicionamos paginação/scroll infinito.
      </p>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: SortDir;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={[
        'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase',
        onClick ? 'cursor-pointer select-none hover:text-gray-700' : '',
        active ? 'text-gray-700' : '',
        className || '',
      ].join(' ')}
      title={onClick ? `Ordenar (${dir === 'asc' ? 'crescente' : 'decrescente'})` : undefined}
    >
      {children}
      {active ? <span className="ml-1 text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span> : null}
    </th>
  );
}

function StatusBadge({ status }: { status: StatusOrdem }) {
  const map: Record<string, string> = {
    rascunho: 'bg-gray-100 text-gray-700',
    planejada: 'bg-blue-100 text-blue-700',
    em_programacao: 'bg-amber-100 text-amber-700',
    em_beneficiamento: 'bg-cyan-100 text-cyan-700',
    em_producao: 'bg-blue-100 text-blue-700',
    em_inspecao: 'bg-purple-100 text-purple-700',
    parcialmente_entregue: 'bg-emerald-100 text-emerald-700',
    parcialmente_concluida: 'bg-emerald-100 text-emerald-700',
    concluida: 'bg-green-100 text-green-700',
    cancelada: 'bg-red-100 text-red-700',
    aguardando_material: 'bg-orange-100 text-orange-700',
  };
  const label = String(status || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${map[status] || 'bg-gray-100 text-gray-700'}`}>{label}</span>;
}

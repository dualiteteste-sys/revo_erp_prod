import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, RefreshCw, Search, ShieldAlert } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { countOps403Events, listOps403Events, setOps403EventResolved, type Ops403EventRow } from '@/services/ops403';

function formatDateTimeBR(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR');
}

function formatKind(kind?: string | null) {
  switch (kind) {
    case 'missing_active_empresa':
      return { label: 'Empresa ativa', className: 'text-amber-700 bg-amber-50 border-amber-200' };
    case 'plan_gating':
      return { label: 'Plano', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
    case 'permission':
      return { label: 'Permissão', className: 'text-rose-700 bg-rose-50 border-rose-200' };
    default:
      return { label: kind || 'unknown', className: 'text-slate-700 bg-slate-50 border-slate-200' };
  }
}

export default function Ops403Page() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rows, setRows] = useState<Ops403EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<SortState<'when' | 'rpc' | 'route' | 'message'>>({ column: 'when', direction: 'desc' });

  const columns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'rpc', defaultWidth: 300, minWidth: 220 },
    { id: 'route', defaultWidth: 320, minWidth: 220 },
    { id: 'message', defaultWidth: 520, minWidth: 260 },
    { id: 'context', defaultWidth: 260, minWidth: 220 },
    { id: 'status', defaultWidth: 140, minWidth: 120, resizable: false },
    { id: 'actions', defaultWidth: 200, minWidth: 180, resizable: false },
  ];
  const { widths, startResize } = useTableColumnWidths({
    tableId: 'ops:403',
    columns,
  });

  const sorted = useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: 'when', type: 'date', getValue: (r: Ops403EventRow) => r.created_at ?? '' },
        { id: 'rpc', type: 'string', getValue: (r: Ops403EventRow) => r.rpc_fn ?? '' },
        { id: 'route', type: 'string', getValue: (r: Ops403EventRow) => r.route ?? '' },
        { id: 'message', type: 'string', getValue: (r: Ops403EventRow) => r.message ?? '' },
      ] as const
    );
  }, [rows, sort]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [count, list] = await Promise.all([
        countOps403Events({ q: q.trim() ? q.trim() : null, onlyOpen }),
        listOps403Events({ q: q.trim() ? q.trim() : null, onlyOpen, limit: 100, offset: 0 }),
      ]);
      setTotal(count);
      setRows(list ?? []);
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setError(e?.message || 'Falha ao carregar eventos 403.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyOpen]);

  const toggleResolved = async (id: string, resolved: boolean) => {
    setSavingId(id);
    try {
      await setOps403EventResolved(id, resolved);
      addToast(resolved ? 'Marcado como resolvido.' : 'Reaberto.', 'success');
      await load();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao atualizar status.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PageShell
      header={
        <PageHeader
          title="Diagnóstico: 403 (Empresa ativa)"
          description="Eventos de acesso negado (403/42501) normalmente ligados a empresa ativa ausente/instável no contexto multi-tenant."
          icon={<ShieldAlert size={20} />}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={load} className="gap-2" disabled={loading}>
                <RefreshCw size={16} />
                Atualizar
              </Button>
            </div>
          }
        />
      }
      filters={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-[320px] max-w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por RPC, rota, request_id ou mensagem…"
                className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <Button
              variant="secondary"
              onClick={load}
              className="gap-2"
              disabled={loading}
              title="Aplicar filtro"
            >
              <Search size={16} />
              Filtrar
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Mostrar apenas em aberto
          </label>
        </div>
      }
    >
      <PageCard className="space-y-3">
        <div className="text-xs text-slate-600">
          Total: <span className="font-semibold text-slate-900">{total}</span>
        </div>

        {loading ? (
          <div className="text-sm text-slate-600">Carregando…</div>
        ) : error ? (
          <div className="text-sm text-red-700">{error}</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full text-sm table-fixed">
                <TableColGroup columns={columns} widths={widths} />
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="rpc"
                      label="RPC"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="route"
                      label="Rota"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="message"
                      label="Mensagem"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <th className="p-3 text-left">Contexto</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="p-3 text-slate-700">{formatDateTimeBR(r.created_at)}</td>
                      <td className="p-3 font-mono text-slate-900 break-all">{r.rpc_fn ?? '—'}</td>
                      <td className="p-3 font-mono text-slate-700 break-all">{r.route ?? '—'}</td>
                      <td className="p-3 text-slate-900">
                        <div className="line-clamp-2">{r.message}</div>
                        {r.request_id ? <div className="mt-1 text-xs text-slate-500 font-mono">{r.request_id}</div> : null}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                              formatKind(r.kind).className,
                            ].join(' ')}
                            title={r.kind ?? 'unknown'}
                          >
                            {formatKind(r.kind).label}
                          </span>
                          {r.role ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                              {r.role}
                            </span>
                          ) : null}
                          {r.plano_mvp ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                              {r.plano_mvp}
                            </span>
                          ) : null}
                          {r.recovery_attempted ? (
                            <span
                              className={[
                                'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
                                r.recovery_ok
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700',
                              ].join(' ')}
                              title="Auto-recover de empresa ativa"
                            >
                              Recover {r.recovery_ok ? 'OK' : 'FAIL'}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3">
                        {r.resolved ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 size={14} /> Resolvido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <Circle size={14} /> Em aberto
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={savingId === r.id}
                          onClick={() => toggleResolved(r.id, !r.resolved)}
                        >
                          {r.resolved ? 'Reabrir' : 'Resolver'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-slate-500" colSpan={7}>
                        Nenhum evento 403 encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageCard>
    </PageShell>
  );
}

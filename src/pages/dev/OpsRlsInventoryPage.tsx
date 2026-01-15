import React, { useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, Search } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { listOpsRlsInventory, type OpsRlsInventoryRow } from '@/services/opsRls';

function yesNo(value: boolean) {
  return value ? 'Sim' : 'Não';
}

function riskLabel(row: OpsRlsInventoryRow) {
  const hasAnyGrant = row.grants_select || row.grants_insert || row.grants_update || row.grants_delete;
  if (hasAnyGrant && !row.rls_enabled) return { label: 'ALTO', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  if (row.has_empresa_id && row.rls_enabled && !row.has_current_empresa_policy)
    return { label: 'MÉDIO', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  return { label: 'OK', className: 'border-green-200 bg-green-50 text-green-700' };
}

export default function OpsRlsInventoryPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OpsRlsInventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState<'table' | 'rls' | 'empresa' | 'policy'>>({ column: 'table', direction: 'asc' });

  const columns: TableColumnWidthDef[] = [
    { id: 'risk', defaultWidth: 90, minWidth: 80, resizable: false },
    { id: 'table', defaultWidth: 260, minWidth: 220 },
    { id: 'rls', defaultWidth: 120, minWidth: 110 },
    { id: 'empresa', defaultWidth: 140, minWidth: 120 },
    { id: 'policy', defaultWidth: 200, minWidth: 170 },
    { id: 'policies', defaultWidth: 120, minWidth: 110 },
    { id: 'grants', defaultWidth: 240, minWidth: 200, resizable: false },
  ];

  const { widths, startResize } = useTableColumnWidths({
    tableId: 'ops:rls-inventory',
    columns,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOpsRlsInventory({ q: q.trim() ? q.trim() : null, limit: 200, offset: 0 });
      setRows(list ?? []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Falha ao carregar inventário RLS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: 'table', type: 'string', getValue: (r: OpsRlsInventoryRow) => r.table_name ?? '' },
        { id: 'rls', type: 'string', getValue: (r: OpsRlsInventoryRow) => String(r.rls_enabled) },
        { id: 'empresa', type: 'string', getValue: (r: OpsRlsInventoryRow) => String(r.has_empresa_id) },
        { id: 'policy', type: 'string', getValue: (r: OpsRlsInventoryRow) => String(r.has_current_empresa_policy) },
      ] as const
    );
  }, [rows, sort]);

  return (
    <PageShell
      header={
        <PageHeader
          title="Diagnóstico: Inventário RLS (multi-tenant)"
          description="Lista tabelas `public` e destaca riscos: grants diretos sem RLS, ausência de empresa_id e policies sem current_empresa_id()."
          icon={<Database size={20} />}
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
            <div className="relative w-[360px] max-w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por tabela…"
                className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <Button variant="secondary" onClick={load} disabled={loading} className="gap-2" title="Aplicar filtro">
              <Search size={16} />
              Filtrar
            </Button>
          </div>
          <div className="text-xs text-slate-600">
            Total: <span className="font-semibold text-slate-900">{rows.length}</span>
          </div>
        </div>
      }
    >
      <PageCard className="space-y-3">
        {loading ? (
          <div className="text-sm text-slate-600">Carregando…</div>
        ) : error ? (
          <div className="text-sm text-red-700">{error}</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="max-h-[620px] overflow-auto">
              <table className="min-w-full text-sm table-fixed">
                <TableColGroup columns={columns} widths={widths} />
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="p-3 text-left">Risco</th>
                    <ResizableSortableTh
                      columnId="table"
                      label="Tabela"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="rls"
                      label="RLS"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="empresa"
                      label="empresa_id"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="policy"
                      label="policy current_empresa_id"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <th className="p-3 text-left">Policies</th>
                    <th className="p-3 text-left">Grants (auth)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((r) => {
                    const risk = riskLabel(r);
                    const grants = [
                      r.grants_select ? 'SELECT' : null,
                      r.grants_insert ? 'INSERT' : null,
                      r.grants_update ? 'UPDATE' : null,
                      r.grants_delete ? 'DELETE' : null,
                    ].filter(Boolean);

                    return (
                      <tr key={`${r.schema_name}.${r.table_name}`} className="hover:bg-gray-50">
                        <td className="p-3">
                          <span className={['inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', risk.className].join(' ')}>
                            {risk.label}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-900">{r.table_name}</td>
                        <td className="p-3 text-slate-700">{yesNo(r.rls_enabled)}</td>
                        <td className="p-3 text-slate-700">{yesNo(r.has_empresa_id)}</td>
                        <td className="p-3 text-slate-700">{yesNo(r.has_current_empresa_policy)}</td>
                        <td className="p-3 text-slate-700">{r.policies_count}</td>
                        <td className="p-3 text-slate-700">{grants.length ? grants.join(', ') : '—'}</td>
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-slate-500" colSpan={7}>
                        Nenhuma tabela encontrada.
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


import React, { useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, Search } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  createOpsRlsInventorySnapshot,
  getOpsRlsInventorySnapshot,
  listOpsRlsInventory,
  listOpsRlsInventorySnapshots,
  type OpsRlsInventoryRow,
  type OpsRlsInventorySnapshotRow,
} from '@/services/opsRls';

function yesNo(value: boolean) {
  return value ? 'Sim' : 'Não';
}

function riskLabel(row: OpsRlsInventoryRow) {
  const hasAnyGrant = row.grants_select || row.grants_insert || row.grants_update || row.grants_delete;
  if (hasAnyGrant && !row.rls_enabled) return { label: 'ALTO', className: 'border-rose-200 bg-rose-50 text-rose-700' };
  if (hasAnyGrant && row.has_empresa_id && row.rls_enabled && !row.has_current_empresa_policy)
    return { label: 'MÉDIO', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  return { label: 'OK', className: 'border-green-200 bg-green-50 text-green-700' };
}

function isHighRisk(row: OpsRlsInventoryRow) {
  const hasAnyGrant = row.grants_select || row.grants_insert || row.grants_update || row.grants_delete;
  return hasAnyGrant && !row.rls_enabled;
}

function isMediumRisk(row: OpsRlsInventoryRow) {
  const hasAnyGrant = row.grants_select || row.grants_insert || row.grants_update || row.grants_delete;
  return hasAnyGrant && row.has_empresa_id && row.rls_enabled && !row.has_current_empresa_policy;
}

function toMarkdown(rows: OpsRlsInventoryRow[]) {
  const lines: string[] = [];
  lines.push('# Inventário RLS (multi-tenant)');
  lines.push('');
  lines.push(`Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  lines.push('');
  const high = rows.filter(isHighRisk);
  const medium = rows.filter((r) => !isHighRisk(r) && isMediumRisk(r));
  const ok = rows.filter((r) => !isHighRisk(r) && !isMediumRisk(r));
  lines.push(`Resumo: ALTO=${high.length} • MÉDIO=${medium.length} • OK=${ok.length}`);
  lines.push('');

  const sections: Array<{ title: string; list: OpsRlsInventoryRow[] }> = [
    { title: 'ALTO — grants sem RLS', list: high },
    { title: 'MÉDIO — empresa_id sem policy current_empresa_id()', list: medium },
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    if (!section.list.length) {
      lines.push('- (nenhum)');
      lines.push('');
      continue;
    }
    for (const r of section.list) {
      const grants = [
        r.grants_select ? 'SELECT' : null,
        r.grants_insert ? 'INSERT' : null,
        r.grants_update ? 'UPDATE' : null,
        r.grants_delete ? 'DELETE' : null,
      ].filter(Boolean);
      lines.push(
        `- \`${r.schema_name}.${r.table_name}\` • RLS=${r.rls_enabled ? 'sim' : 'não'} • empresa_id=${r.has_empresa_id ? 'sim' : 'não'} • policy_current_empresa=${r.has_current_empresa_policy ? 'sim' : 'não'} • policies=${r.policies_count} • grants=${grants.length ? grants.join(',') : '—'}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export default function OpsRlsInventoryPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OpsRlsInventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<OpsRlsInventorySnapshotRow[]>([]);
  const [q, setQ] = useState('');
  const [onlyRisk, setOnlyRisk] = useState<'all' | 'high' | 'high_medium'>('all');
  const [sort, setSort] = useState<SortState<'table' | 'rls' | 'empresa' | 'policy'>>({ column: 'table', direction: 'asc' });

  const columns: TableColumnWidthDef[] = [
    { id: 'risk', defaultWidth: 90, minWidth: 80, resizable: false },
    { id: 'table', defaultWidth: 260, minWidth: 220 },
    { id: 'rls', defaultWidth: 120, minWidth: 110 },
    { id: 'empresa', defaultWidth: 140, minWidth: 120 },
    { id: 'policy', defaultWidth: 240, minWidth: 200 },
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

  const loadSnapshots = async () => {
    setSnapshotsLoading(true);
    try {
      const list = await listOpsRlsInventorySnapshots({ limit: 10, offset: 0 });
      setSnapshots(list ?? []);
    } catch (e: any) {
      setSnapshots([]);
      addToast(e?.message || 'Falha ao carregar snapshots.', 'error');
    } finally {
      setSnapshotsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const filtered =
      onlyRisk === 'all'
        ? rows
        : onlyRisk === 'high'
          ? rows.filter(isHighRisk)
          : rows.filter((r) => isHighRisk(r) || isMediumRisk(r));

    return sortRows(
      filtered,
      sort as any,
      [
        { id: 'table', type: 'string', getValue: (r: OpsRlsInventoryRow) => r.table_name ?? '' },
        { id: 'rls', type: 'string', getValue: (r: OpsRlsInventoryRow) => String(r.rls_enabled) },
        { id: 'empresa', type: 'string', getValue: (r: OpsRlsInventoryRow) => String(r.has_empresa_id) },
        { id: 'policy', type: 'string', getValue: (r: OpsRlsInventoryRow) => String(r.has_current_empresa_policy) },
      ] as const
    );
  }, [rows, sort, onlyRisk]);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(sorted));
      addToast('Checklist (markdown) copiado.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao copiar.', 'error');
    }
  };

  const createSnapshot = async () => {
    setSnapshotsLoading(true);
    try {
      const id = await createOpsRlsInventorySnapshot({
        label: 'manual',
        meta: {
          origin: window.location.origin,
          path: window.location.pathname,
          at: new Date().toISOString(),
        },
      });
      addToast('Snapshot criado.', 'success');
      await loadSnapshots();
      return id;
    } catch (e: any) {
      addToast(e?.message || 'Falha ao criar snapshot.', 'error');
      return null;
    } finally {
      setSnapshotsLoading(false);
    }
  };

  const downloadSnapshotJson = async (snapshotId: string) => {
    try {
      const snap = await getOpsRlsInventorySnapshot({ id: snapshotId });
      if (!snap) {
        addToast('Snapshot não encontrado.', 'error');
        return;
      }
      const content = JSON.stringify(snap, null, 2);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date(snap.created_at).toISOString().replaceAll(':', '-');
      a.href = url;
      a.download = `rls_inventory_snapshot_${stamp}_${snap.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao baixar snapshot.', 'error');
    }
  };

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
              <Button variant="secondary" onClick={createSnapshot} className="gap-2" disabled={snapshotsLoading}>
                <Database size={16} />
                Gerar snapshot
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
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={onlyRisk === 'all' ? 'secondary' : 'outline'}
                onClick={() => setOnlyRisk('all')}
                className="h-8 px-3 text-xs"
              >
                Todas
              </Button>
              <Button
                variant={onlyRisk === 'high' ? 'secondary' : 'outline'}
                onClick={() => setOnlyRisk('high')}
                className="h-8 px-3 text-xs"
              >
                Só ALTO
              </Button>
              <Button
                variant={onlyRisk === 'high_medium' ? 'secondary' : 'outline'}
                onClick={() => setOnlyRisk('high_medium')}
                className="h-8 px-3 text-xs"
              >
                ALTO + MÉDIO
              </Button>
              <Button variant="outline" onClick={copyMarkdown} disabled={loading || sorted.length === 0} className="h-8 px-3 text-xs gap-2">
                <span className="font-mono">#</span>
                Copiar checklist
              </Button>
              <div className="text-xs text-slate-600">
                Total: <span className="font-semibold text-slate-900">{rows.length}</span>
                <span className="text-slate-400"> • </span>
                Exibindo: <span className="font-semibold text-slate-900">{sorted.length}</span>
              </div>
            </div>
        </div>
      }
    >
      <PageCard className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-slate-900">Snapshots (evidência)</div>
            <div className="text-xs text-slate-600">
              {snapshotsLoading ? 'Carregando…' : snapshots.length ? `Últimos ${snapshots.length}` : 'Nenhum ainda'}
            </div>
          </div>
          {snapshots.length > 0 && (
            <div className="mt-2 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-2 text-left">Quando</th>
                    <th className="py-2 text-left">Label</th>
                    <th className="py-2 text-left">Resumo</th>
                    <th className="py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {snapshots.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">
                        {new Date(s.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{s.label ?? '—'}</td>
                      <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">
                        ALTO={s.high_count} • MÉDIO={s.medium_count} • OK={s.ok_count}
                      </td>
                      <td className="py-2 text-right">
                        <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => downloadSnapshotJson(s.id)}>
                          Baixar JSON
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
                      label="policy tenant (empresa ativa/membership)"
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

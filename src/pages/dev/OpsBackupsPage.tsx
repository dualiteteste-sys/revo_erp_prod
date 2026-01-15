import React, { useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { dispatchDbBackup, dispatchDbRestore, listOpsDbBackups, type OpsDbBackupRow } from '@/services/opsBackups';

function formatDateTimeBR(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR');
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function shortSha(value?: string | null) {
  if (!value) return '—';
  return value.length > 10 ? `${value.slice(0, 10)}…` : value;
}

function shortKey(key: string) {
  const parts = key.split('/');
  return parts.length > 3 ? `${parts.slice(0, 3).join('/')}/…/${parts[parts.length - 1]}` : key;
}

export default function OpsBackupsPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OpsDbBackupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<OpsDbBackupRow['target'] | 'all'>('prod');
  const [sort, setSort] = useState<SortState<'when' | 'target' | 'mode' | 'bytes'>>({ column: 'when', direction: 'desc' });

  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState<{ open: boolean; row: OpsDbBackupRow | null }>({ open: false, row: null });
  const [restoreTarget, setRestoreTarget] = useState<OpsDbBackupRow['target']>('dev');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMode, setBackupMode] = useState<OpsDbBackupRow['mode']>('full');
  const [backupLabel, setBackupLabel] = useState('');
  const [backupTarget, setBackupTarget] = useState<OpsDbBackupRow['target']>('prod');

  const columns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'target', defaultWidth: 90, minWidth: 80 },
    { id: 'mode', defaultWidth: 120, minWidth: 110 },
    { id: 'bytes', defaultWidth: 120, minWidth: 110 },
    { id: 'sha', defaultWidth: 140, minWidth: 120 },
    { id: 'key', defaultWidth: 520, minWidth: 260 },
    { id: 'status', defaultWidth: 120, minWidth: 110, resizable: false },
    { id: 'actions', defaultWidth: 220, minWidth: 200, resizable: false },
  ];

  const { widths, startResize } = useTableColumnWidths({
    tableId: 'ops:db-backups',
    columns,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOpsDbBackups({ target: target === 'all' ? null : target, limit: 80, offset: 0 });
      setRows(list ?? []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Falha ao carregar backups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const sorted = useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: 'when', type: 'date', getValue: (r: OpsDbBackupRow) => r.created_at ?? '' },
        { id: 'target', type: 'string', getValue: (r: OpsDbBackupRow) => r.target ?? '' },
        { id: 'mode', type: 'string', getValue: (r: OpsDbBackupRow) => r.mode ?? '' },
        { id: 'bytes', type: 'number', getValue: (r: OpsDbBackupRow) => Number(r.bytes ?? 0) },
      ] as const
    );
  }, [rows, sort]);

  const onDispatchBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await dispatchDbBackup({ target: backupTarget, mode: backupMode, label: backupLabel.trim() || undefined });
      addToast('Backup disparado no GitHub Actions.', 'success');
      setBackupOpen(false);
      setBackupLabel('');
      setTimeout(() => void load(), 1500);
      if (res?.run_url) window.open(res.run_url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao disparar backup.', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const onDispatchRestore = async () => {
    const row = restoreOpen.row;
    if (!row) return;
    setRestoreBusy(true);
    try {
      const res = await dispatchDbRestore({ target: restoreTarget, r2_key: row.r2_key, confirm: restoreConfirm.trim() || undefined });
      addToast('Restore disparado no GitHub Actions.', 'success');
      setRestoreOpen({ open: false, row: null });
      setRestoreConfirm('');
      if (res?.run_url) window.open(res.run_url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao disparar restore.', 'error');
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <PageShell
      header={
        <PageHeader
          title="Backups (Registros) — manual"
          description="Dispara dump/restore via GitHub Actions + R2. Use com cuidado: restore pode sobrescrever dados."
          icon={<Database size={20} />}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={load} className="gap-2" disabled={loading}>
                <RefreshCw size={16} />
                Atualizar
              </Button>
              <Button onClick={() => setBackupOpen(true)} className="gap-2">
                <Database size={16} />
                Gerar backup agora
              </Button>
            </div>
          }
        />
      }
      filters={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">Target</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as any)}
              className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="prod">prod</option>
              <option value="dev">dev</option>
              <option value="verify">verify</option>
              <option value="all">todos</option>
            </select>
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
                    <ResizableSortableTh
                      columnId="when"
                      label="Quando"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="target"
                      label="Target"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="mode"
                      label="Modo"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <ResizableSortableTh
                      columnId="bytes"
                      label="Tamanho"
                      sort={sort}
                      onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                      onResizeStart={startResize}
                      className="text-left p-3"
                    />
                    <th className="p-3 text-left">SHA</th>
                    <th className="p-3 text-left">R2 key</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="p-3 text-slate-700">{formatDateTimeBR(r.created_at)}</td>
                      <td className="p-3 font-mono">{r.target}</td>
                      <td className="p-3 font-mono">{r.mode}</td>
                      <td className="p-3 text-slate-700">{formatBytes(r.bytes)}</td>
                      <td className="p-3 font-mono text-slate-700" title={r.sha256}>
                        {shortSha(r.sha256)}
                      </td>
                      <td className="p-3 font-mono text-slate-700" title={r.r2_key}>
                        {shortKey(r.r2_key)}
                      </td>
                      <td className="p-3 text-slate-700">{r.status}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                              setRestoreTarget('dev');
                              setRestoreConfirm('');
                              setRestoreOpen({ open: true, row: r });
                            }}
                          >
                            Restaurar…
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-slate-500" colSpan={8}>
                        Nenhum backup encontrado (ainda).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageCard>

      <Dialog open={backupOpen} onOpenChange={setBackupOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Gerar backup agora</DialogTitle>
            <DialogDescription>Dispara o workflow `DB Backup (Supabase)` no GitHub Actions.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-slate-600">Target</div>
              <select
                value={backupTarget}
                onChange={(e) => setBackupTarget(e.target.value as any)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="prod">prod</option>
                <option value="dev">dev</option>
                <option value="verify">verify</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-600">Modo</div>
              <select
                value={backupMode}
                onChange={(e) => setBackupMode(e.target.value as any)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="full">full (dados)</option>
                <option value="schema-only">schema-only</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <div className="text-xs text-slate-600">Label (opcional)</div>
              <input
                value={backupLabel}
                onChange={(e) => setBackupLabel(e.target.value)}
                placeholder="ex.: antes-migracao-x"
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setBackupOpen(false)} disabled={backupBusy}>
              Cancelar
            </Button>
            <Button onClick={onDispatchBackup} disabled={backupBusy}>
              {backupBusy ? 'Disparando…' : 'Disparar backup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreOpen.open} onOpenChange={(v) => (!v ? setRestoreOpen({ open: false, row: null }) : undefined)}>
        <DialogContent className="max-w-3xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Restaurar backup</DialogTitle>
            <DialogDescription>
              Isso pode sobrescrever dados do banco alvo. Use preferencialmente em `dev`/`verify`. Para `prod`, é exigido confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm text-slate-700">
            <div>
              <span className="font-semibold">Backup:</span>{' '}
              <span className="font-mono">{restoreOpen.row ? shortKey(restoreOpen.row.r2_key) : '—'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Restaurar em</div>
                <select
                  value={restoreTarget}
                  onChange={(e) => setRestoreTarget(e.target.value as any)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="dev">dev</option>
                  <option value="verify">verify</option>
                  <option value="prod">prod</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Confirm (só para PROD)</div>
                <input
                  value={restoreConfirm}
                  onChange={(e) => setRestoreConfirm(e.target.value)}
                  placeholder="RESTORE_PROD"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setRestoreOpen({ open: false, row: null })} disabled={restoreBusy}>
              Cancelar
            </Button>
            <Button onClick={onDispatchRestore} disabled={restoreBusy || !restoreOpen.row}>
              {restoreBusy ? 'Disparando…' : 'Disparar restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

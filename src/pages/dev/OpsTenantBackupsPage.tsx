import React, { useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, ShieldAlert } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { useToast } from '@/contexts/ToastProvider';
import {
  dispatchTenantBackup,
  dispatchTenantRestore,
  dispatchTenantRestoreLatest,
  listOpsTenantBackups,
  type OpsTenantBackupRow,
} from '@/services/opsTenantBackups';

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
  return parts.length > 4 ? `${parts.slice(0, 4).join('/')}/…/${parts[parts.length - 1]}` : key;
}

export default function OpsTenantBackupsPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OpsTenantBackupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<OpsTenantBackupRow['target'] | 'all'>('prod');
  const [sort, setSort] = useState<SortState<'when' | 'target' | 'bytes'>>({ column: 'when', direction: 'desc' });

  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState<{ open: boolean; row: OpsTenantBackupRow | null }>({ open: false, row: null });
  const [restoreTarget, setRestoreTarget] = useState<OpsTenantBackupRow['target']>('dev');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupLabel, setBackupLabel] = useState('');
  const [backupTarget, setBackupTarget] = useState<OpsTenantBackupRow['target']>('prod');
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillBusy, setDrillBusy] = useState(false);

  const columns: TableColumnWidthDef[] = [
    { id: 'when', defaultWidth: 190, minWidth: 170 },
    { id: 'target', defaultWidth: 90, minWidth: 80 },
    { id: 'bytes', defaultWidth: 120, minWidth: 110 },
    { id: 'sha', defaultWidth: 140, minWidth: 120 },
    { id: 'key', defaultWidth: 520, minWidth: 260 },
    { id: 'status', defaultWidth: 120, minWidth: 110, resizable: false },
    { id: 'actions', defaultWidth: 220, minWidth: 200, resizable: false },
  ];

  const { widths, startResize } = useTableColumnWidths({
    tableId: 'ops:tenant-backups',
    columns,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOpsTenantBackups({ target: target === 'all' ? null : target, limit: 80, offset: 0 });
      setRows(list ?? []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Falha ao carregar backups do tenant.');
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
        { id: 'when', type: 'date', getValue: (r: OpsTenantBackupRow) => r.created_at ?? '' },
        { id: 'target', type: 'string', getValue: (r: OpsTenantBackupRow) => r.target ?? '' },
        { id: 'bytes', type: 'number', getValue: (r: OpsTenantBackupRow) => Number(r.bytes ?? 0) },
      ] as const
    );
  }, [rows, sort]);

  const onDispatchBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await dispatchTenantBackup({ target: backupTarget, label: backupLabel.trim() || undefined });
      addToast('Backup do tenant disparado no GitHub Actions.', 'success');
      setBackupOpen(false);
      setBackupLabel('');
      setTimeout(() => void load(), 1500);
      if (res?.run_url) window.open(res.run_url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao disparar backup do tenant.', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const onDispatchRestore = async () => {
    const row = restoreOpen.row;
    if (!row) return;
    setRestoreBusy(true);
    try {
      const res = await dispatchTenantRestore({ target: restoreTarget, r2_key: row.r2_key, confirm: restoreConfirm.trim() || undefined });
      addToast('Restore do tenant disparado no GitHub Actions.', 'success');
      setRestoreOpen({ open: false, row: null });
      setRestoreConfirm('');
      if (res?.run_url) window.open(res.run_url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao disparar restore do tenant.', 'error');
    } finally {
      setRestoreBusy(false);
    }
  };

  const onDispatchRestoreDrillVerify = async () => {
    setDrillBusy(true);
    try {
      const res = await dispatchTenantRestoreLatest({ source_target: 'prod', target: 'verify' });
      addToast('Restore drill (verify) disparado no GitHub Actions.', 'success');
      setDrillOpen(false);
      setTimeout(() => void load(), 1500);
      if (res?.run_url) window.open(res.run_url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao disparar restore drill (verify).', 'error');
    } finally {
      setDrillBusy(false);
    }
  };

  return (
    <PageShell
      header={
        <PageHeader
          title="Backup por Empresa (Tenant) — manual"
          description="Exporta/restaura registros da empresa ativa (tabelas com empresa_id) via GitHub Actions + R2."
          icon={<ShieldAlert size={20} />}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={load} className="gap-2" disabled={loading}>
                <RefreshCw size={16} />
                Atualizar
              </Button>
              <Button variant="outline" onClick={() => setDrillOpen(true)} className="gap-2">
                Restore drill (verify)
              </Button>
              <Button onClick={() => setBackupOpen(true)} className="gap-2">
                <Database size={16} />
                Gerar backup do tenant
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
                          {r.target === 'prod' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRestoreTarget('verify');
                                setRestoreConfirm('');
                                setRestoreOpen({ open: true, row: r });
                              }}
                            >
                              Drill (verify)
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-slate-500" colSpan={7}>
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
            <DialogTitle>Gerar backup do tenant (empresa ativa)</DialogTitle>
            <DialogDescription>Dispara o workflow `Tenant Backup (Empresa)` no GitHub Actions.</DialogDescription>
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
            <div className="space-y-1 sm:col-span-2">
              <div className="text-xs text-slate-600">Label (opcional)</div>
              <input
                value={backupLabel}
                onChange={(e) => setBackupLabel(e.target.value)}
                placeholder="ex.: antes-limpeza-stripe"
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
            <DialogTitle>Restaurar tenant</DialogTitle>
            <DialogDescription>
              Isso sobrescreve os registros da empresa ativa no banco alvo. Use preferencialmente em `dev/verify`. Para `prod`, é exigido confirm.
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
                  placeholder="RESTORE_PROD_TENANT"
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

      <Dialog open={drillOpen} onOpenChange={setDrillOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Restore drill (verify)</DialogTitle>
            <DialogDescription>
              Restaura o <span className="font-semibold">último backup catalogado</span> do tenant em <span className="font-mono">prod</span> para o banco{' '}
              <span className="font-mono">verify</span>. Não toca em produção.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-gray-200 bg-slate-50 p-3 text-sm text-slate-700">
            Recomendações:
            <ul className="list-disc pl-5">
              <li>Gere um backup em prod imediatamente antes do drill.</li>
              <li>Após o restore, valide os dados mínimos no verify e confirme que o login/assinatura funcionam.</li>
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDrillOpen(false)} disabled={drillBusy}>
              Cancelar
            </Button>
            <Button onClick={onDispatchRestoreDrillVerify} disabled={drillBusy}>
              {drillBusy ? 'Disparando…' : 'Disparar restore drill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

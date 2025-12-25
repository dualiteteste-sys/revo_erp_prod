import React, { useEffect, useMemo, useState } from 'react';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import SearchField from '@/components/ui/forms/SearchField';
import GlassCard from '@/components/ui/GlassCard';
import { Loader2, RefreshCw, History } from 'lucide-react';

const TABLE_LABEL: Record<string, string> = {
  ordem_servicos: 'Ordem de Serviço',
  ordem_servico_itens: 'Itens da O.S.',
};

function labelOperation(op: AuditLogRow['operation']) {
  switch (op) {
    case 'INSERT':
      return 'Criado';
    case 'UPDATE':
      return 'Atualizado';
    case 'DELETE':
      return 'Excluído';
    default:
      return op;
  }
}

function getRelatedOsId(row: AuditLogRow) {
  const oldId = (row.old_data as any)?.ordem_servico_id ?? (row.old_data as any)?.ordem_id;
  const newId = (row.new_data as any)?.ordem_servico_id ?? (row.new_data as any)?.ordem_id;
  return String(newId ?? oldId ?? '');
}

function diffKeys(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  const keys = new Set<string>([
    ...Object.keys(oldData || {}),
    ...Object.keys(newData || {}),
  ]);
  const changed: string[] = [];
  for (const key of keys) {
    if (key === 'updated_at') continue;
    const a = (oldData || {})[key];
    const b = (newData || {})[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(key);
  }
  return changed;
}

function buildSummary(row: AuditLogRow) {
  if (row.operation === 'INSERT') return 'Registro criado.';
  if (row.operation === 'DELETE') return 'Registro excluído.';
  const keys = diffKeys(row.old_data, row.new_data);
  if (keys.length === 0) return 'Alteração registrada.';
  return `Campos: ${keys.slice(0, 4).join(', ')}${keys.length > 4 ? '…' : ''}`;
}

export default function OsAuditTrailPanel({ osId, limit = 200 }: { osId: string; limit?: number }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await listAuditLogsForTables(['ordem_servicos', 'ordem_servico_itens'], limit);
      setRows(data);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar histórico.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osId]);

  const scoped = useMemo(() => {
    const target = String(osId);
    const base = rows.filter((r) => r.record_id === target || getRelatedOsId(r) === target);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => {
      const blob = [
        r.table_name,
        r.operation,
        r.changed_at,
        JSON.stringify(r.old_data || {}),
        JSON.stringify(r.new_data || {}),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, osId, query]);

  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex items-center gap-2">
          <History className="text-blue-600" size={18} />
          <div>
            <div className="font-semibold text-gray-800">Histórico</div>
            <div className="text-xs text-gray-500">Auditoria de alterações na O.S. e itens.</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <SearchField
            placeholder="Filtrar histórico..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-sm"
          />
          <Button variant="outline" onClick={load} className="gap-2">
            <RefreshCw size={16} />
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={28} />
        </div>
      ) : scoped.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">Nenhum evento encontrado.</div>
      ) : (
        <div className="mt-4 divide-y divide-gray-100">
          {scoped.slice(0, limit).map((r) => (
            <div key={r.id} className="py-3 flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-gray-800">
                  {labelOperation(r.operation)} • {TABLE_LABEL[r.table_name] || r.table_name}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(r.changed_at).toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="text-xs text-gray-600">{buildSummary(r)}</div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}


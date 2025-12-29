import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import Select from '@/components/ui/forms/Select';

type AuditLogRow = {
  id: string;
  empresa_id: string;
  table_name: string;
  record_id: string | null;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: any | null;
  new_data: any | null;
  changed_by: string | null;
  changed_at: string;
};

const OP_BADGE: Record<AuditLogRow['operation'], string> = {
  INSERT: 'bg-emerald-100 text-emerald-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
};

export default function AuditLogsPage() {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [tableFilter, setTableFilter] = useState<string>('');
  const [q, setQ] = useState('');

  const tables = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.table_name));
    return Array.from(set.values()).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tableFilter && r.table_name !== tableFilter) return false;
      if (!qLower) return true;
      return (
        r.table_name.toLowerCase().includes(qLower) ||
        (r.record_id || '').toLowerCase().includes(qLower) ||
        (r.changed_by || '').toLowerCase().includes(qLower) ||
        r.operation.toLowerCase().includes(qLower)
      );
    });
  }, [q, rows, tableFilter]);

  const fetchLogs = async () => {
    if (!activeEmpresa?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('audit_logs')
        .select('id,empresa_id,table_name,record_id,operation,old_data,new_data,changed_by,changed_at')
        .eq('empresa_id', activeEmpresa.id)
        .order('changed_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows((data || []) as AuditLogRow[]);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar auditoria.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresa?.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Auditoria</h1>
          <p className="text-sm text-gray-600 mt-1">
            Trilhas de mudanças no banco (triggers em tabelas críticas). Use para rastrear quem mudou o quê e quando.
          </p>
        </div>
        <button
          onClick={() => void fetchLogs()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tabela</label>
          <Select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="w-full">
            <option value="">Todas</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="table_name / record_id / changed_by / operation"
              className="w-full rounded-lg border border-gray-200 bg-white/70 pl-10 pr-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left p-3">Quando</th>
              <th className="text-left p-3">Operação</th>
              <th className="text-left p-3">Tabela</th>
              <th className="text-left p-3">Record</th>
              <th className="text-left p-3">Por</th>
              <th className="text-left p-3">Resumo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-600">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                  </span>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  Nenhum log encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="p-3 whitespace-nowrap">{new Date(r.changed_at).toLocaleString('pt-BR')}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${OP_BADGE[r.operation]}`}>
                      {r.operation}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap font-medium text-gray-800">{r.table_name}</td>
                  <td className="p-3 whitespace-nowrap font-mono text-xs text-gray-600">{r.record_id || '—'}</td>
                  <td className="p-3 whitespace-nowrap font-mono text-xs text-gray-600">{r.changed_by || '—'}</td>
                  <td className="p-3 text-gray-700">
                    <details>
                      <summary className="cursor-pointer text-blue-700 hover:underline">ver json</summary>
                      <pre className="mt-2 max-w-[760px] overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100">
                        {JSON.stringify({ old: r.old_data, new: r.new_data }, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


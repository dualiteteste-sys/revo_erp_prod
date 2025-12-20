import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';
import { Copy, RefreshCcw, Search } from 'lucide-react';

type Props = {
  ordemId: string;
  tables: string[];
  entityLabels?: Partial<Record<string, string>>;
  limit?: number;
  onNavigate?: (row: AuditLogRow) => void;
};

type DiffEntry = { oldValue: unknown; newValue: unknown };

const defaultEntityLabels: Record<string, string> = {
  industria_ordens: 'Ordem',
  industria_ordens_componentes: 'Componentes',
  industria_ordens_entregas: 'Entregas',
  industria_producao_ordens: 'Ordem',
  industria_producao_componentes: 'Componentes',
  industria_producao_entregas: 'Entregas',
  industria_producao_operacoes: 'Operações',
};

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeOrdemId(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function buildDiff(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): Record<string, DiffEntry> {
  const keys = new Set<string>([
    ...Object.keys(oldData || {}),
    ...Object.keys(newData || {}),
  ]);

  const diff: Record<string, DiffEntry> = {};
  for (const key of keys) {
    const oldValue = oldData ? oldData[key] : null;
    const newValue = newData ? newData[key] : null;
    if (safeJson(oldValue) !== safeJson(newValue)) {
      diff[key] = { oldValue, newValue };
    }
  }
  return diff;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function summarizeKeys(keys: string[], max = 3) {
  const shown = keys.slice(0, max);
  const rest = keys.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} (+${rest})` : shown.join(', ');
}

function humanizeKey(key: string) {
  const cleaned = key.replace(/_/g, ' ').trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const fieldLabels: Partial<Record<string, string>> = {
  id: 'ID',
  empresa_id: 'Empresa',
  numero: 'Número',
  status: 'Status',
  prioridade: 'Prioridade',
  unidade: 'Unidade',
  created_at: 'Criado em',
  updated_at: 'Atualizado em',
  documento_ref: 'Referência do documento',
  observacoes: 'Observações',
  produto_final_id: 'Produto final',
  produto_nome: 'Produto',
  cliente_id: 'Cliente',
  cliente_nome: 'Cliente',
  material_cliente_id: 'Material do cliente',
  material_cliente_nome: 'Material do cliente',
  material_cliente_codigo: 'Código do material (cliente)',
  material_cliente_unidade: 'Unidade (material do cliente)',
  quantidade_planejada: 'Quantidade planejada',
  quantidade: 'Quantidade',
  data_prevista_inicio: 'Início previsto',
  data_prevista_fim: 'Fim previsto',
  data_prevista_entrega: 'Entrega prevista',
  usa_material_cliente: 'Usa material do cliente',
  origem_ordem: 'Origem',
  roteiro_aplicado_id: 'Roteiro aplicado',
  roteiro_aplicado_desc: 'Roteiro aplicado',
  bom_aplicado_id: 'BOM aplicada',
  bom_aplicado_desc: 'BOM aplicada',
  reserva_modo: 'Reserva de estoque',
  tolerancia_overrun_percent: 'Tolerância overrun (%)',
  lote_producao: 'Lote de produção',
  ordem_id: 'Ordem',
  produto_id: 'Produto',
  quantidade_entregue: 'Quantidade entregue',
  data_entrega: 'Data da entrega',
  lote: 'Lote',
  centro_trabalho_id: 'Centro de trabalho',
  centro_trabalho_nome: 'Centro de trabalho',
  sequencia: 'Sequência',
};

function labelChangedField(tableName: string, key: string) {
  const direct = fieldLabels[key];
  if (direct) return direct;
  if (key.endsWith('_id')) return humanizeKey(key.replace(/_id$/, '')) + ' (ID)';
  return humanizeKey(key);
}

function labelOperation(operation: AuditLogRow['operation']) {
  if (operation === 'INSERT') return 'Inserido';
  if (operation === 'UPDATE') return 'Atualizado';
  if (operation === 'DELETE') return 'Excluído';
  return operation;
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : safeJson(value);
  const needsQuotes = /[",\n\r]/.test(raw);
  const escaped = raw.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function IndustriaAuditTrailPanel({ ordemId, tables, entityLabels, limit = 300, onNavigate }: Props) {
  const { userId } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const labels = useMemo(() => ({ ...defaultEntityLabels, ...(entityLabels || {}) }), [entityLabels]);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const data = await listAuditLogsForTables(tables, limit);
      setRows(data);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar histórico.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordemId, tables.join('|'), limit]);

  const filteredRows = useMemo(() => {
    const ordemIdString = String(ordemId);

    const scoped = rows.filter((r) => {
      if (r.record_id && String(r.record_id) === ordemIdString) return true;
      const oldOrdemId = normalizeOrdemId(r.old_data?.ordem_id);
      const newOrdemId = normalizeOrdemId(r.new_data?.ordem_id);
      return oldOrdemId === ordemIdString || newOrdemId === ordemIdString;
    });

    const q = query.trim().toLowerCase();
    if (!q) return scoped;

    return scoped.filter((r) => {
      const blob = [
        r.table_name,
        r.operation,
        r.record_id || '',
        r.changed_by || '',
        safeJson(r.old_data),
        safeJson(r.new_data),
      ].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [rows, ordemId, query]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => addToast('Copiado para a área de transferência!', 'success'),
      () => addToast('Falha ao copiar.', 'error')
    );
  };

  const handleExportCsv = () => {
    const exportRows = filteredRows.map((r) => {
      const diff = buildDiff(r.old_data, r.new_data);
      const keys = Object.keys(diff).map((k) => labelChangedField(r.table_name, k));
      const changedBy = r.changed_by ? (userId && r.changed_by === userId ? 'Você' : r.changed_by) : 'Sistema';
      return [
        r.changed_at,
        r.table_name,
        labels[r.table_name] || r.table_name,
        labelOperation(r.operation),
        changedBy,
        r.record_id || '',
        keys.join(';'),
      ];
    });

    const fileWhen = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadCsv(
      `historico-ordem-${ordemId}-${fileWhen}.csv`,
      ['changed_at', 'table_name', 'entity', 'operation', 'changed_by', 'record_id', 'changed_keys'],
      exportRows
    );
    addToast('CSV gerado.', 'success');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="font-semibold">Histórico</div>
          <span className="text-gray-400">•</span>
          <span>{filteredRows.length} evento(s)</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no histórico..."
              className="w-full sm:w-80 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={fetchRows}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            title="Recarregar histórico"
          >
            <RefreshCcw size={16} />
            Recarregar
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || filteredRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Exportar histórico filtrado em CSV"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Data/Hora</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Entidade</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Operação</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Usuário</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Alterações</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  Carregando histórico...
                </td>
              </tr>
            )}

            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  Nenhum evento encontrado.
                </td>
              </tr>
            )}

            {!loading && filteredRows.map((r) => {
              const diff = buildDiff(r.old_data, r.new_data);
              const keys = Object.keys(diff).map((k) => labelChangedField(r.table_name, k));
              const userLabel = r.changed_by
                ? (userId && r.changed_by === userId ? 'Você' : `${r.changed_by.slice(0, 8)}…`)
                : 'Sistema';
              const entityLabel = labels[r.table_name] || r.table_name;
              const opLabel = labelOperation(r.operation);
              const opClass =
                r.operation === 'INSERT'
                  ? 'bg-green-100 text-green-800'
                  : r.operation === 'DELETE'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800';

              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatWhen(r.changed_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{entityLabel}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${opClass}`}>
                      {opLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{userLabel}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {keys.length ? summarizeKeys(keys) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Detalhes do Histórico" size="5xl">
        {selected && (
          <AuditLogDetails
            row={selected}
            entityLabel={labels[selected.table_name] || selected.table_name}
            onCopy={copyToClipboard}
            onNavigate={onNavigate ? () => {
              onNavigate(selected);
              setSelected(null);
            } : null}
          />
        )}
      </Modal>
    </div>
  );
}

function AuditLogDetails({
  row,
  entityLabel,
  onCopy,
  onNavigate,
}: {
  row: AuditLogRow;
  entityLabel: string;
  onCopy: (text: string) => void;
  onNavigate: null | (() => void);
}) {
  const [activeTab, setActiveTab] = useState<'pk' | 'antesDepois' | 'diff'>('diff');
  const diff = useMemo(() => buildDiff(row.old_data, row.new_data), [row.old_data, row.new_data]);

  const opLabel = useMemo(() => labelOperation(row.operation), [row.operation]);

  const headerItems = [
    { label: 'Entidade', value: entityLabel },
    { label: 'Operação', value: opLabel },
    { label: 'Registro', value: row.record_id || '—' },
    { label: 'Data/Hora', value: formatWhen(row.changed_at) },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {headerItems.map((it) => (
          <div key={it.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{it.label}</div>
            <div className="text-sm font-semibold text-gray-800 break-all">{String(it.value)}</div>
          </div>
        ))}
      </div>

      {onNavigate && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNavigate}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ir para item
          </button>
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          <TabButton active={activeTab === 'diff'} onClick={() => setActiveTab('diff')}>
            Diff
          </TabButton>
          <TabButton active={activeTab === 'antesDepois'} onClick={() => setActiveTab('antesDepois')}>
            Antes/Depois
          </TabButton>
          <TabButton active={activeTab === 'pk'} onClick={() => setActiveTab('pk')}>
            PK
          </TabButton>
        </nav>
      </div>

      {activeTab === 'pk' && (
        <div className="relative">
          <button
            onClick={() => onCopy(safeJson({ table_name: row.table_name, record_id: row.record_id }))}
            className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-200 rounded-md"
            title="Copiar PK"
          >
            <Copy size={16} />
          </button>
          <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto font-mono max-h-[28rem]">
            <code>{safeJson({ table_name: row.table_name, record_id: row.record_id })}</code>
          </pre>
        </div>
      )}

      {activeTab === 'antesDepois' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="relative">
            <button
              onClick={() => onCopy(safeJson(row.old_data))}
              className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-200 rounded-md"
              title="Copiar Antes"
            >
              <Copy size={16} />
            </button>
            <h4 className="font-semibold mb-2">Antes</h4>
            <pre className="bg-red-50 p-4 rounded-lg text-sm overflow-auto font-mono max-h-[28rem]">
              <code>{safeJson(row.old_data)}</code>
            </pre>
          </div>
          <div className="relative">
            <button
              onClick={() => onCopy(safeJson(row.new_data))}
              className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-200 rounded-md"
              title="Copiar Depois"
            >
              <Copy size={16} />
            </button>
            <h4 className="font-semibold mb-2">Depois</h4>
            <pre className="bg-green-50 p-4 rounded-lg text-sm overflow-auto font-mono max-h-[28rem]">
              <code>{safeJson(row.new_data)}</code>
            </pre>
          </div>
        </div>
      )}

      {activeTab === 'diff' && (
        <div className="relative">
          <button
            onClick={() => onCopy(safeJson(diff))}
            className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-200 rounded-md"
            title="Copiar Diff"
          >
            <Copy size={16} />
          </button>
          {Object.keys(diff).length === 0 ? (
            <p className="text-gray-500">Nenhuma diferença registrada.</p>
          ) : (
            <div className="space-y-2 font-mono text-sm">
              {Object.entries(diff).map(([key, value]) => (
                <div key={key} className="p-3 border border-gray-200 rounded-md bg-white">
                  <div className="font-semibold text-gray-800">{key}</div>
                  <div className="flex flex-col lg:flex-row gap-2 mt-2">
                    <span className="bg-red-100 text-red-800 px-2 py-1 rounded-md break-all flex-1">
                      {safeJson(value.oldValue)}
                    </span>
                    <span className="hidden lg:block font-bold text-gray-500 self-center">&rarr;</span>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-md break-all flex-1">
                      {safeJson(value.newValue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${active
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }`}
    >
      {children}
    </button>
  );
}

import React from 'react';
import { Banknote, PlusCircle, Edit, Search, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { useToast } from '@/contexts/ToastProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { Switch } from '@/components/ui/switch';
import MeioPagamentoFormPanel from '@/components/cadastros/MeioPagamentoFormPanel';
import {
  MeioPagamentoAdminRow,
  MeioPagamentoTipo,
  listMeiosPagamentoAdmin,
  setMeioPagamentoAtivo,
} from '@/services/meiosPagamento';

export default function MeiosPagamentoPage() {
  const { addToast } = useToast();

  const [tipo, setTipo] = React.useState<MeioPagamentoTipo>('pagamento');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'ativo' | 'inativo'>('all');
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<MeioPagamentoAdminRow[]>([]);
  const [sort, setSort] = React.useState<SortState<string>>({ column: 'nome', direction: 'asc' });

  const [formOpen, setFormOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<MeioPagamentoAdminRow | null>(null);

  const columns: TableColumnWidthDef[] = [
    { id: 'nome', defaultWidth: 420, minWidth: 240 },
    { id: 'tipo', defaultWidth: 160, minWidth: 140 },
    { id: 'origem', defaultWidth: 170, minWidth: 140 },
    { id: 'status', defaultWidth: 150, minWidth: 130 },
    { id: 'acoes', defaultWidth: 140, minWidth: 120 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'cadastros:meios-pagamento', columns });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMeiosPagamentoAdmin({ tipo, q: q.trim() || null, status: statusFilter, limit: 300 });
      setRows(data);
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao carregar.');
      addToast(msg, 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tipo, q, statusFilter, addToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const sorted = React.useMemo(() => {
    return sortRows(
      rows,
      sort as any,
      [
        { id: 'nome', type: 'string', getValue: (r) => r.nome ?? '' },
        { id: 'tipo', type: 'string', getValue: (r) => r.tipo ?? '' },
        { id: 'origem', type: 'string', getValue: (r) => (r.is_system ? 'Padrão' : 'Personalizada') },
        { id: 'status', type: 'boolean', getValue: (r) => Boolean(r.ativo) },
      ] as const,
    );
  }, [rows, sort]);

  const handleNew = () => {
    setSelected(null);
    setFormOpen(true);
  };

  const handleEdit = (r: MeioPagamentoAdminRow) => {
    if (r.is_system) {
      addToast('Itens padrão do sistema não podem ser editados (apenas ativar/inativar).', 'info');
      return;
    }
    setSelected(r);
    setFormOpen(true);
  };

  const handleToggleAtivo = async (r: MeioPagamentoAdminRow, next: boolean) => {
    const prev = rows;
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, ativo: next } : x)));
    try {
      await setMeioPagamentoAtivo({ id: r.id, tipo: r.tipo, ativo: next });
    } catch (e: any) {
      setRows(prev);
      const msg = String(e?.message || e || 'Erro ao atualizar status.');
      addToast(msg, 'error');
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Banknote className="text-blue-600" /> Meios de Pagamento/Recebimento
          </h1>
          <p className="text-gray-600 mt-1">
            Padronize a forma de pagar/receber e evite digitação livre nos lançamentos.
          </p>
        </div>
        <Button onClick={handleNew}>
          <PlusCircle className="mr-2 h-4 w-4" /> Novo
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow mb-4 p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex-grow">
          <Input
            name="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome…"
            startAdornment={<Search className="w-4 h-4" />}
          />
        </div>
        <Select value={tipo} onChange={(e) => setTipo(e.target.value as MeioPagamentoTipo)} className="min-w-[200px]">
          <option value="pagamento">Pagamento</option>
          <option value="recebimento">Recebimento</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="min-w-[200px]"
        >
          <option value="all">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow">
        <div className="overflow-auto max-h-full">
          <table className="min-w-full divide-y divide-gray-200">
            <TableColGroup columns={columns} widths={widths} />
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <ResizableSortableTh
                  columnId="nome"
                  label="Nome"
                  sort={sort as any}
                  onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                  onResizeStart={startResize as any}
                />
                <ResizableSortableTh
                  columnId="tipo"
                  label="Tipo"
                  sort={sort as any}
                  onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                  onResizeStart={startResize as any}
                />
                <ResizableSortableTh
                  columnId="origem"
                  label="Origem"
                  sort={sort as any}
                  onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                  onResizeStart={startResize as any}
                />
                <ResizableSortableTh
                  columnId="status"
                  label="Status"
                  sort={sort as any}
                  onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                  onResizeStart={startResize as any}
                />
                <ResizableSortableTh
                  columnId="acoes"
                  label="Ações"
                  align="right"
                  sortable={false}
                  resizable
                  onResizeStart={startResize as any}
                />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Carregando…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Nenhum resultado para os filtros.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{r.nome}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {r.tipo === 'pagamento' ? 'Pagamento' : 'Recebimento'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {r.is_system ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                          <Lock size={12} /> Padrão
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                          Personalizada
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <Switch checked={!!r.ativo} onCheckedChange={(next) => void handleToggleAtivo(r, next)} />
                        <span className={r.ativo ? 'text-green-600 font-medium' : 'text-gray-400'}>
                          {r.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(r)}
                        className={r.is_system ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:text-blue-900'}
                        title={r.is_system ? 'Padrão do sistema' : 'Editar'}
                        disabled={r.is_system}
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <MeioPagamentoFormPanel
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={selected}
        defaultTipo={tipo}
        onSaved={async () => {
          setFormOpen(false);
          await load();
        }}
      />
    </div>
  );
}

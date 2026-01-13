import React from 'react';
import { Banknote, Edit3, Plus, Search, Lock, ListPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Modal from '@/components/ui/Modal';
import Section from '@/components/ui/forms/Section';
import Toggle from '@/components/ui/forms/Toggle';
import { useToast } from '@/contexts/ToastProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { Switch } from '@/components/ui/switch';
import {
  MeioPagamentoAdminRow,
  MeioPagamentoTipo,
  bulkUpsertMeiosPagamento,
  listMeiosPagamentoAdmin,
  setMeioPagamentoAtivo,
  upsertMeioPagamento,
} from '@/services/meiosPagamento';

type NewRowState = {
  nome: string;
  ativo: boolean;
  saving: boolean;
};

export default function MeiosPagamentoPage() {
  const { addToast } = useToast();

  const [tipo, setTipo] = React.useState<MeioPagamentoTipo>('pagamento');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'ativo' | 'inativo'>('all');
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<MeioPagamentoAdminRow[]>([]);
  const [sort, setSort] = React.useState<SortState<string>>({ column: 'nome', direction: 'asc' });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState<string>('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const [newRow, setNewRow] = React.useState<NewRowState>({ nome: '', ativo: true, saving: false });

  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkTipo, setBulkTipo] = React.useState<MeioPagamentoTipo>('pagamento');
  const [bulkAtivo, setBulkAtivo] = React.useState(true);
  const [bulkText, setBulkText] = React.useState('');
  const [bulkSaving, setBulkSaving] = React.useState(false);

  const columns: TableColumnWidthDef[] = [
    { id: 'nome', defaultWidth: 420, minWidth: 240 },
    { id: 'tipo', defaultWidth: 160, minWidth: 140 },
    { id: 'origem', defaultWidth: 170, minWidth: 140 },
    { id: 'status', defaultWidth: 150, minWidth: 130 },
    { id: 'acoes', defaultWidth: 160, minWidth: 140 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'cadastros:meios-pagamento', columns });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMeiosPagamentoAdmin({ tipo, q: q.trim() || null, status: statusFilter, limit: 300 });
      setRows(data);
      if (editingId) {
        const current = data.find((r) => r.id === editingId);
        if (!current) setEditingId(null);
      }
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao carregar.');
      addToast(msg, 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tipo, q, statusFilter, addToast, editingId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setBulkTipo(tipo);
  }, [tipo]);

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

  const startEdit = (r: MeioPagamentoAdminRow) => {
    if (r.is_system) {
      addToast('Itens padrão do sistema não podem ser editados (apenas ativar/inativar).', 'info');
      return;
    }
    setEditingId(r.id);
    setEditValue(r.nome || '');
  };

  const commitEdit = async (r: MeioPagamentoAdminRow) => {
    const clean = editValue.trim();
    if (!clean) {
      addToast('Nome é obrigatório.', 'error');
      return;
    }
    if (clean === (r.nome || '').trim()) {
      setEditingId(null);
      return;
    }

    setSavingId(r.id);
    try {
      await upsertMeioPagamento({ id: r.id, tipo: r.tipo, nome: clean, ativo: r.ativo });
      setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, nome: clean } : x)));
      setEditingId(null);
      addToast('Atualizado.', 'success');
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao salvar.');
      addToast(msg, 'error');
    } finally {
      setSavingId(null);
    }
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

  const createNewRow = async () => {
    const clean = newRow.nome.trim();
    if (!clean) {
      addToast('Informe um nome.', 'error');
      return;
    }
    setNewRow((s) => ({ ...s, saving: true }));
    try {
      await upsertMeioPagamento({ tipo, nome: clean, ativo: newRow.ativo });
      setNewRow({ nome: '', ativo: true, saving: false });
      await load();
      addToast('Criado.', 'success');
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao criar.');
      addToast(msg, 'error');
      setNewRow((s) => ({ ...s, saving: false }));
    }
  };

  const parsedBulkNames = React.useMemo(() => {
    const lines = bulkText
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean);
    const unique = new Map<string, string>();
    for (const n of lines) unique.set(n.toLowerCase(), n);
    return Array.from(unique.values());
  }, [bulkText]);

  const runBulkAdd = async () => {
    if (parsedBulkNames.length === 0) {
      addToast('Cole pelo menos um item (um por linha).', 'error');
      return;
    }
    setBulkSaving(true);
    try {
      const res = await bulkUpsertMeiosPagamento({ tipo: bulkTipo, nomes: parsedBulkNames, ativo: bulkAtivo, limit: 500 });
      addToast(`Importado: ${res.inserted} novo(s), ${res.updated} atualizado(s).`, 'success');
      setBulkOpen(false);
      setBulkText('');
      await load();
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao importar.');
      addToast(msg, 'error');
    } finally {
      setBulkSaving(false);
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setBulkTipo(tipo);
              setBulkAtivo(true);
              setBulkOpen(true);
            }}
          >
            <ListPlus className="mr-2 h-4 w-4" /> Adicionar em massa
          </Button>
          <Button onClick={createNewRow} disabled={newRow.saving || !newRow.nome.trim()}>
            {newRow.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar linha
          </Button>
        </div>
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
                <>
                  <tr className="bg-blue-50/40">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Input
                        name="new-nome"
                        value={newRow.nome}
                        onChange={(e) => setNewRow((s) => ({ ...s, nome: e.target.value }))}
                        placeholder="Novo meio…"
                        disabled={newRow.saving}
                        className="max-w-[520px]"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {tipo === 'pagamento' ? 'Pagamento' : 'Recebimento'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                        Personalizada
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <Switch checked={!!newRow.ativo} onCheckedChange={(next) => setNewRow((s) => ({ ...s, ativo: next }))} />
                        <span className={newRow.ativo ? 'text-green-600 font-medium' : 'text-gray-400'}>
                          {newRow.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={createNewRow}
                        disabled={newRow.saving || !newRow.nome.trim()}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-40"
                        title="Salvar"
                      >
                        {newRow.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>

                  {sorted.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {editingId === r.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              className="h-10 w-full max-w-[520px] rounded-lg border border-gray-300 bg-white/80 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => void commitEdit(r)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void commitEdit(r);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingId(null);
                                }
                              }}
                              autoFocus
                              disabled={savingId === r.id}
                            />
                            {savingId === r.id ? <Loader2 className="h-4 w-4 animate-spin text-gray-500" /> : null}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            {r.nome}
                            {r.is_system ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                <Lock size={12} /> Sistema
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
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
                        onClick={() => startEdit(r)}
                        className={r.is_system ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:text-blue-900'}
                        title={r.is_system ? 'Padrão do sistema' : 'Editar nome'}
                        disabled={r.is_system || savingId === r.id}
                      >
                        <Edit3 size={18} />
                      </button>
                    </td>
                  </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} title="Adicionar em massa" size="lg">
        <div className="flex flex-col h-full">
          <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
            <Section
              title="Lista (um por linha)"
              description="Cole os meios (Pix, Boleto, etc.). Duplicados serão ignorados (case-insensitive) e, se já existirem, o status será atualizado."
            >
              <Select
                name="bulk-tipo"
                label="Tipo"
                value={bulkTipo}
                onChange={(e) => setBulkTipo(e.target.value as MeioPagamentoTipo)}
                className="sm:col-span-3"
                disabled={bulkSaving}
              >
                <option value="pagamento">Pagamento</option>
                <option value="recebimento">Recebimento</option>
              </Select>

              <div className="sm:col-span-3 mt-7">
                <Toggle
                  label="Ativo"
                  name="bulk-ativo"
                  checked={bulkAtivo}
                  onChange={setBulkAtivo}
                  description="Aplica o status para itens novos e existentes (mesmo nome)."
                />
              </div>

              <TextArea
                label="Itens"
                name="bulk-itens"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'Pix\nBoleto\nCartão de crédito\nCartão de débito\nTransferência'}
                rows={10}
                className="sm:col-span-6"
                disabled={bulkSaving}
              />

              <div className="sm:col-span-6 text-xs text-gray-500">
                {parsedBulkNames.length} item(ns) único(s) detectado(s).
              </div>
            </Section>
          </div>

          <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
            <div className="flex gap-3">
              <button
                onClick={() => setBulkOpen(false)}
                disabled={bulkSaving}
                className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={runBulkAdd}
                disabled={bulkSaving || parsedBulkNames.length === 0}
                className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkSaving ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </footer>
        </div>
      </Modal>
    </div>
  );
}

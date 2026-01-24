import React from 'react';
import { Clock, Edit3, Plus, Search, Lock, ListPlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Modal from '@/components/ui/Modal';
import Section from '@/components/ui/forms/Section';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import { Switch } from '@/components/ui/switch';
import {
  CondicaoPagamentoAdminRow,
  CondicaoPagamentoTipo,
  deleteCondicaoPagamento,
  listCondicoesPagamentoAdmin,
  setCondicaoPagamentoAtivo,
  upsertCondicaoPagamento,
} from '@/services/condicoesPagamento';

type NewRowState = {
  nome: string;
  condicao: string;
  ativo: boolean;
  saving: boolean;
};

export default function CondicoesPagamentoPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  const [tipo, setTipo] = React.useState<CondicaoPagamentoTipo>('ambos');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'ativo' | 'inativo'>('all');
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<CondicaoPagamentoAdminRow[]>([]);
  const [sort, setSort] = React.useState<SortState<string>>({ column: 'nome', direction: 'asc' });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editNome, setEditNome] = React.useState<string>('');
  const [editCondicao, setEditCondicao] = React.useState<string>('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const [newRow, setNewRow] = React.useState<NewRowState>({ nome: '', condicao: '', ativo: true, saving: false });

  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkTipo, setBulkTipo] = React.useState<CondicaoPagamentoTipo>('ambos');
  const [bulkAtivo, setBulkAtivo] = React.useState(true);
  const [bulkText, setBulkText] = React.useState('');
  const [bulkSaving, setBulkSaving] = React.useState(false);

  const columns: TableColumnWidthDef[] = [
    { id: 'nome', defaultWidth: 320, minWidth: 220 },
    { id: 'condicao', defaultWidth: 220, minWidth: 180 },
    { id: 'tipo', defaultWidth: 160, minWidth: 140 },
    { id: 'origem', defaultWidth: 170, minWidth: 140 },
    { id: 'status', defaultWidth: 150, minWidth: 130 },
    { id: 'acoes', defaultWidth: 180, minWidth: 160 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'cadastros:condicoes-pagamento', columns });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCondicoesPagamentoAdmin({ tipo, q: q.trim() || null, status: statusFilter, limit: 400 });
      setRows(data);
      if (editingId) {
        const current = data.find((r) => r.id === editingId);
        if (!current) setEditingId(null);
      }
    } catch (e: any) {
      addToast(String(e?.message || e || 'Erro ao carregar.'), 'error');
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
        { id: 'condicao', type: 'string', getValue: (r) => r.condicao ?? '' },
        { id: 'tipo', type: 'string', getValue: (r) => r.tipo ?? '' },
        { id: 'origem', type: 'string', getValue: (r) => (r.is_system ? 'Padrão' : 'Personalizada') },
        { id: 'status', type: 'boolean', getValue: (r) => Boolean(r.ativo) },
      ] as const,
    );
  }, [rows, sort]);

  const startEdit = (r: CondicaoPagamentoAdminRow) => {
    if (r.is_system) {
      addToast('Itens padrão do sistema não podem ser editados.', 'info');
      return;
    }
    setEditingId(r.id);
    setEditNome(r.nome || '');
    setEditCondicao(r.condicao || '');
  };

  const commitEdit = async (r: CondicaoPagamentoAdminRow) => {
    const cleanNome = editNome.trim();
    const cleanCond = editCondicao.trim();
    if (!cleanNome) {
      addToast('Nome é obrigatório.', 'error');
      return;
    }
    if (!cleanCond) {
      addToast('Condição é obrigatória.', 'error');
      return;
    }
    if (cleanNome === (r.nome || '').trim() && cleanCond === (r.condicao || '').trim()) {
      setEditingId(null);
      return;
    }

    setSavingId(r.id);
    try {
      await upsertCondicaoPagamento({ id: r.id, tipo: r.tipo, nome: cleanNome, condicao: cleanCond, ativo: r.ativo });
      setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, nome: cleanNome, condicao: cleanCond } : x)));
      setEditingId(null);
      addToast('Atualizado.', 'success');
    } catch (e: any) {
      addToast(String(e?.message || e || 'Erro ao salvar.'), 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (r: CondicaoPagamentoAdminRow) => {
    if (r.is_system) {
      addToast('Não é possível excluir condições padrão do sistema.', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Excluir condição',
      description: `Deseja excluir "${r.nome}"?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteCondicaoPagamento({ id: r.id, tipo: r.tipo });
      addToast('Condição excluída.', 'success');
      await load();
    } catch (e: any) {
      addToast(String(e?.message || e || 'Não foi possível excluir.'), 'error');
    }
  };

  const handleToggleAtivo = async (r: CondicaoPagamentoAdminRow, next: boolean) => {
    const prev = rows;
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, ativo: next } : x)));
    try {
      await setCondicaoPagamentoAtivo({ id: r.id, tipo: r.tipo, ativo: next });
    } catch (e: any) {
      setRows(prev);
      addToast(String(e?.message || e || 'Erro ao atualizar status.'), 'error');
    }
  };

  const createNewRow = async () => {
    const cleanNome = newRow.nome.trim();
    const cleanCond = newRow.condicao.trim();
    if (!cleanNome) {
      addToast('Informe um nome.', 'error');
      return;
    }
    if (!cleanCond) {
      addToast('Informe a condição (ex.: 30/60/90).', 'error');
      return;
    }
    setNewRow((s) => ({ ...s, saving: true }));
    try {
      await upsertCondicaoPagamento({ tipo, nome: cleanNome, condicao: cleanCond, ativo: newRow.ativo });
      setNewRow({ nome: '', condicao: '', ativo: true, saving: false });
      await load();
      addToast('Criado.', 'success');
    } catch (e: any) {
      addToast(String(e?.message || e || 'Erro ao criar.'), 'error');
      setNewRow((s) => ({ ...s, saving: false }));
    }
  };

  const parsedBulkCondicoes = React.useMemo(() => {
    const lines = bulkText
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean);
    const unique = new Map<string, string>();
    for (const c of lines) unique.set(c.toLowerCase(), c);
    return Array.from(unique.values());
  }, [bulkText]);

  const runBulkAdd = async () => {
    if (parsedBulkCondicoes.length === 0) {
      addToast('Cole pelo menos uma condição (uma por linha).', 'error');
      return;
    }
    setBulkSaving(true);
    try {
      for (const condicao of parsedBulkCondicoes) {
        await upsertCondicaoPagamento({ tipo: bulkTipo, nome: condicao, condicao, ativo: bulkAtivo });
      }
      addToast(`Importadas: ${parsedBulkCondicoes.length} condição(ões).`, 'success');
      setBulkOpen(false);
      setBulkText('');
      await load();
    } catch (e: any) {
      addToast(String(e?.message || e || 'Erro ao importar.'), 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Clock className="text-blue-600" /> Condições de Pagamento
          </h1>
          <p className="text-gray-600 mt-1">
            Cadastre prazos/parcelas (ex.: 21 dias, 30 dias, 30/60) para usar em vendas, compras e financeiro.
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
          <Button onClick={createNewRow} disabled={newRow.saving || !newRow.nome.trim() || !newRow.condicao.trim()}>
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
            placeholder="Buscar por nome ou condição…"
            startAdornment={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-full md:w-52">
          <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as CondicaoPagamentoTipo)}>
            <option value="ambos">Ambos</option>
            <option value="receber">Receber</option>
            <option value="pagar">Pagar</option>
          </Select>
        </div>
        <div className="w-full md:w-48">
          <Select name="status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-1">
        <div className="p-4 border-b">
          <Section title="Nova condição" description="Dica: use 30/60/90 para parcelamento, ou 21 para prazo único.">
            <Input
              className="sm:col-span-3"
              label="Nome"
              value={newRow.nome}
              onChange={(e) => setNewRow((s) => ({ ...s, nome: e.target.value }))}
              placeholder="Ex.: 30/60/90"
            />
            <Input
              className="sm:col-span-2"
              label="Condição"
              value={newRow.condicao}
              onChange={(e) => setNewRow((s) => ({ ...s, condicao: e.target.value }))}
              placeholder="Ex.: 30/60/90 ou 21"
            />
            <div className="sm:col-span-1 flex items-end gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-700 mb-1">Ativo</div>
                <div className="h-11 flex items-center">
                  <Switch checked={newRow.ativo} onCheckedChange={(v) => setNewRow((s) => ({ ...s, ativo: v }))} />
                </div>
              </div>
            </div>
          </Section>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 flex justify-center items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="overflow-auto h-full">
            <table className="min-w-full divide-y divide-gray-200">
              <TableColGroup widths={widths} columns={columns} />
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <ResizableSortableTh
                    id="nome"
                    width={widths.nome}
                    onResizeStart={startResize('nome')}
                    sort={sort}
                    onSort={(id) => setSort((s) => toggleSort(s, id))}
                  >
                    Nome
                  </ResizableSortableTh>
                  <ResizableSortableTh
                    id="condicao"
                    width={widths.condicao}
                    onResizeStart={startResize('condicao')}
                    sort={sort}
                    onSort={(id) => setSort((s) => toggleSort(s, id))}
                  >
                    Condição
                  </ResizableSortableTh>
                  <ResizableSortableTh
                    id="tipo"
                    width={widths.tipo}
                    onResizeStart={startResize('tipo')}
                    sort={sort}
                    onSort={(id) => setSort((s) => toggleSort(s, id))}
                  >
                    Tipo
                  </ResizableSortableTh>
                  <ResizableSortableTh id="origem" width={widths.origem} onResizeStart={startResize('origem')} sort={sort} onSort={(id) => setSort((s) => toggleSort(s, id))}>
                    Origem
                  </ResizableSortableTh>
                  <ResizableSortableTh id="status" width={widths.status} onResizeStart={startResize('status')} sort={sort} onSort={(id) => setSort((s) => toggleSort(s, id))}>
                    Status
                  </ResizableSortableTh>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-[180px]">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sorted.map((r) => {
                  const isEditing = editingId === r.id;
                  const isSaving = savingId === r.id;
                  return (
                    <tr key={r.id} className={r.ativo ? '' : 'opacity-60'}>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                        ) : (
                          <span className="font-medium text-gray-900">{r.nome}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <Input value={editCondicao} onChange={(e) => setEditCondicao(e.target.value)} />
                        ) : (
                          <span className="font-mono text-gray-800">{r.condicao}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {r.tipo === 'ambos' ? 'Ambos' : r.tipo === 'receber' ? 'Receber' : 'Pagar'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {r.is_system ? (
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <Lock className="w-4 h-4" /> Padrão
                          </span>
                        ) : (
                          'Personalizada'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <Switch checked={r.ativo} onCheckedChange={(v) => handleToggleAtivo(r, v)} disabled={r.is_system} />
                          <span>{r.ativo ? 'Ativo' : 'Inativo'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => commitEdit(r)} disabled={isSaving}>
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={isSaving}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEdit(r)} disabled={r.is_system}>
                              <Edit3 className="w-4 h-4 mr-1" /> Editar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDelete(r)} disabled={r.is_system}>
                              <Trash2 className="w-4 h-4 mr-1 text-red-600" /> Excluir
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Nenhuma condição encontrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} title="Adicionar condições em massa" size="2xl">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Tipo</div>
              <Select name="bulk_tipo" value={bulkTipo} onChange={(e) => setBulkTipo(e.target.value as CondicaoPagamentoTipo)}>
                <option value="ambos">Ambos</option>
                <option value="receber">Receber</option>
                <option value="pagar">Pagar</option>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-700 mb-1">Ativo</div>
                <div className="h-11 flex items-center">
                  <Switch checked={bulkAtivo} onCheckedChange={setBulkAtivo} />
                </div>
              </div>
            </div>
            <div className="flex items-end">
              <div className="text-sm text-gray-600">
                {parsedBulkCondicoes.length} item(ns) detectado(s)
              </div>
            </div>
          </div>

          <TextArea
            label="Cole uma condição por linha"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder={'Ex:\n21\n30\n30/60\n30/60/90'}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
              Cancelar
            </Button>
            <Button onClick={runBulkAdd} disabled={bulkSaving || parsedBulkCondicoes.length === 0}>
              {bulkSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Importar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

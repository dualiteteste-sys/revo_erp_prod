import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, PlusCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';
import {
  deleteAutomacaoVendas,
  enqueueAutomacaoNow,
  listAutomacoesVendas,
  upsertAutomacaoVendas,
  validateAutomacaoConfig,
  type VendaAutomacao,
} from '@/services/vendasMvp';
import { useAuth } from '@/contexts/AuthProvider';

type FormState = {
  id: string | null;
  nome: string;
  gatilho: string;
  enabled: boolean;
  configJson: string;
  entityId: string;
};

const emptyForm: FormState = { id: null, nome: '', gatilho: 'manual', enabled: true, configJson: '{}', entityId: '' };

export default function AutomacoesVendasPage() {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<VendaAutomacao[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [sort, setSort] = useState<SortState<string>>({ column: 'nome', direction: 'asc' });

  const columns: TableColumnWidthDef[] = [
    { id: 'nome', defaultWidth: 420, minWidth: 220 },
    { id: 'gatilho', defaultWidth: 180, minWidth: 160 },
    { id: 'ativa', defaultWidth: 120, minWidth: 100 },
    { id: 'acoes', defaultWidth: 240, minWidth: 200 },
  ];
  const { widths, startResize } = useTableColumnWidths({ tableId: 'vendas:automacoes', columns });
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const loadTokenRef = useRef(0);
  const actionTokenRef = useRef(0);
  const effectiveLoading = loading || empresaChanged;
  const effectiveRows = empresaChanged ? [] : rows;

  const sortedRows = useMemo(() => {
    return sortRows(
      effectiveRows,
      sort as any,
      [
        { id: 'nome', type: 'string', getValue: (r) => r.nome ?? '' },
        { id: 'gatilho', type: 'string', getValue: (r) => r.gatilho ?? '' },
        { id: 'ativa', type: 'boolean', getValue: (r) => Boolean(r.enabled) },
      ] as const
    );
  }, [effectiveRows, sort]);

  async function load() {
    const token = ++loadTokenRef.current;
    const empresaSnapshot = activeEmpresaId;

    if (authLoading) return;
    if (!empresaSnapshot) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await listAutomacoesVendas();
      if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setRows(data);
    } catch (e: any) {
      if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message || 'Falha ao carregar automações.', 'error');
      setRows([]);
    } finally {
      if (token !== loadTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTokenRef.current += 1;
    actionTokenRef.current += 1;
    lastEmpresaIdRef.current = activeEmpresaId;

    setRows([]);
    setIsOpen(false);
    setForm(emptyForm);
    setSaving(false);
    setRunning(false);
    setDeletingId(null);

    if (!activeEmpresaId) {
      setLoading(false);
      return;
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId]);

  const openNew = () => {
    setForm(emptyForm);
    setIsOpen(true);
  };

  const openEdit = (row: VendaAutomacao) => {
    setForm({
      id: row.id,
      nome: row.nome || '',
      gatilho: row.gatilho || 'manual',
      enabled: !!row.enabled,
      configJson: JSON.stringify(row.config ?? {}, null, 2),
      entityId: '',
    });
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
  };

  const parseConfig = (): any | null => {
    try {
      return JSON.parse(form.configJson || '{}');
    } catch {
      addToast('Config inválida (JSON).', 'error');
      return null;
    }
  };

  const validate = async () => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    const config = parseConfig();
    if (!config) return;
    try {
      const result = await validateAutomacaoConfig(config);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      if (result.ok) {
        addToast('Config válida.', 'success');
      } else {
        addToast(`Config inválida: ${result.errors.join('; ')}`, 'error');
      }
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message || 'Falha ao validar config.', 'error');
    }
  };

  const save = async () => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    if (!form.nome.trim()) {
      addToast('Informe o nome da automação.', 'error');
      return;
    }
    const config = parseConfig();
    if (!config) return;

    setSaving(true);
    try {
      await upsertAutomacaoVendas({
        id: form.id || undefined,
        nome: form.nome.trim(),
        gatilho: form.gatilho,
        enabled: form.enabled,
        config,
      } as any);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Automação salva.', 'success');
      close();
      await load();
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message || 'Falha ao salvar automação.', 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setSaving(false);
    }
  };

  const runNow = async () => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    if (!form.id) {
      addToast('Salve a automação antes de executar.', 'warning');
      return;
    }
    const entityId = form.entityId.trim();
    if (!entityId) {
      addToast('Informe o ID do Pedido (UUID) para executar.', 'warning');
      return;
    }
    const config = parseConfig();
    if (!config) return;

    setRunning(true);
    try {
      const valid = await validateAutomacaoConfig(config);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      if (!valid.ok) {
        addToast(`Config inválida: ${valid.errors.join('; ')}`, 'error');
        return;
      }

      await enqueueAutomacaoNow({
        automacaoId: form.id,
        entityId,
        gatilho: 'manual',
        payload: { pedido_id: entityId },
      });
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Automação enfileirada. O worker vai processar em até ~5 min.', 'success');
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message || 'Falha ao enfileirar automação.', 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setRunning(false);
    }
  };

  const remove = async (id: string) => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setDeletingId(id);
    try {
      await deleteAutomacaoVendas(id);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Automação removida.', 'success');
      await load();
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message || 'Falha ao remover automação.', 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setDeletingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center h-full items-center">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
      </div>
    );
  }

  if (!activeEmpresaId) {
    return <div className="p-4 text-gray-600">Selecione uma empresa para ver automações de vendas.</div>;
  }

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Bot className="text-blue-600" /> Automações (Vendas)
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: CRUD de regras/config (execução futura).</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Nova Automação
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {effectiveLoading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : effectiveRows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhuma automação cadastrada.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <TableColGroup columns={columns} widths={widths} />
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <ResizableSortableTh
                    columnId="nome"
                    label="Nome"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={sort as any}
                    onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResize as any}
                  />
                  <ResizableSortableTh
                    columnId="gatilho"
                    label="Gatilho"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={sort as any}
                    onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResize as any}
                  />
                  <ResizableSortableTh
                    columnId="ativa"
                    label="Ativa"
                    className="px-4 py-3 normal-case tracking-normal"
                    sort={sort as any}
                    onSort={(col) => setSort((prev) => toggleSort(prev as any, col))}
                    onResizeStart={startResize as any}
                  />
                  <ResizableSortableTh
                    columnId="acoes"
                    label="Ações"
                    align="right"
                    className="px-4 py-3 normal-case tracking-normal"
                    sortable={false}
                    resizable
                    onResizeStart={startResize as any}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                    <td className="px-4 py-3">{r.gatilho}</td>
                    <td className="px-4 py-3">{r.enabled ? 'Sim' : 'Não'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(r)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                          Editar
                        </button>
                        <button
                          onClick={() => remove(r.id)}
                          disabled={deletingId === r.id}
                          className="px-3 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {deletingId === r.id ? 'Removendo…' : 'Remover'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={close} title="Automação de Vendas (MVP)" size="3xl" bodyClassName="p-6 md:p-8">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-700">Nome</label>
            <input
              value={form.nome}
              onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Gatilho</label>
              <select
                value={form.gatilho}
                onChange={(e) => setForm((s) => ({ ...s, gatilho: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="manual">Manual</option>
                <option value="pedido_aprovado">Pedido aprovado</option>
                <option value="pedido_concluido">Pedido concluído</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-6 select-none">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
              />
              Ativa
            </label>
          </div>
          <div>
            <label className="text-sm text-gray-700">Config (JSON)</label>
            <textarea
              value={form.configJson}
              onChange={(e) => setForm((s) => ({ ...s, configJson: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg font-mono text-xs"
              rows={10}
            />
            <div className="mt-2 text-xs text-gray-500">
              Exemplo: <span className="font-mono">{'{"actions":[{"type":"expedicao_criar"}]}'}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-700">Executar agora (Pedido ID)</label>
              <input
                value={form.entityId}
                onChange={(e) => setForm((s) => ({ ...s, entityId: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg font-mono text-xs"
                placeholder="UUID do pedido"
              />
              <div className="mt-1 text-xs text-gray-500">
                Dica: pegue o ID ao abrir um pedido e copiar o UUID (debug) ou via banco.
              </div>
            </div>
            <div className="flex items-end justify-end gap-2">
              <button
                onClick={validate}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                Validar
              </button>
              <button
                onClick={runNow}
                disabled={running}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white font-bold hover:bg-black disabled:opacity-50"
              >
                {running ? 'Enfileirando…' : 'Executar agora'}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={close} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

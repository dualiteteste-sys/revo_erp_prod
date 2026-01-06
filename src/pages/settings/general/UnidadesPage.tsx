import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';

import { useToast } from '@/contexts/ToastProvider';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/hooks/useHasPermission';
import { deleteUnidade, listUnidades, setActiveUnidade, upsertUnidade, type Unidade } from '@/services/unidades';

type FormState = {
  id?: string;
  nome: string;
  codigo: string;
  ativo: boolean;
  is_default: boolean;
};

const emptyForm = (): FormState => ({ nome: '', codigo: '', ativo: true, is_default: false });

export default function UnidadesPage() {
  const { addToast } = useToast();
  const permView = useHasPermission('unidades', 'view');
  const permManage = useHasPermission('unidades', 'manage');
  const canView = !!permView.data;
  const canManage = !!permManage.data;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Unidade[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const list = await listUnidades();
      setRows(Array.isArray(list) ? list : []);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar unidades.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, canView]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      return a.nome.localeCompare(b.nome);
    });
  }, [rows]);

  const openCreate = () => {
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (u: Unidade) => {
    setForm({
      id: u.id,
      nome: u.nome,
      codigo: u.codigo || '',
      ativo: !!u.ativo,
      is_default: !!u.is_default,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!canManage) {
      addToast('Sem permissão para gerenciar unidades.', 'warning');
      return;
    }
    const nome = form.nome.trim();
    if (!nome) {
      addToast('Informe o nome da unidade.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await upsertUnidade({
        id: form.id,
        nome,
        codigo: form.codigo.trim() ? form.codigo.trim() : null,
        ativo: form.ativo,
        is_default: form.is_default,
      });
      addToast('Unidade salva.', 'success');
      setOpen(false);
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar unidade.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage) {
      addToast('Sem permissão para gerenciar unidades.', 'warning');
      return;
    }
    if (!confirm('Excluir esta unidade?')) return;
    try {
      await deleteUnidade(id);
      addToast('Unidade excluída.', 'success');
      await fetchAll();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir unidade.', 'error');
    }
  };

  const handleSetActive = async (id: string) => {
    setActiveUnitId(id);
    try {
      await setActiveUnidade(id);
      addToast('Unidade ativa atualizada.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao definir unidade ativa.', 'error');
    } finally {
      setActiveUnitId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Unidades / Filiais</h1>
          <p className="text-sm text-gray-600 mt-1">
            Cadastre unidades (filiais) para organizar a operação. No futuro, estoque/PDV/fiscal podem ser segmentados por unidade — sem retrabalho.
          </p>
        </div>
        {canManage ? (
          <Button className="gap-2" onClick={openCreate}>
            <Plus size={16} />
            Nova unidade
          </Button>
        ) : null}
      </div>

      {!canView ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Você não tem permissão para ver unidades. Peça acesso a <span className="font-mono">unidades:view</span>.
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white/70 p-8 text-center">
          <Building2 className="mx-auto text-gray-400" size={42} />
          <div className="mt-3 text-lg font-semibold text-gray-800">Nenhuma unidade cadastrada</div>
          <div className="mt-1 text-sm text-gray-600">
            Crie sua matriz mínima (ex.: Matriz/Filial) para facilitar o crescimento.
          </div>
          {canManage ? (
            <Button className="mt-4 gap-2" onClick={openCreate}>
              <Plus size={16} /> Criar unidade
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sorted.map((u) => (
            <div key={u.id} className="rounded-2xl border border-gray-200 bg-white/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-base font-semibold text-gray-900 truncate">{u.nome}</div>
                    {u.is_default ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                        <Star size={12} /> Padrão
                      </span>
                    ) : null}
                    {!u.ativo ? (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                        Inativa
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Código: <span className="font-mono">{u.codigo || '—'}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500">
                    Atualizada em {new Date(u.updated_at).toLocaleString('pt-BR')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleSetActive(u.id)}
                    disabled={activeUnitId === u.id || !u.ativo}
                  >
                    {activeUnitId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
                    Usar
                  </Button>
                  {canManage ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(u)} className="gap-2">
                        <Pencil size={16} />
                        Editar
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleDelete(u.id)}
                        className="gap-2 text-red-700 hover:text-red-800"
                      >
                        <Trash2 size={16} />
                        Excluir
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={form.id ? 'Editar unidade' : 'Nova unidade'}>
        <div className="space-y-4">
          <Input
            label="Nome"
            value={form.nome}
            onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
            placeholder="Ex.: Matriz / Filial Centro"
          />
          <Input
            label="Código (opcional)"
            value={form.codigo}
            onChange={(e) => setForm((s) => ({ ...s, codigo: e.target.value }))}
            placeholder="Ex.: MTZ / F01"
          />

          <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white/60 p-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((s) => ({ ...s, ativo: e.target.checked }))}
              />
              Ativa
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((s) => ({ ...s, is_default: e.target.checked }))}
              />
              Definir como padrão
            </label>
            <div className="text-[11px] text-gray-500">
              A unidade padrão é usada como fallback quando o usuário não escolheu uma unidade ativa.
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


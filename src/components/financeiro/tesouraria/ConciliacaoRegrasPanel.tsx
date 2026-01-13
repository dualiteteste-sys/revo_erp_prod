import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import CentroDeCustoDropdown from '@/components/common/CentroDeCustoDropdown';
import Modal from '@/components/ui/Modal';
import type { ContaCorrente } from '@/services/treasury';
import { deleteConciliacaoRegra, listConciliacaoRegras, type ConciliacaoRegra, upsertConciliacaoRegra } from '@/services/conciliacaoRegras';

type Props = {
  contas: ContaCorrente[];
  selectedContaId: string | null;
  setSelectedContaId: (id: string | null) => void;
};

export default function ConciliacaoRegrasPanel({ contas, selectedContaId, setSelectedContaId }: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ConciliacaoRegra[]>([]);
  const [q, setQ] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<ConciliacaoRegra>>({
    tipo_lancamento: 'debito',
    match_text: '',
    ativo: true,
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      return (
        r.match_text.toLowerCase().includes(term) ||
        (r.categoria || '').toLowerCase().includes(term) ||
        (r.centro_custo || '').toLowerCase().includes(term) ||
        (r.descricao_override || '').toLowerCase().includes(term)
      );
    });
  }, [q, rows]);

  const refresh = async () => {
    if (!selectedContaId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listConciliacaoRegras(selectedContaId);
      setRows(data);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar regras.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContaId]);

  const openNew = () => {
    if (!selectedContaId) {
      addToast('Selecione uma conta corrente primeiro.', 'warning');
      return;
    }
    setDraft({
      conta_corrente_id: selectedContaId,
      tipo_lancamento: 'debito',
      match_text: '',
      min_valor: null,
      max_valor: null,
      categoria: '',
      centro_custo: '',
      descricao_override: '',
      observacoes: '',
      ativo: true,
    });
    setIsOpen(true);
  };

  const save = async () => {
    if (!selectedContaId) return;
    const match = String(draft.match_text || '').trim();
    if (!match) {
      addToast('Informe o texto de match (parte da descrição).', 'warning');
      return;
    }
    setSaving(true);
    try {
      await upsertConciliacaoRegra({
        id: draft.id,
        conta_corrente_id: selectedContaId,
        tipo_lancamento: (draft.tipo_lancamento as any) || 'debito',
        match_text: match,
        min_valor: draft.min_valor === null || draft.min_valor === undefined ? null : Number(draft.min_valor),
        max_valor: draft.max_valor === null || draft.max_valor === undefined ? null : Number(draft.max_valor),
        categoria: (draft.categoria || '').trim() || null,
        centro_custo: (draft.centro_custo || '').trim() || null,
        descricao_override: (draft.descricao_override || '').trim() || null,
        observacoes: (draft.observacoes || '').trim() || null,
        ativo: draft.ativo ?? true,
      });
      addToast('Regra salva.', 'success');
      setIsOpen(false);
      await refresh();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar regra.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: 'Remover regra',
      description: 'Remover esta regra de conciliação?',
      confirmText: 'Remover',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteConciliacaoRegra(id);
      addToast('Regra removida.', 'success');
      await refresh();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao remover regra.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="min-w-[260px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Conta Corrente</label>
          <select
            value={selectedContaId || ''}
            onChange={(e) => setSelectedContaId(e.target.value || null)}
            className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecione uma conta...</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading || !selectedContaId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Atualizar
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus size={18} /> Nova regra
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="max-w-md w-full">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar regra (texto/categoria/etc.)" />
        </div>
        <div className="text-xs text-gray-500">{filtered.length} regra(s)</div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center h-40 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma regra cadastrada.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((r) => (
              <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">
                    {r.tipo_lancamento === 'credito' ? 'Crédito' : 'Débito'} · contém “{r.match_text}”
                    {!r.ativo ? <span className="ml-2 text-xs text-gray-500">(inativa)</span> : null}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {r.min_valor != null || r.max_valor != null ? (
                      <span>
                        Valor:{' '}
                        {r.min_valor != null ? `>= ${r.min_valor}` : '—'} / {r.max_valor != null ? `<= ${r.max_valor}` : '—'}
                      </span>
                    ) : (
                      <span>Valor: qualquer</span>
                    )}
                    {r.categoria ? <span> · Categoria: {r.categoria}</span> : null}
                    {r.centro_custo ? <span> · Centro: {r.centro_custo}</span> : null}
                  </div>
                </div>
                <Button variant="outline" onClick={() => void remove(r.id)} className="gap-2">
                  <Trash2 size={16} /> Remover
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Nova regra de conciliação">
        <div className="space-y-4">
          <Select
            label="Tipo de lançamento"
            value={(draft.tipo_lancamento as any) || 'debito'}
            onChange={(e) => setDraft((p) => ({ ...p, tipo_lancamento: e.target.value as any }))}
          >
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
          </Select>
          <Input
            label="Texto a procurar na descrição *"
            value={String(draft.match_text || '')}
            onChange={(e) => setDraft((p) => ({ ...p, match_text: e.target.value }))}
            placeholder="Ex.: iFood, Mercado Livre, TED, Pix, Taxa..."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Valor mínimo (opcional)"
              type="number"
              value={draft.min_valor == null ? '' : String(draft.min_valor)}
              onChange={(e) => setDraft((p) => ({ ...p, min_valor: e.target.value === '' ? null : Number(e.target.value) }))}
            />
            <Input
              label="Valor máximo (opcional)"
              type="number"
              value={draft.max_valor == null ? '' : String(draft.max_valor)}
              onChange={(e) => setDraft((p) => ({ ...p, max_valor: e.target.value === '' ? null : Number(e.target.value) }))}
            />
          </div>
          <Input
            label="Categoria (sugestão)"
            value={String(draft.categoria || '')}
            onChange={(e) => setDraft((p) => ({ ...p, categoria: e.target.value }))}
            placeholder="Ex.: Vendas, Tarifas, Impostos..."
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Centro de custo (sugestão)</label>
            <CentroDeCustoDropdown
              valueName={draft.centro_custo || null}
              onChange={(_id, name) => setDraft((p) => ({ ...p, centro_custo: (name || '').trim() || null }))}
              placeholder="Selecionar…"
            />
            <div className="mt-1 text-xs text-gray-500">Usado para sugerir o centro nas movimentações geradas.</div>
          </div>
          <Input
            label="Descrição (override opcional)"
            value={String(draft.descricao_override || '')}
            onChange={(e) => setDraft((p) => ({ ...p, descricao_override: e.target.value }))}
            placeholder="Se preenchido, a movimentação gerada usa esta descrição."
          />
          <TextArea
            label="Observações (opcional)"
            value={String(draft.observacoes || '')}
            onChange={(e) => setDraft((p) => ({ ...p, observacoes: e.target.value }))}
            rows={3}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar regra
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import Section from '@/components/ui/forms/Section';
import Select from '@/components/ui/forms/Select';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, X } from 'lucide-react';
import { createOsEquipamento, listOsEquipamentos, type OsEquipamento, updateOsEquipamento } from '@/services/osEquipamentos';
import { useToast } from '@/contexts/ToastProvider';

type Props = {
  clienteId: string | null;
  equipamentoId: string | null;
  onChangeEquipamentoId: (id: string | null) => void;
  readOnly?: boolean;
};

type EquipamentoDraft = {
  id?: string;
  modelo: string;
  numero_serie: string;
  imei: string;
  acessorios: string;
  garantia_ate: string;
  observacoes: string;
};

function labelEquipamento(e: OsEquipamento) {
  const serie = e.numero_serie ? ` · Série: ${e.numero_serie}` : '';
  const imei = e.imei ? ` · IMEI: ${e.imei}` : '';
  return `${e.modelo}${serie}${imei}`;
}

export default function OsEquipamentoPanel({ clienteId, equipamentoId, onChangeEquipamentoId, readOnly }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [equipamentos, setEquipamentos] = useState<OsEquipamento[]>([]);
  const [q, setQ] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EquipamentoDraft>({
    modelo: '',
    numero_serie: '',
    imei: '',
    acessorios: '',
    garantia_ate: '',
    observacoes: '',
  });

  const selected = useMemo(() => equipamentos.find((e) => e.id === equipamentoId) || null, [equipamentoId, equipamentos]);

  const filteredEquipamentos = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return equipamentos;
    return equipamentos.filter((e) => {
      return (
        e.modelo.toLowerCase().includes(term) ||
        (e.numero_serie || '').toLowerCase().includes(term) ||
        (e.imei || '').toLowerCase().includes(term)
      );
    });
  }, [equipamentos, q]);

  const refresh = async (cid: string) => {
    setLoading(true);
    try {
      const rows = await listOsEquipamentos(cid, 100);
      setEquipamentos(rows);
    } catch (e: any) {
      setEquipamentos([]);
      addToast(e?.message || 'Erro ao carregar equipamentos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clienteId) {
      setEquipamentos([]);
      return;
    }
    void refresh(clienteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  useEffect(() => {
    if (!equipamentoId) return;
    if (equipamentos.some((e) => e.id === equipamentoId)) return;
    onChangeEquipamentoId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentoId, equipamentos]);

  const openCreate = () => {
    setDraft({
      modelo: '',
      numero_serie: '',
      imei: '',
      acessorios: '',
      garantia_ate: '',
      observacoes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setDraft({
      id: selected.id,
      modelo: selected.modelo || '',
      numero_serie: selected.numero_serie || '',
      imei: selected.imei || '',
      acessorios: selected.acessorios || '',
      garantia_ate: selected.garantia_ate ? String(selected.garantia_ate).slice(0, 10) : '',
      observacoes: selected.observacoes || '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!clienteId) return;
    const modelo = draft.modelo.trim();
    if (!modelo) {
      addToast('Informe o modelo do equipamento.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        cliente_id: clienteId,
        modelo,
        numero_serie: draft.numero_serie.trim() || null,
        imei: draft.imei.trim() || null,
        acessorios: draft.acessorios.trim() || null,
        garantia_ate: draft.garantia_ate ? draft.garantia_ate : null,
        observacoes: draft.observacoes.trim() || null,
      };

      const saved = draft.id ? await updateOsEquipamento(draft.id, payload) : await createOsEquipamento(payload);

      await refresh(clienteId);
      onChangeEquipamentoId(saved.id);
      setDialogOpen(false);
      addToast('Equipamento salvo.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar equipamento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section title="Equipamento" description="Vincule um equipamento do cliente para rastrear série/IMEI/garantia.">
        {!clienteId ? (
          <div className="sm:col-span-6 text-sm text-gray-600">
            Selecione um cliente primeiro para cadastrar ou vincular um equipamento.
          </div>
        ) : (
          <>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Equipamento</label>
              <Select
                value={equipamentoId || ''}
                onChange={(e) => onChangeEquipamentoId(e.target.value || null)}
                disabled={!!readOnly || loading}
                className="w-full"
              >
                <option value="">—</option>
                {filteredEquipamentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {labelEquipamento(e)}
                  </option>
                ))}
              </Select>
              {loading ? (
                <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
                </div>
              ) : null}
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Modelo, série ou IMEI" disabled={!!readOnly} />
            </div>

            <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-gray-500">
                Dica: use “Anexos” da OS para fotos do equipamento (ex.: fotos, laudo, acessórios).
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onChangeEquipamentoId(null)} disabled={!!readOnly || !equipamentoId}>
                  <X className="h-4 w-4 mr-2" /> Limpar
                </Button>
                <Button type="button" variant="outline" onClick={openEdit} disabled={!!readOnly || !selected}>
                  <Pencil className="h-4 w-4 mr-2" /> Editar
                </Button>
                <Button type="button" onClick={openCreate} disabled={!!readOnly}>
                  <Plus className="h-4 w-4 mr-2" /> Novo equipamento
                </Button>
              </div>
            </div>
          </>
        )}
      </Section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Editar equipamento' : 'Novo equipamento'}</DialogTitle>
            <DialogDescription>Campos mínimos: modelo. Série/IMEI ajudam a rastrear e evitar duplicidade.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <Input
              label="Modelo *"
              value={draft.modelo}
              onChange={(e) => setDraft((p) => ({ ...p, modelo: e.target.value }))}
              className="sm:col-span-6"
            />
            <Input
              label="Número de série"
              value={draft.numero_serie}
              onChange={(e) => setDraft((p) => ({ ...p, numero_serie: e.target.value }))}
              className="sm:col-span-3"
            />
            <Input
              label="IMEI"
              value={draft.imei}
              onChange={(e) => setDraft((p) => ({ ...p, imei: e.target.value }))}
              className="sm:col-span-3"
            />
            <Input
              label="Garantia até"
              type="date"
              value={draft.garantia_ate}
              onChange={(e) => setDraft((p) => ({ ...p, garantia_ate: e.target.value }))}
              className="sm:col-span-3"
            />
            <TextArea
              label="Acessórios"
              value={draft.acessorios}
              onChange={(e) => setDraft((p) => ({ ...p, acessorios: e.target.value }))}
              rows={3}
              className="sm:col-span-3"
            />
            <TextArea
              label="Observações"
              value={draft.observacoes}
              onChange={(e) => setDraft((p) => ({ ...p, observacoes: e.target.value }))}
              rows={3}
              className="sm:col-span-6"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar equipamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


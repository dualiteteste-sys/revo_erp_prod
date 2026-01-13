import React from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import { MeioPagamentoAdminRow, MeioPagamentoTipo, upsertMeioPagamento } from '@/services/meiosPagamento';

type Props = {
  open: boolean;
  onClose: () => void;
  initial?: MeioPagamentoAdminRow | null;
  defaultTipo?: MeioPagamentoTipo;
  onSaved: () => void;
};

export default function MeioPagamentoFormPanel({ open, onClose, initial, defaultTipo, onSaved }: Props) {
  const { addToast } = useToast();
  const isEdit = !!initial?.id;

  const [tipo, setTipo] = React.useState<MeioPagamentoTipo>(initial?.tipo ?? defaultTipo ?? 'pagamento');
  const [nome, setNome] = React.useState<string>(initial?.nome ?? '');
  const [ativo, setAtivo] = React.useState<boolean>(initial?.ativo ?? true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTipo(initial?.tipo ?? defaultTipo ?? 'pagamento');
    setNome(initial?.nome ?? '');
    setAtivo(initial?.ativo ?? true);
  }, [open, initial, defaultTipo]);

  const canEdit = !initial?.is_system;

  const handleSubmit = async () => {
    const clean = nome.trim();
    if (!clean) {
      addToast('Nome é obrigatório.', 'error');
      return;
    }
    if (!canEdit && isEdit) {
      addToast('Itens padrão do sistema não podem ser editados.', 'error');
      return;
    }

    setSaving(true);
    try {
      await upsertMeioPagamento({ id: initial?.id ?? null, tipo, nome: clean, ativo });
      addToast(isEdit ? 'Atualizado com sucesso!' : 'Criado com sucesso!', 'success');
      onSaved();
    } catch (e: any) {
      const msg = String(e?.message || e || 'Erro ao salvar.');
      addToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={isEdit ? 'Editar meio' : 'Novo meio'} size="md">
      <div className="space-y-4">
        <Select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as MeioPagamentoTipo)}
          disabled={saving || isEdit}
        >
          <option value="pagamento">Pagamento</option>
          <option value="recebimento">Recebimento</option>
        </Select>

        <Input
          name="nome"
          label="Nome"
          placeholder="Ex.: Pix, Boleto, Cartão…"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={saving || (isEdit && !canEdit)}
        />

        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white/70 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-gray-900">Ativo</div>
            <div className="text-xs text-gray-500">Disponível para seleção nos formulários.</div>
          </div>
          <Switch checked={ativo} onCheckedChange={setAtivo} disabled={saving} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}


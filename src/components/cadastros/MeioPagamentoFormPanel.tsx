import React from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import Section from '@/components/ui/forms/Section';
import Toggle from '@/components/ui/forms/Toggle';
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
      <div className="flex flex-col h-full">
        <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
          <Section
            title="Dados do meio"
            description="Defina como este meio aparecerá nos lançamentos. Itens padrão do sistema podem ser ativados/inativados."
          >
            <Select
              name="tipo"
              label="Tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as MeioPagamentoTipo)}
              disabled={saving || isEdit}
              className="sm:col-span-3"
              required
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
              className="sm:col-span-6"
              required
            />

            <div className="sm:col-span-6">
              <Toggle
                label="Ativo"
                name="ativo"
                checked={ativo}
                onChange={setAtivo}
                description="Disponível para seleção nos formulários."
              />
            </div>

            {isEdit && !canEdit ? (
              <div className="sm:col-span-6 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
                Este é um item padrão do sistema. Você pode ativar/inativar, mas não editar o nome.
              </div>
            ) : null}
          </Section>
        </div>

        <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

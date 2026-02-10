import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/button';
import { PlanoCaracteristica, PlanoCaracteristicaPayload, upsertPlanoCaracteristica } from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import UnidadeMedidaSelect from '@/components/common/UnidadeMedidaSelect';
import { useAuth } from '@/contexts/AuthProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  planoId: string;
  caracteristica?: PlanoCaracteristica | null;
  onSuccess: () => void;
}

interface FormState {
  descricao: string;
  tolerancia_min: string;
  tolerancia_max: string;
  unidade: string;
  instrumento: string;
}

const defaultState: FormState = {
  descricao: '',
  tolerancia_min: '',
  tolerancia_max: '',
  unidade: '',
  instrumento: ''
};

export default function PlanoCaracteristicaModal({ isOpen, onClose, planoId, caracteristica, onSuccess }: Props) {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [form, setForm] = useState<FormState>(defaultState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (caracteristica) {
      setForm({
        descricao: caracteristica.descricao,
        tolerancia_min: caracteristica.tolerancia_min?.toString() || '',
        tolerancia_max: caracteristica.tolerancia_max?.toString() || '',
        unidade: caracteristica.unidade || '',
        instrumento: caracteristica.instrumento || ''
      });
    } else {
      setForm(defaultState);
    }
  }, [isOpen, caracteristica]);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading || !activeEmpresaId) {
      addToast('Aguarde a troca de contexto (login/empresa) concluir para salvar.', 'info');
      return;
    }
    if (!form.descricao?.trim()) {
      addToast('Informe a descrição da característica.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: PlanoCaracteristicaPayload = {
        id: caracteristica?.id,
        plano_id: planoId,
        descricao: form.descricao.trim(),
        tolerancia_min: form.tolerancia_min ? Number(form.tolerancia_min) : null,
        tolerancia_max: form.tolerancia_max ? Number(form.tolerancia_max) : null,
        unidade: form.unidade ? form.unidade.trim().toUpperCase() : null,
        instrumento: form.instrumento || null
      };

      await upsertPlanoCaracteristica(payload);
      addToast('Característica salva com sucesso!', 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      addToast(error.message || 'Erro ao salvar característica.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={caracteristica ? 'Editar Característica' : 'Nova Característica'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <Input
          label="Descrição"
          value={form.descricao}
          onChange={(e) => handleChange('descricao', e.target.value)}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Tolerância Mínima"
            type="number"
            step="any"
            value={form.tolerancia_min}
            onChange={(e) => handleChange('tolerancia_min', e.target.value)}
            placeholder="Ex: -0.05"
          />
          <Input
            label="Tolerância Máxima"
            type="number"
            step="any"
            value={form.tolerancia_max}
            onChange={(e) => handleChange('tolerancia_max', e.target.value)}
            placeholder="Ex: 0.08"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UnidadeMedidaSelect
            label="Unidade (opcional)"
            name="unidade"
            value={form.unidade}
            onChange={(sigla) => handleChange('unidade', sigla || '')}
            placeholder="Selecione..."
          />
          <Input
            label="Instrumento"
            value={form.instrumento}
            onChange={(e) => handleChange('instrumento', e.target.value)}
            placeholder="Paquímetro, Micrômetro..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || authLoading || !activeEmpresaId}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

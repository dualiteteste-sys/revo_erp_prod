import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import { TreinamentoParticipante } from '@/services/rh';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Toggle from '@/components/ui/forms/Toggle';
import { Loader2, Save } from 'lucide-react';

interface ParticipanteModalProps {
  isOpen: boolean;
  onClose: () => void;
  participante: TreinamentoParticipante;
  onSave: (id: string, data: any) => Promise<void>;
}

const ParticipanteModal: React.FC<ParticipanteModalProps> = ({ isOpen, onClose, participante, onSave }) => {
  const [formData, setFormData] = useState<Partial<TreinamentoParticipante>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData({
      status: participante.status,
      nota_final: participante.nota_final,
      certificado_url: participante.certificado_url,
      parecer_eficacia: participante.parecer_eficacia,
      eficacia_avaliada: participante.eficacia_avaliada,
    });
  }, [participante]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(participante.colaborador_id, formData);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Gerenciar Participante: ${participante.nome}`} size="lg">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Status"
            name="status"
            value={formData.status || 'inscrito'}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
          >
            <option value="inscrito">Inscrito</option>
            <option value="confirmado">Confirmado</option>
            <option value="concluido">Concluído</option>
            <option value="reprovado">Reprovado</option>
            <option value="ausente">Ausente</option>
          </Select>

          <Input
            label="Nota Final (0-10)"
            name="nota_final"
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={formData.nota_final || ''}
            onChange={(e) => setFormData({ ...formData, nota_final: parseFloat(e.target.value) || null })}
          />
        </div>

        <Input
          label="URL do Certificado / Evidência"
          name="certificado_url"
          value={formData.certificado_url || ''}
          onChange={(e) => setFormData({ ...formData, certificado_url: e.target.value })}
          placeholder="https://drive.google.com/..."
        />

        <div className="border-t pt-4 mt-4">
          <h4 className="font-semibold text-gray-800 mb-2">Avaliação de Eficácia (ISO 9001)</h4>
          <div className="mb-4">
            <Toggle
              label="Eficácia Avaliada?"
              name="eficacia_avaliada"
              checked={!!formData.eficacia_avaliada}
              onChange={(checked) => setFormData({ ...formData, eficacia_avaliada: checked })}
              description="Marque se o treinamento atingiu o objetivo proposto para este colaborador."
            />
          </div>
          <TextArea
            label="Parecer de Eficácia"
            name="parecer_eficacia"
            value={formData.parecer_eficacia || ''}
            onChange={(e) => setFormData({ ...formData, parecer_eficacia: e.target.value })}
            rows={3}
            placeholder="Descreva como o treinamento melhorou a competência do colaborador..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Salvar Alterações
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ParticipanteModal;

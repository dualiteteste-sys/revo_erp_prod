import React, { useState, useEffect } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { CrmOportunidade, OportunidadePayload, saveOportunidade, deleteOportunidade, getCrmKanbanData } from '@/services/crm';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import { useNumericField } from '@/hooks/useNumericField';

interface Props {
  deal: CrmOportunidade | null;
  funilId: string;
  etapaId: string; // Default stage for new deals
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function DealFormPanel({ deal, funilId, etapaId, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentFunilId, setCurrentFunilId] = useState(funilId);
  
  const [formData, setFormData] = useState<OportunidadePayload>({
    funil_id: funilId,
    etapa_id: etapaId,
    prioridade: 'media',
    status: 'aberto',
    valor: 0,
  });

  const valorProps = useNumericField(formData.valor, (v) => handleChange('valor', v));

  useEffect(() => {
    const init = async () => {
        if (deal) {
            setFormData(deal);
            setCurrentFunilId(deal.funil_id || funilId);
        } else {
            // If creating new, ensure we have a funil_id
            if (!funilId) {
                const kanban = await getCrmKanbanData();
                if (kanban?.funil_id) {
                    setCurrentFunilId(kanban.funil_id);
                    setFormData(prev => ({ ...prev, funil_id: kanban.funil_id! }));
                }
            }
        }
    };
    init();
  }, [deal, funilId]);

  const handleChange = (field: keyof OportunidadePayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.titulo) {
      addToast('O título da oportunidade é obrigatório.', 'error');
      return;
    }
    if (!formData.funil_id) {
        // Fallback if still missing
        addToast('Erro: Funil de vendas não identificado.', 'error');
        return;
    }

    setIsSaving(true);
    try {
      await saveOportunidade(formData);
      addToast('Oportunidade salva com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deal?.id) return;
    const ok = await confirm({
      title: 'Excluir oportunidade',
      description: 'Tem certeza que deseja excluir esta oportunidade? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
        await deleteOportunidade(deal.id);
        addToast('Oportunidade excluída.', 'success');
        onSaveSuccess();
    } catch(e: any) {
        addToast(e.message, 'error');
        setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Detalhes da Oportunidade" description="Informações sobre o negócio.">
          <Input 
            label="Título" 
            name="titulo" 
            value={formData.titulo || ''} 
            onChange={e => handleChange('titulo', e.target.value)} 
            required 
            className="sm:col-span-6" 
            placeholder="Ex: Projeto de Consultoria XYZ"
          />
          
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={deal?.cliente_nome}
              onChange={(id) => handleChange('cliente_id', id)}
            />
          </div>

          <Input 
            label="Valor Estimado (R$)" 
            name="valor" 
            {...valorProps}
            className="sm:col-span-2" 
          />

          <Select 
            label="Prioridade" 
            name="prioridade" 
            value={formData.prioridade || 'media'} 
            onChange={e => handleChange('prioridade', e.target.value)}
            className="sm:col-span-2"
          >
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </Select>

          <Input 
            label="Fechamento Previsto" 
            name="data" 
            type="date"
            value={formData.data_fechamento || ''} 
            onChange={e => handleChange('data_fechamento', e.target.value)} 
            className="sm:col-span-2" 
          />

          <Select 
            label="Status" 
            name="status" 
            value={formData.status || 'aberto'} 
            onChange={e => handleChange('status', e.target.value)}
            className="sm:col-span-2"
          >
            <option value="aberto">Em Aberto</option>
            <option value="ganho">Ganho</option>
            <option value="perdido">Perdido</option>
          </Select>

          <TextArea 
            label="Observações" 
            name="obs" 
            value={formData.observacoes || ''} 
            onChange={e => handleChange('observacoes', e.target.value)} 
            rows={4} 
            className="sm:col-span-6" 
          />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-between items-center border-t border-white/20 bg-gray-50">
        <div>
            {deal?.id && (
                <button 
                    onClick={handleDelete} 
                    disabled={isDeleting}
                    className="text-red-600 hover:text-red-800 p-2 rounded hover:bg-red-50 transition-colors"
                    title="Excluir"
                >
                    {isDeleting ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                </button>
            )}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
}

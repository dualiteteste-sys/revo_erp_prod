import React, { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { CargoDetails, CargoPayload, Competencia, listCompetencias, saveCargo } from '@/services/rh';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';
import { motion, AnimatePresence } from 'framer-motion';

interface CargoFormPanelProps {
  cargo: CargoDetails | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

const CargoFormPanel: React.FC<CargoFormPanelProps> = ({ cargo, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CargoPayload>({});
  const [availableCompetencias, setAvailableCompetencias] = useState<Competencia[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>('');

  useEffect(() => {
    const loadCompetencias = async () => {
      try {
        const data = await listCompetencias();
        setAvailableCompetencias(data);
      } catch (error) {
        console.error(error);
      }
    };
    loadCompetencias();

    if (cargo) {
      setFormData(cargo);
    } else {
      setFormData({ ativo: true, competencias: [] });
    }
  }, [cargo]);

  const handleFormChange = (field: keyof CargoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddCompetencia = () => {
    if (!selectedCompId) return;
    const comp = availableCompetencias.find(c => c.id === selectedCompId);
    if (!comp) return;

    const exists = formData.competencias?.some(c => c.competencia_id === selectedCompId);
    if (exists) {
      addToast('Esta competência já foi adicionada.', 'warning');
      return;
    }

    setFormData(prev => ({
      ...prev,
      competencias: [
        ...(prev.competencias || []),
        {
          competencia_id: selectedCompId,
          nome: comp.nome,
          tipo: comp.tipo,
          nivel_requerido: 3,
          obrigatorio: true
        }
      ]
    }));
    setSelectedCompId('');
  };

  const handleRemoveCompetencia = (compId: string) => {
    setFormData(prev => ({
      ...prev,
      competencias: prev.competencias?.filter(c => c.competencia_id !== compId)
    }));
  };

  const handleUpdateCompetencia = (index: number, field: string, value: any) => {
    const newComps = [...(formData.competencias || [])];
    newComps[index] = { ...newComps[index], [field]: value };
    setFormData(prev => ({ ...prev, competencias: newComps }));
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome do cargo é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveCargo(formData);
      addToast('Cargo salvo com sucesso!', 'success');
      onSaveSuccess();
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados do Cargo" description="Informações básicas e responsabilidades.">
          <Input 
            label="Nome do Cargo" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={e => handleFormChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
          />
          <Input 
            label="Setor / Departamento" 
            name="setor" 
            value={formData.setor || ''} 
            onChange={e => handleFormChange('setor', e.target.value)} 
            className="sm:col-span-2" 
          />
          <div className="sm:col-span-6">
            <Toggle 
              label="Cargo Ativo" 
              name="ativo" 
              checked={formData.ativo !== false} 
              onChange={checked => handleFormChange('ativo', checked)} 
            />
          </div>
          <TextArea 
            label="Descrição Sumária" 
            name="descricao" 
            value={formData.descricao || ''} 
            onChange={e => handleFormChange('descricao', e.target.value)} 
            rows={3} 
            className="sm:col-span-6" 
          />
          <TextArea 
            label="Responsabilidades Principais (ISO 9001: 5.3)" 
            name="responsabilidades" 
            value={formData.responsabilidades || ''} 
            onChange={e => handleFormChange('responsabilidades', e.target.value)} 
            rows={4} 
            className="sm:col-span-6" 
            placeholder="Liste as principais responsabilidades e deveres..."
          />
          <TextArea 
            label="Autoridades (ISO 9001: 5.3)" 
            name="autoridades" 
            value={formData.autoridades || ''} 
            onChange={e => handleFormChange('autoridades', e.target.value)} 
            rows={3} 
            className="sm:col-span-6" 
            placeholder="O que este cargo tem autonomia para decidir ou aprovar?"
          />
        </Section>

        <Section title="Competências Requeridas" description="Defina os requisitos de competência (ISO 9001: 7.2).">
          <div className="sm:col-span-6 bg-blue-50 p-4 rounded-lg mb-4 flex gap-2 items-end">
            <Select 
              label="Adicionar Competência" 
              name="add_comp" 
              value={selectedCompId} 
              onChange={e => setSelectedCompId(e.target.value)}
              className="flex-grow"
            >
              <option value="">Selecione...</option>
              {availableCompetencias.map(c => (
                <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>
              ))}
            </Select>
            <button 
              onClick={handleAddCompetencia}
              className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors mb-[1px]"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="sm:col-span-6 space-y-3">
            <AnimatePresence>
              {formData.competencias?.map((comp, index) => (
                <motion.div 
                  key={comp.competencia_id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white border border-gray-200 p-4 rounded-lg flex flex-wrap items-center gap-4 shadow-sm"
                >
                  <div className="flex-grow min-w-[200px]">
                    <p className="font-semibold text-gray-800">{comp.nome}</p>
                    <p className="text-xs text-gray-500 capitalize">{comp.tipo}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Nível (1-5):</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="5" 
                      value={comp.nivel_requerido} 
                      onChange={e => handleUpdateCompetencia(index, 'nivel_requerido', parseInt(e.target.value))}
                      className="w-16 p-1 border rounded text-center"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={comp.obrigatorio} 
                      onChange={e => handleUpdateCompetencia(index, 'obrigatorio', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label className="text-sm text-gray-700">Obrigatório</label>
                  </div>

                  <button 
                    onClick={() => handleRemoveCompetencia(comp.competencia_id)}
                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full"
                  >
                    <Trash2 size={18} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {(!formData.competencias || formData.competencias.length === 0) && (
              <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <AlertTriangle className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p>Nenhuma competência vinculada a este cargo.</p>
              </div>
            )}
          </div>
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar Cargo
          </button>
        </div>
      </footer>
    </div>
  );
};

export default CargoFormPanel;

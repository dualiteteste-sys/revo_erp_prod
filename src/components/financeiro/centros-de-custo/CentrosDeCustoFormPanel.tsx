import React, { useState, useEffect } from 'react';
import { Loader2, Save, Search } from 'lucide-react';
import { CentroDeCusto, CentroDeCustoPayload, saveCentroDeCusto, searchCentrosDeCusto, CentroDeCustoListItem } from '@/services/centrosDeCusto';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';
import TextArea from '@/components/ui/forms/TextArea';
import { useDebounce } from '@/hooks/useDebounce';

interface CentrosDeCustoFormPanelProps {
  centro: Partial<CentroDeCusto> | null;
  onSaveSuccess: (savedCentro: CentroDeCusto) => void;
  onClose: () => void;
}

const CentrosDeCustoFormPanel: React.FC<CentrosDeCustoFormPanelProps> = ({ centro, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CentroDeCustoPayload>({});
  
  // Parent Search State
  const [parentSearch, setParentSearch] = useState('');
  const [parentResults, setParentResults] = useState<CentroDeCustoListItem[]>([]);
  const [showParentResults, setShowParentResults] = useState(false);
  const debouncedParentSearch = useDebounce(parentSearch, 300);

  useEffect(() => {
    if (centro) {
      setFormData(centro);
      if (centro.parent_nome) {
        setParentSearch(centro.parent_nome);
      }
    } else {
      setFormData({ ativo: true, tipo: 'despesa', nivel: 1 });
    }
  }, [centro]);

  useEffect(() => {
    const search = async () => {
      if (debouncedParentSearch.length < 2) {
        setParentResults([]);
        return;
      }
      // Avoid searching if the search term matches the currently selected parent name (to prevent re-opening dropdown)
      if (formData.parent_nome && debouncedParentSearch === formData.parent_nome) return;

      const results = await searchCentrosDeCusto(debouncedParentSearch);
      // Filter out self to prevent circular dependency
      const filtered = results.filter(r => r.id !== formData.id);
      setParentResults(filtered);
      setShowParentResults(true);
    };
    search();
  }, [debouncedParentSearch, formData.id, formData.parent_nome]);

  const handleFormChange = (field: keyof CentroDeCustoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectParent = (parent: CentroDeCustoListItem) => {
    handleFormChange('parent_id', parent.id);
    handleFormChange('parent_nome', parent.nome); // Virtual field for UI
    setParentSearch(parent.nome);
    setShowParentResults(false);
  };

  const handleClearParent = () => {
    handleFormChange('parent_id', null);
    handleFormChange('parent_nome', undefined);
    setParentSearch('');
    setShowParentResults(false);
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const savedCentro = await saveCentroDeCusto(formData);
      addToast('Centro de Custo salvo com sucesso!', 'success');
      onSaveSuccess(savedCentro);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados do Centro de Custo" description="Informações de identificação e hierarquia.">
          <Input 
            label="Nome" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={e => handleFormChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
          />
          <Input 
            label="Código" 
            name="codigo" 
            value={formData.codigo || ''} 
            onChange={e => handleFormChange('codigo', e.target.value)} 
            className="sm:col-span-2" 
            placeholder="Ex: 1.01"
          />
          
          <div className="sm:col-span-4 relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo Pai (Opcional)</label>
            <div className="relative">
                <input
                    type="text"
                    value={parentSearch}
                    onChange={(e) => {
                        setParentSearch(e.target.value);
                        if (!e.target.value) handleClearParent();
                    }}
                    onFocus={() => { if (parentResults.length > 0) setShowParentResults(true); }}
                    className="w-full p-3 pr-10 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
                    placeholder="Buscar centro pai..."
                />
                <div className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                    <Search size={18} />
                </div>
            </div>
            {showParentResults && parentResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {parentResults.map(parent => (
                        <button
                            key={parent.id}
                            type="button"
                            onClick={() => handleSelectParent(parent)}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-gray-700"
                        >
                            <span className="font-medium">{parent.nome}</span>
                            {parent.codigo && <span className="text-gray-500 ml-2">({parent.codigo})</span>}
                        </button>
                    ))}
                </div>
            )}
          </div>

          <div className="sm:col-span-2">
             <Input 
                label="Ordem" 
                name="ordem" 
                type="number"
                value={formData.ordem || 0} 
                onChange={e => handleFormChange('ordem', parseInt(e.target.value))} 
                placeholder="0"
            />
          </div>
          
          <Select 
            label="Tipo" 
            name="tipo" 
            value={formData.tipo || 'despesa'} 
            onChange={e => handleFormChange('tipo', e.target.value)} 
            className="sm:col-span-3"
          >
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
            <option value="investimento">Investimento</option>
            <option value="outro">Outro</option>
          </Select>

          <div className="sm:col-span-3 flex items-center pt-6">
            <Toggle 
                label="Ativo" 
                name="ativo" 
                checked={formData.ativo !== false} 
                onChange={checked => handleFormChange('ativo', checked)} 
            />
          </div>

          <TextArea 
            label="Observações" 
            name="observacoes" 
            value={formData.observacoes || ''} 
            onChange={e => handleFormChange('observacoes', e.target.value)} 
            rows={3} 
            className="sm:col-span-6" 
          />
        </Section>
      </div>
      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
};

export default CentrosDeCustoFormPanel;

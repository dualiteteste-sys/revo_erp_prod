import React, { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CompetenciaPayload, saveCompetencia, Competencia } from '@/services/rh';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/hooks/useHasPermission';
import { useAuth } from '@/contexts/AuthProvider';

interface CompetenciaFormPanelProps {
  competencia: Competencia | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

const CompetenciaFormPanel: React.FC<CompetenciaFormPanelProps> = ({ competencia, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CompetenciaPayload>({});
  const lastEmpresaIdRef = React.useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const actionTokenRef = React.useRef(0);

  const permCreate = useHasPermission('rh', 'create');
  const permUpdate = useHasPermission('rh', 'update');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading;
  const isEditing = !!competencia?.id;
  const canSave = isEditing ? permUpdate.data : permCreate.data;
  const readOnly = !permsLoading && !canSave;

  useEffect(() => {
    if (competencia) {
      setFormData(competencia);
    } else {
      setFormData({ ativo: true, tipo: 'tecnica', critico_sgq: false });
    }
  }, [competencia]);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;
    actionTokenRef.current += 1;
    setIsSaving(false);
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  const handleFormChange = (field: keyof CompetenciaPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (authLoading || !activeEmpresaId || empresaChanged) {
      addToast('Aguarde a troca de empresa concluir para salvar.', 'info');
      return;
    }
    if (readOnly) {
      addToast('Você não tem permissão para salvar competências.', 'warning');
      return;
    }
    if (!formData.nome) {
      addToast('O nome da competência é obrigatório.', 'error');
      return;
    }

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setIsSaving(true);
    try {
      await saveCompetencia(formData);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Competência salva com sucesso!', 'success');
      onSaveSuccess();
    } catch (error: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(error.message, 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {readOnly && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Você está em modo somente leitura. Solicite permissão para criar/editar competências.
          </div>
        )}
        <Section title="Dados da Competência" description="Defina as habilidades e conhecimentos requeridos.">
          <Input 
            label="Nome" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={e => handleFormChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
            disabled={readOnly}
          />
          <Select 
            label="Tipo" 
            name="tipo" 
            value={formData.tipo || 'tecnica'} 
            onChange={e => handleFormChange('tipo', e.target.value)}
            className="sm:col-span-2"
            disabled={readOnly}
          >
            <option value="tecnica">Técnica</option>
            <option value="comportamental">Comportamental</option>
            <option value="certificacao">Certificação</option>
            <option value="idioma">Idioma</option>
            <option value="outros">Outros</option>
          </Select>
          
          <div className="sm:col-span-6 flex gap-6">
            <Toggle 
              label="Ativo" 
              name="ativo" 
              checked={formData.ativo !== false} 
              onChange={checked => handleFormChange('ativo', checked)} 
              disabled={readOnly}
            />
            <Toggle 
              label="Crítico para SGQ" 
              name="critico_sgq" 
              checked={formData.critico_sgq === true} 
              onChange={checked => handleFormChange('critico_sgq', checked)} 
              description="Impacta diretamente na qualidade (ISO 9001)."
              disabled={readOnly}
            />
          </div>

          <TextArea 
            label="Descrição" 
            name="descricao" 
            value={formData.descricao || ''} 
            onChange={e => handleFormChange('descricao', e.target.value)} 
            rows={4} 
            className="sm:col-span-6" 
            placeholder="Descreva o que é esperado desta competência..."
            disabled={readOnly}
          />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <Button type="button" onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || permsLoading || !canSave || authLoading || !activeEmpresaId || empresaChanged} className="gap-2">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default CompetenciaFormPanel;

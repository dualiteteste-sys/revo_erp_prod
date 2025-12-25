import React, { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2, UserPlus, CheckCircle, XCircle, Edit } from 'lucide-react';
import {
  TreinamentoDetails,
  TreinamentoPayload,
  saveTreinamento,
  listColaboradores,
  Colaborador,
  manageParticipante,
  TreinamentoParticipante,
  getTreinamentoDetails,
} from '@/services/rh';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import { useNumericField } from '@/hooks/useNumericField';
import { motion, AnimatePresence } from 'framer-motion';
import ParticipanteModal from './ParticipanteModal';

interface TreinamentoFormPanelProps {
  treinamento: TreinamentoDetails | null;
  onSaved: (treinamento: TreinamentoDetails) => void;
  onClose: () => void;
}

const TreinamentoFormPanel: React.FC<TreinamentoFormPanelProps> = ({ treinamento, onSaved, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<TreinamentoPayload>({});
  const [activeTab, setActiveTab] = useState<'dados' | 'participantes'>('dados');
  
  // Participantes state
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string>('');
  
  // Modal state
  const [editingParticipante, setEditingParticipante] = useState<TreinamentoParticipante | null>(null);

  const custoEstimadoProps = useNumericField(formData.custo_estimado, (val) => handleFormChange('custo_estimado', val));
  const custoRealProps = useNumericField(formData.custo_real, (val) => handleFormChange('custo_real', val));

  useEffect(() => {
    if (treinamento) {
      setFormData(treinamento);
    } else {
      setFormData({ status: 'planejado', tipo: 'interno' });
    }

    const loadColaboradores = async () => {
      try {
        const data = await listColaboradores(undefined, undefined); // List all active
        setColaboradores(data);
      } catch (e) {
        console.error(e);
      }
    };
    loadColaboradores();
  }, [treinamento]);

  const handleFormChange = (field: keyof TreinamentoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O nome do treinamento é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveTreinamento(formData);
      setFormData(saved); // Update with ID if created
      addToast('Treinamento salvo com sucesso!', 'success');
      onSaved(saved);
      setActiveTab('participantes');
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddParticipante = async () => {
    if (!formData.id) {
      addToast('Salve o treinamento antes de adicionar participantes.', 'warning');
      return;
    }
    if (!selectedColaboradorId) return;

    try {
      await manageParticipante(formData.id, selectedColaboradorId, 'add');
      addToast('Participante adicionado.', 'success');
      const updated = await getTreinamentoDetails(formData.id);
      setFormData(updated);
      setSelectedColaboradorId('');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemoveParticipante = async (colaboradorId: string) => {
    if (!formData.id) return;
    try {
      await manageParticipante(formData.id, colaboradorId, 'remove');
      addToast('Participante removido.', 'success');
      const updated = await getTreinamentoDetails(formData.id);
      setFormData(updated);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleUpdateParticipante = async (colaboradorId: string, data: any) => {
    if (!formData.id) return;
    try {
      await manageParticipante(formData.id, colaboradorId, 'update', data);
      addToast('Participante atualizado.', 'success');
      const updated = await getTreinamentoDetails(formData.id);
      setFormData(updated);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 px-6">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab('dados')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'dados' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Dados do Treinamento
          </button>
          <button
            onClick={() => setActiveTab('participantes')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'participantes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!formData.id}
          >
            Participantes {formData.id ? `(${formData.participantes?.length || 0})` : '(Salve primeiro)'}
          </button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {activeTab === 'dados' && (
          <Section title="Informações Gerais" description="Detalhes do planejamento e execução.">
            <Input 
              label="Nome do Treinamento" 
              name="nome" 
              value={formData.nome || ''} 
              onChange={e => handleFormChange('nome', e.target.value)} 
              required 
              className="sm:col-span-4" 
            />
            <Select 
              label="Tipo" 
              name="tipo" 
              value={formData.tipo || 'interno'} 
              onChange={e => handleFormChange('tipo', e.target.value)}
              className="sm:col-span-2"
            >
              <option value="interno">Interno</option>
              <option value="externo">Externo</option>
              <option value="online">Online</option>
              <option value="on_the_job">On the Job</option>
            </Select>
            
            <Select 
              label="Status" 
              name="status" 
              value={formData.status || 'planejado'} 
              onChange={e => handleFormChange('status', e.target.value)}
              className="sm:col-span-2"
            >
              <option value="planejado">Planejado</option>
              <option value="agendado">Agendado</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </Select>

            <Input 
              label="Instrutor / Entidade" 
              name="instrutor" 
              value={formData.instrutor || ''} 
              onChange={e => handleFormChange('instrutor', e.target.value)} 
              className="sm:col-span-4" 
            />

            <Input 
              label="Data Início" 
              name="data_inicio" 
              type="datetime-local"
              value={formData.data_inicio ? new Date(formData.data_inicio).toISOString().slice(0, 16) : ''} 
              onChange={e => handleFormChange('data_inicio', e.target.value)} 
              className="sm:col-span-3" 
            />
            <Input 
              label="Data Fim" 
              name="data_fim" 
              type="datetime-local"
              value={formData.data_fim ? new Date(formData.data_fim).toISOString().slice(0, 16) : ''} 
              onChange={e => handleFormChange('data_fim', e.target.value)} 
              className="sm:col-span-3" 
            />

            <Input 
              label="Carga Horária (horas)" 
              name="carga_horaria_horas" 
              type="number"
              step="0.5"
              value={formData.carga_horaria_horas || ''} 
              onChange={e => handleFormChange('carga_horaria_horas', parseFloat(e.target.value))} 
              className="sm:col-span-2" 
            />
            <Input 
              label="Custo Estimado (R$)" 
              name="custo_estimado" 
              {...custoEstimadoProps}
              className="sm:col-span-2" 
            />
            <Input 
              label="Custo Real (R$)" 
              name="custo_real" 
              {...custoRealProps}
              className="sm:col-span-2" 
            />

            <TextArea 
              label="Objetivo / Justificativa" 
              name="objetivo" 
              value={formData.objetivo || ''} 
              onChange={e => handleFormChange('objetivo', e.target.value)} 
              rows={3} 
              className="sm:col-span-6" 
              placeholder="Qual gap de competência ou necessidade este treinamento visa atender?"
            />
             <TextArea 
              label="Descrição / Conteúdo" 
              name="descricao" 
              value={formData.descricao || ''} 
              onChange={e => handleFormChange('descricao', e.target.value)} 
              rows={3} 
              className="sm:col-span-6" 
            />
          </Section>
        )}

        {activeTab === 'participantes' && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg flex gap-2 items-end border border-gray-200">
              <div className="flex-grow">
                <label className="block text-sm font-medium text-gray-700 mb-1">Adicionar Colaborador</label>
                <select 
                  value={selectedColaboradorId} 
                  onChange={e => setSelectedColaboradorId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione...</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.cargo_nome || 'Sem cargo'})</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={handleAddParticipante}
                disabled={!selectedColaboradorId}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 flex items-center gap-2"
              >
                <UserPlus size={18} /> Adicionar
              </button>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {formData.participantes?.map((part) => (
                  <motion.div 
                    key={part.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-white border border-gray-200 p-4 rounded-lg flex flex-wrap items-center gap-4 shadow-sm"
                  >
                    <div className="flex-grow min-w-[200px]">
                      <p className="font-semibold text-gray-800">{part.nome}</p>
                      <p className="text-xs text-gray-500">{part.cargo || 'Cargo não definido'}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        part.status === 'concluido' ? 'bg-green-100 text-green-800' : 
                        part.status === 'ausente' || part.status === 'reprovado' ? 'bg-red-100 text-red-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {part.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {part.eficacia_avaliada && <CheckCircle size={18} className="text-green-500" title="Eficácia Avaliada" />}
                        {part.nota_final !== null && <span className="text-sm font-bold text-gray-700">Nota: {part.nota_final}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setEditingParticipante(part)}
                        className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                        title="Editar detalhes"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => handleRemoveParticipante(part.colaborador_id)}
                        className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors"
                        title="Remover participante"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {(!formData.participantes || formData.participantes.length === 0) && (
                <div className="text-center text-gray-500 py-8">
                  <p>Nenhum participante inscrito neste treinamento.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>

      {editingParticipante && (
        <ParticipanteModal
          isOpen={!!editingParticipante}
          onClose={() => setEditingParticipante(null)}
          participante={editingParticipante}
          onSave={handleUpdateParticipante}
        />
      )}
    </div>
  );
};

export default TreinamentoFormPanel;

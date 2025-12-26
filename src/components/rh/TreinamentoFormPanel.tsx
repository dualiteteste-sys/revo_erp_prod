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
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/hooks/useHasPermission';

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

  const permCreate = useHasPermission('rh', 'create');
  const permUpdate = useHasPermission('rh', 'update');
  const permManage = useHasPermission('rh', 'manage');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permManage.isLoading;
  const isEditing = !!treinamento?.id;
  const canSave = isEditing ? permUpdate.data : permCreate.data;
  const readOnly = !permsLoading && !canSave;
  const canManageParticipants = !permsLoading && permManage.data;

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
        const data = await listColaboradores(undefined, undefined, true);
        setColaboradores(data);
      } catch (e) {
        console.error(e);
      }
    };
    loadColaboradores();
  }, [treinamento]);

  const handleFormChange = (field: keyof TreinamentoPayload, value: any) => {
    if (readOnly) return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (readOnly) {
      addToast('Você não tem permissão para salvar treinamentos.', 'warning');
      return;
    }
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
    if (!canManageParticipants) {
      addToast('Você não tem permissão para gerenciar participantes.', 'warning');
      return;
    }
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
    if (!canManageParticipants) {
      addToast('Você não tem permissão para gerenciar participantes.', 'warning');
      return;
    }
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
    if (!canManageParticipants) {
      addToast('Você não tem permissão para gerenciar participantes.', 'warning');
      return;
    }
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
        {readOnly && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Você está em modo somente leitura. Solicite permissão para criar/editar treinamentos.
          </div>
        )}
        {activeTab === 'dados' && (
          <Section title="Informações Gerais" description="Detalhes do planejamento e execução.">
            <Input 
              label="Nome do Treinamento" 
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
              value={formData.tipo || 'interno'} 
              onChange={e => handleFormChange('tipo', e.target.value)}
              className="sm:col-span-2"
              disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
            />

            <Input 
              label="Data Início" 
              name="data_inicio" 
              type="datetime-local"
              value={formData.data_inicio ? new Date(formData.data_inicio).toISOString().slice(0, 16) : ''} 
              onChange={e => handleFormChange('data_inicio', e.target.value)} 
              className="sm:col-span-3" 
              disabled={readOnly}
            />
            <Input 
              label="Data Fim" 
              name="data_fim" 
              type="datetime-local"
              value={formData.data_fim ? new Date(formData.data_fim).toISOString().slice(0, 16) : ''} 
              onChange={e => handleFormChange('data_fim', e.target.value)} 
              className="sm:col-span-3" 
              disabled={readOnly}
            />

            <Input 
              label="Carga Horária (horas)" 
              name="carga_horaria_horas" 
              type="number"
              step="0.5"
              value={formData.carga_horaria_horas || ''} 
              onChange={e => handleFormChange('carga_horaria_horas', parseFloat(e.target.value))} 
              className="sm:col-span-2" 
              disabled={readOnly}
            />

            <Input
              label="Validade do certificado (meses)"
              name="validade_meses"
              type="number"
              min="0"
              step="1"
              value={formData.validade_meses ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                handleFormChange('validade_meses', Number.isFinite(v as number) ? v : null);
              }}
              className="sm:col-span-2"
              helperText="Ao marcar um participante como Concluído, o sistema calcula a validade e a data sugerida de reciclagem."
              disabled={readOnly}
            />
            <Input 
              label="Custo Estimado (R$)" 
              name="custo_estimado" 
              {...custoEstimadoProps}
              className="sm:col-span-2" 
              disabled={readOnly}
            />
            <Input 
              label="Custo Real (R$)" 
              name="custo_real" 
              {...custoRealProps}
              className="sm:col-span-2" 
              disabled={readOnly}
            />

            <TextArea 
              label="Objetivo / Justificativa" 
              name="objetivo" 
              value={formData.objetivo || ''} 
              onChange={e => handleFormChange('objetivo', e.target.value)} 
              rows={3} 
              className="sm:col-span-6" 
              placeholder="Qual gap de competência ou necessidade este treinamento visa atender?"
              disabled={readOnly}
            />
            <TextArea 
              label="Descrição / Conteúdo" 
              name="descricao" 
              value={formData.descricao || ''} 
              onChange={e => handleFormChange('descricao', e.target.value)} 
              rows={3} 
              className="sm:col-span-6" 
              disabled={readOnly}
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
                  disabled={!canManageParticipants || !formData.id}
                >
                  <option value="">Selecione...</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.cargo_nome || 'Sem cargo'})</option>
                  ))}
                </select>
              </div>
              <Button onClick={handleAddParticipante} disabled={!selectedColaboradorId || !canManageParticipants} className="gap-2">
                <UserPlus size={18} /> Adicionar
              </Button>
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

                    <div className="min-w-[220px] text-sm text-gray-600">
                      {part.validade_ate ? (
                        <div>
                          <span className="font-medium">Validade:</span>{' '}
                          {new Date(part.validade_ate).toLocaleDateString('pt-BR')}
                        </div>
                      ) : (
                        <div className="text-gray-400">Validade: —</div>
                      )}
                      {part.proxima_reciclagem ? (
                        <div className="text-xs text-gray-500">
                          Reciclagem sugerida: {new Date(part.proxima_reciclagem).toLocaleDateString('pt-BR')}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setEditingParticipante(part)}
                        className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Editar detalhes"
                        disabled={!canManageParticipants}
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => handleRemoveParticipante(part.colaborador_id)}
                        className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remover participante"
                        disabled={!canManageParticipants}
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
          <Button type="button" onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || permsLoading || !canSave} className="gap-2">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </Button>
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

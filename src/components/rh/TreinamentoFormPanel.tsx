import React, { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2, UserPlus, CheckCircle, XCircle, Edit, Paperclip, Download } from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import { useNumericField } from '@/hooks/useNumericField';
import { motion, AnimatePresence } from 'framer-motion';
import ParticipanteModal from './ParticipanteModal';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/hooks/useHasPermission';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';
import { createRhDocSignedUrl, deleteRhDoc, listRhDocs, uploadRhDoc, type RhDoc } from '@/services/rhDocs';

interface TreinamentoFormPanelProps {
  treinamento: TreinamentoDetails | null;
  onSaved: (treinamento: TreinamentoDetails) => void;
  onClose: () => void;
}

function labelOperation(op: string) {
  if (op === 'INSERT') return 'Criado';
  if (op === 'UPDATE') return 'Atualizado';
  if (op === 'DELETE') return 'Excluído';
  return op;
}

function formatChangedFields(row: AuditLogRow): string {
  const parts: string[] = [];
  const oldRow = (row.old_data || {}) as Record<string, unknown>;
  const newRow = (row.new_data || {}) as Record<string, unknown>;

  const keys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
  for (const key of keys) {
    const before = oldRow[key];
    const after = newRow[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (key === 'updated_at' || key === 'created_at') continue;
    parts.push(`${key}: ${before ?? '—'} → ${after ?? '—'}`);
  }
  return parts.join(' | ');
}

const TreinamentoFormPanel: React.FC<TreinamentoFormPanelProps> = ({ treinamento, onSaved, onClose }) => {
  const { addToast } = useToast();
  const { activeEmpresaId } = useAuth();
  const { confirm } = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<TreinamentoPayload>({});
  const [activeTab, setActiveTab] = useState<'dados' | 'participantes' | 'anexos' | 'historico'>('dados');
  
  // Participantes state
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string>('');
  
  // Modal state
  const [editingParticipante, setEditingParticipante] = useState<TreinamentoParticipante | null>(null);

  const permCreate = useHasPermission('rh', 'create');
  const permUpdate = useHasPermission('rh', 'update');
  const permManage = useHasPermission('rh', 'manage');
  const permDelete = useHasPermission('rh', 'delete');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permManage.isLoading || permDelete.isLoading;
  const isEditing = !!treinamento?.id;
  const canSave = isEditing ? permUpdate.data : permCreate.data;
  const readOnly = !permsLoading && !canSave;
  const canManageParticipants = !permsLoading && permManage.data;
  const canUploadDoc = !permsLoading && !!permUpdate.data;
  const canDeleteDoc = !permsLoading && !!permDelete.data;

  const custoEstimadoProps = useNumericField(formData.custo_estimado, (val) => handleFormChange('custo_estimado', val));
  const custoRealProps = useNumericField(formData.custo_real, (val) => handleFormChange('custo_real', val));

  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [docs, setDocs] = useState<RhDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTitulo, setDocTitulo] = useState('');
  const [docDescricao, setDocDescricao] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

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

  useEffect(() => {
    const fetchAudit = async () => {
      if (activeTab !== 'historico') return;
      if (!formData.id) {
        setAuditRows([]);
        return;
      }
      setLoadingAudit(true);
      try {
        const data = await listAuditLogsForTables(['rh_treinamentos', 'rh_treinamento_participantes', 'rh_docs'], 300);
        const treinamentoId = formData.id;
        const belongsToTreinamento = (r: AuditLogRow) => {
          if (r.table_name === 'rh_treinamentos') return r.record_id === treinamentoId;

          const oldData = (r.old_data || {}) as Record<string, unknown>;
          const newData = (r.new_data || {}) as Record<string, unknown>;
          const trainingIdInNew = newData.treinamento_id;
          const trainingIdInOld = oldData.treinamento_id;
          if (r.table_name === 'rh_treinamento_participantes') {
            return trainingIdInNew === treinamentoId || trainingIdInOld === treinamentoId;
          }
          if (r.table_name === 'rh_docs') {
            const entityTypeNew = newData.entity_type;
            const entityTypeOld = oldData.entity_type;
            const entityIdNew = newData.entity_id;
            const entityIdOld = oldData.entity_id;
            return (
              (entityTypeNew === 'treinamento' && entityIdNew === treinamentoId) ||
              (entityTypeOld === 'treinamento' && entityIdOld === treinamentoId)
            );
          }
          return false;
        };

        setAuditRows(data.filter(belongsToTreinamento));
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar histórico.', 'error');
      } finally {
        setLoadingAudit(false);
      }
    };
    void fetchAudit();
  }, [activeTab, formData.id, addToast]);

  useEffect(() => {
    const fetchDocs = async () => {
      if (activeTab !== 'anexos') return;
      if (!formData.id) {
        setDocs([]);
        return;
      }
      setLoadingDocs(true);
      try {
        const data = await listRhDocs('treinamento', formData.id, false);
        setDocs(data);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar anexos.', 'error');
      } finally {
        setLoadingDocs(false);
      }
    };
    void fetchDocs();
  }, [activeTab, formData.id, addToast]);

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

  const handleUploadDoc = async () => {
    if (!activeEmpresaId) {
      addToast('Nenhuma empresa ativa encontrada.', 'error');
      return;
    }
    if (!formData.id) {
      addToast('Salve o treinamento antes de anexar documentos.', 'warning');
      return;
    }
    if (!docFile || !docTitulo.trim()) {
      addToast('Informe o título e selecione um arquivo.', 'warning');
      return;
    }
    if (!canUploadDoc) {
      addToast('Você não tem permissão para anexar documentos.', 'warning');
      return;
    }

    setUploadingDoc(true);
    try {
      await uploadRhDoc({
        empresaId: activeEmpresaId,
        entityType: 'treinamento',
        entityId: formData.id,
        titulo: docTitulo,
        descricao: docDescricao || null,
        file: docFile,
      });
      addToast('Anexo enviado com sucesso.', 'success');
      setDocTitulo('');
      setDocDescricao('');
      setDocFile(null);
      const data = await listRhDocs('treinamento', formData.id, false);
      setDocs(data);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao enviar anexo.', 'error');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDownloadDoc = async (doc: RhDoc) => {
    try {
      const url = await createRhDocSignedUrl(doc.arquivo_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao baixar documento.', 'error');
    }
  };

  const handleDeleteDoc = async (doc: RhDoc) => {
    if (!canDeleteDoc) {
      addToast('Você não tem permissão para excluir anexos.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Excluir anexo',
      description: `Deseja excluir o anexo "${doc.titulo}"?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteRhDoc({ id: doc.id, arquivoPath: doc.arquivo_path });
      addToast('Anexo excluído.', 'success');
      if (formData.id) {
        const data = await listRhDocs('treinamento', formData.id, false);
        setDocs(data);
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir anexo.', 'error');
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
          <button
            onClick={() => setActiveTab('anexos')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'anexos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!formData.id}
          >
            Anexos {formData.id ? '' : '(Salve primeiro)'}
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'historico' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!formData.id}
          >
            Histórico {formData.id ? '' : '(Salve primeiro)'}
          </button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {readOnly && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Você está em modo somente leitura. Solicite permissão para criar/editar treinamentos.
          </div>
        )}
        {activeTab === 'anexos' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <Paperclip className="text-blue-600 mt-0.5" size={20} />
              <div>
                <h4 className="font-semibold text-blue-800">Anexos do treinamento</h4>
                <p className="text-sm text-blue-700">Anexe evidências (lista de presença, materiais, certificados, etc.).</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Título do anexo"
                  value={docTitulo}
                  onChange={(e) => setDocTitulo(e.target.value)}
                  placeholder="Ex: Lista de presença, Certificado, Material"
                  disabled={!canUploadDoc}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
                  <input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="w-full text-sm"
                    disabled={!canUploadDoc}
                  />
                  <p className="text-xs text-gray-500 mt-1">O arquivo será armazenado por empresa (acesso controlado).</p>
                </div>
              </div>
              <Input label="Descrição (opcional)" value={docDescricao} onChange={(e) => setDocDescricao(e.target.value)} disabled={!canUploadDoc} />
              <div className="flex justify-end">
                <Button onClick={handleUploadDoc} disabled={!activeEmpresaId || !docFile || uploadingDoc || !canUploadDoc} className="gap-2">
                  {uploadingDoc ? <Loader2 className="animate-spin" size={16} /> : <Paperclip size={16} />}
                  Enviar
                </Button>
              </div>
            </div>

            <div className="border rounded-2xl overflow-hidden bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-2 text-left">Título</th>
                    <th className="px-4 py-2 text-left">Descrição</th>
                    <th className="px-4 py-2 text-left">Versão</th>
                    <th className="px-4 py-2 text-left">Enviado em</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingDocs ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        <Loader2 className="inline-block w-4 h-4 animate-spin mr-2" />
                        Carregando...
                      </td>
                    </tr>
                  ) : docs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Nenhum anexo enviado.</td>
                    </tr>
                  ) : (
                    docs.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{d.titulo}</td>
                        <td className="px-4 py-2 text-gray-600">{d.descricao || '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{d.versao}</td>
                        <td className="px-4 py-2 text-gray-600">{new Date(d.created_at).toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2 text-right">
                          <Button variant="outline" size="sm" className="mr-2 gap-2" onClick={() => void handleDownloadDoc(d)}>
                            <Download className="w-4 h-4" />
                            Baixar
                          </Button>
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => void handleDeleteDoc(d)} disabled={!canDeleteDoc}>
                            <Trash2 className="w-4 h-4" />
                            Excluir
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-600">
                Alterações registradas em <span className="font-medium">Treinamento</span>, <span className="font-medium">Participantes</span> e <span className="font-medium">Anexos</span>.
              </div>
            </div>

            {loadingAudit ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
              </div>
            ) : auditRows.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>Nenhuma alteração registrada para este treinamento.</p>
              </div>
            ) : (
              <div className="overflow-hidden border border-gray-200 rounded-lg bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left p-3">Quando</th>
                      <th className="text-left p-3">Ação</th>
                      <th className="text-left p-3">Tabela</th>
                      <th className="text-left p-3">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditRows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{new Date(r.changed_at).toLocaleString('pt-BR')}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              r.operation === 'INSERT'
                                ? 'bg-green-100 text-green-800'
                                : r.operation === 'UPDATE'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {labelOperation(r.operation)}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600">{r.table_name}</td>
                        <td className="p-3 text-gray-600">{formatChangedFields(r) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

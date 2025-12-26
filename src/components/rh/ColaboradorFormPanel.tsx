import React, { useState, useEffect } from 'react';
import { Loader2, Save, AlertCircle, TrendingUp, TrendingDown, Minus, PlusCircle, GraduationCap, Paperclip, Download, Trash2, CalendarPlus } from 'lucide-react';
import {
  ColaboradorDetails,
  ColaboradorPayload,
  saveColaborador,
  Cargo,
  listCargos,
  Competencia,
  listCompetencias,
  getCargoDetails,
  listTreinamentosPorColaborador,
  ColaboradorTreinamento,
  listAfastamentos,
  addAfastamento,
  encerrarAfastamento,
  type ColaboradorAfastamento,
} from '@/services/rh';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { createRhDocSignedUrl, deleteRhDoc, listRhDocs, uploadRhDoc, type RhDoc } from '@/services/rhDocs';
import { useHasPermission } from '@/hooks/useHasPermission';

interface ColaboradorFormPanelProps {
  colaborador: ColaboradorDetails | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

const ColaboradorFormPanel: React.FC<ColaboradorFormPanelProps> = ({ colaborador, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const { activeEmpresaId } = useAuth();
  const { confirm } = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ColaboradorPayload>({});
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [allCompetencias, setAllCompetencias] = useState<Competencia[]>([]);
  const [activeTab, setActiveTab] = useState<'dados' | 'competencias' | 'afastamentos' | 'anexos' | 'treinamentos' | 'historico'>('dados');

  const [mappedCargoId, setMappedCargoId] = useState<string | null>(null);
  const [extraCompetenciaId, setExtraCompetenciaId] = useState<string>('');

  const [treinamentos, setTreinamentos] = useState<ColaboradorTreinamento[]>([]);
  const [loadingTreinamentos, setLoadingTreinamentos] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [afastamentos, setAfastamentos] = useState<ColaboradorAfastamento[]>([]);
  const [loadingAfastamentos, setLoadingAfastamentos] = useState(false);
  const [novoAfastTipo, setNovoAfastTipo] = useState<ColaboradorAfastamento['tipo']>('outros');
  const [novoAfastMotivo, setNovoAfastMotivo] = useState<string>('');
  const [novoAfastInicio, setNovoAfastInicio] = useState<string>('');
  const [novoAfastFim, setNovoAfastFim] = useState<string>('');
  const [savingAfastamento, setSavingAfastamento] = useState(false);

  const [docs, setDocs] = useState<RhDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTitulo, setDocTitulo] = useState('');
  const [docDescricao, setDocDescricao] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  const permCreate = useHasPermission('rh', 'create');
  const permUpdate = useHasPermission('rh', 'update');
  const permDelete = useHasPermission('rh', 'delete');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permDelete.isLoading;
  const isEditing = !!colaborador?.id;
  const canSave = isEditing ? permUpdate.data : permCreate.data;
  const readOnly = !permsLoading && !canSave;
  const canUpdate = !permsLoading && permUpdate.data;
  const canUploadDoc = !permsLoading && permCreate.data;
  const canDeleteDoc = !permsLoading && permDelete.data;

  useEffect(() => {
    const loadData = async () => {
      const [cargosData, compData] = await Promise.all([listCargos(undefined, true), listCompetencias()]);
      setCargos(cargosData);
      setAllCompetencias(compData);
    };
    loadData();

    if (colaborador) {
      setFormData(colaborador);
    } else {
      setFormData({ ativo: true, competencias: [] });
    }
    setMappedCargoId(null);
    setExtraCompetenciaId('');
  }, [colaborador]);

  useEffect(() => {
    const fetchTreinamentos = async () => {
      if (!colaborador?.id) {
        setTreinamentos([]);
        return;
      }
      setLoadingTreinamentos(true);
      try {
        const data = await listTreinamentosPorColaborador(colaborador.id);
        setTreinamentos(data);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar treinamentos do colaborador.', 'error');
      } finally {
        setLoadingTreinamentos(false);
      }
    };
    fetchTreinamentos();
  }, [colaborador?.id, addToast]);

  useEffect(() => {
    const fetchAudit = async () => {
      if (activeTab !== 'historico') return;
      if (!colaborador?.id) {
        setAuditRows([]);
        return;
      }
      setLoadingAudit(true);
      try {
        const data = await listAuditLogsForTables(['rh_colaboradores', 'rh_colaborador_competencias'], 300);
        setAuditRows(data.filter((r) => r.record_id === colaborador.id));
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar histórico.', 'error');
      } finally {
        setLoadingAudit(false);
      }
    };
    fetchAudit();
  }, [activeTab, colaborador?.id, addToast]);

  useEffect(() => {
    const fetchAfastamentos = async () => {
      if (activeTab !== 'afastamentos') return;
      if (!colaborador?.id) {
        setAfastamentos([]);
        return;
      }
      setLoadingAfastamentos(true);
      try {
        const data = await listAfastamentos(colaborador.id);
        setAfastamentos(data);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar afastamentos.', 'error');
      } finally {
        setLoadingAfastamentos(false);
      }
    };
    fetchAfastamentos();
  }, [activeTab, colaborador?.id, addToast]);

  useEffect(() => {
    const fetchDocs = async () => {
      if (activeTab !== 'anexos') return;
      if (!colaborador?.id) {
        setDocs([]);
        return;
      }
      setLoadingDocs(true);
      try {
        const data = await listRhDocs('colaborador', colaborador.id, false);
        setDocs(data);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar anexos.', 'error');
      } finally {
        setLoadingDocs(false);
      }
    };
    fetchDocs();
  }, [activeTab, colaborador?.id, addToast]);

  useEffect(() => {
    const hydrateCompetenciasFromCargo = async () => {
      const cargoId = (formData.cargo_id || '') as string;
      if (!cargoId) return;
      if (mappedCargoId === cargoId) return;

      try {
        const cargo = await getCargoDetails(cargoId);
        const current = formData.competencias || [];
        const currentById = new Map(current.map((c: any) => [c.competencia_id, c]));

        const requiredIds = new Set(cargo.competencias.map((c) => c.competencia_id));
        const required = cargo.competencias.map((req) => {
          const existing = currentById.get(req.competencia_id);
          const nivelAtual = existing?.nivel_atual ?? 0;
          const nivelRequerido = req.nivel_requerido ?? 0;
          return {
            competencia_id: req.competencia_id,
            nome: req.nome,
            tipo: req.tipo,
            nivel_requerido: nivelRequerido,
            nivel_atual: nivelAtual,
            gap: nivelAtual - nivelRequerido,
            obrigatorio: !!req.obrigatorio,
            data_avaliacao: existing?.data_avaliacao ?? null,
            origem: existing?.origem ?? null,
          };
        });

        const extras = current.filter((c: any) => !requiredIds.has(c.competencia_id));
        setFormData((prev) => ({ ...prev, competencias: [...required, ...extras] }));
        setMappedCargoId(cargoId);
      } catch (e) {
        setMappedCargoId(cargoId);
      }
    };

    hydrateCompetenciasFromCargo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.cargo_id]);

  const handleFormChange = (field: keyof ColaboradorPayload, value: any) => {
    if (readOnly) return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCompetenciaChange = (compId: string, field: string, value: any) => {
    if (readOnly) return;
    const currentComps = formData.competencias || [];
    const existingIndex = currentComps.findIndex(c => c.competencia_id === compId);
    
    let newComps = [...currentComps];
    
    if (existingIndex >= 0) {
      const prev = newComps[existingIndex] as any;
      const next: any = { ...prev, [field]: value };
      if (field === 'nivel_atual') {
        next.data_avaliacao = new Date().toISOString();
      }
      next.gap = (next.nivel_atual ?? 0) - (next.nivel_requerido ?? 0);
      newComps[existingIndex] = next;
    } else {
      // Se não existe na lista (ex: adicionando uma competência extra não requerida)
      const compInfo = allCompetencias.find(c => c.id === compId);
      if (compInfo) {
        const nivelAtual = field === 'nivel_atual' ? value : 0;
        newComps.push({
          competencia_id: compId,
          nome: compInfo.nome,
          tipo: compInfo.tipo,
          nivel_requerido: 0,
          nivel_atual: nivelAtual,
          gap: nivelAtual,
          obrigatorio: false,
          data_avaliacao: new Date().toISOString(),
          origem: null
        });
      }
    }
    setFormData(prev => ({ ...prev, competencias: newComps }));
  };

  const handleAddExtraCompetencia = () => {
    if (readOnly) return;
    if (!extraCompetenciaId) return;
    handleCompetenciaChange(extraCompetenciaId, 'nivel_atual', 0);
    setExtraCompetenciaId('');
  };

  const handleSave = async () => {
    if (readOnly) {
      addToast('Você não tem permissão para salvar colaboradores.', 'warning');
      return;
    }
    if (!formData.nome) {
      addToast('O nome é obrigatório.', 'error');
      return;
    }
    if (!formData.cargo_id) {
      addToast('O cargo é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveColaborador(formData);
      addToast('Colaborador salvo com sucesso!', 'success');
      onSaveSuccess();
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAfastamento = async () => {
    if (!canUpdate) {
      addToast('Você não tem permissão para registrar afastamentos.', 'warning');
      return;
    }
    if (!colaborador?.id) return;
    setSavingAfastamento(true);
    try {
      await addAfastamento({
        colaboradorId: colaborador.id,
        tipo: novoAfastTipo,
        motivo: novoAfastMotivo || null,
        dataInicio: novoAfastInicio || null,
        dataFim: novoAfastFim || null,
      });
      addToast('Afastamento registrado.', 'success');
      setNovoAfastTipo('outros');
      setNovoAfastMotivo('');
      setNovoAfastInicio('');
      setNovoAfastFim('');
      const data = await listAfastamentos(colaborador.id);
      setAfastamentos(data);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao registrar afastamento.', 'error');
    } finally {
      setSavingAfastamento(false);
    }
  };

  const handleEncerrarAfastamento = async (afast: ColaboradorAfastamento) => {
    if (!canUpdate) {
      addToast('Você não tem permissão para encerrar afastamentos.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Encerrar afastamento',
      description: `Encerrar afastamento (${afast.tipo.replace(/_/g, ' ')}) de ${new Date(afast.data_inicio).toLocaleDateString('pt-BR')}?`,
      confirmText: 'Encerrar',
      cancelText: 'Cancelar',
      variant: 'default',
    });
    if (!ok) return;
    try {
      await encerrarAfastamento(afast.id, new Date().toISOString().slice(0, 10));
      addToast('Afastamento encerrado.', 'success');
      if (colaborador?.id) {
        const data = await listAfastamentos(colaborador.id);
        setAfastamentos(data);
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao encerrar afastamento.', 'error');
    }
  };

  const loadDocs = async () => {
    if (!colaborador?.id) return;
    const data = await listRhDocs('colaborador', colaborador.id, false);
    setDocs(data);
  };

  const handleUploadDoc = async () => {
    if (!canUploadDoc) {
      addToast('Você não tem permissão para enviar anexos.', 'warning');
      return;
    }
    if (!colaborador?.id || !activeEmpresaId || !docFile) return;
    if (!docTitulo.trim()) {
      addToast('Informe o título do anexo.', 'warning');
      return;
    }
    setUploadingDoc(true);
    try {
      await uploadRhDoc({
        empresaId: activeEmpresaId,
        entityType: 'colaborador',
        entityId: colaborador.id,
        titulo: docTitulo.trim(),
        descricao: docDescricao.trim() || null,
        file: docFile,
      });
      addToast('Anexo enviado.', 'success');
      setDocTitulo('');
      setDocDescricao('');
      setDocFile(null);
      await loadDocs();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao enviar anexo.', 'error');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleOpenDoc = async (doc: RhDoc) => {
    try {
      const url = await createRhDocSignedUrl(doc.arquivo_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao abrir anexo.', 'error');
    }
  };

  const handleDeleteDoc = async (doc: RhDoc) => {
    if (!canDeleteDoc) {
      addToast('Você não tem permissão para excluir anexos.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Excluir anexo',
      description: `Excluir "${doc.titulo}" v${doc.versao}?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteRhDoc({ id: doc.id, arquivoPath: doc.arquivo_path });
      addToast('Anexo excluído.', 'success');
      await loadDocs();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir anexo.', 'error');
    }
  };

  const renderGapIndicator = (gap: number, required: number) => {
    if (required === 0) return <span className="text-gray-400 text-xs">N/A</span>;
    if (gap >= 0) return <span className="flex items-center text-green-600 text-xs font-bold"><TrendingUp size={14} className="mr-1" /> Adequado</span>;
    return <span className="flex items-center text-red-600 text-xs font-bold"><TrendingDown size={14} className="mr-1" /> Gap: {gap}</span>;
  };

  const labelOperation = (op: AuditLogRow['operation']) => {
    if (op === 'INSERT') return 'Criado';
    if (op === 'UPDATE') return 'Atualizado';
    if (op === 'DELETE') return 'Excluído';
    return op;
  };

  const formatChangedFields = (row: AuditLogRow) => {
    if (row.operation !== 'UPDATE') return '';
    const oldData = row.old_data || {};
    const newData = row.new_data || {};
    const keys = Array.from(
      new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})].filter((k) => k !== 'updated_at' && k !== 'created_at'))
    );
    const changed = keys.filter((k) => JSON.stringify((oldData as any)[k]) !== JSON.stringify((newData as any)[k]));
    if (changed.length === 0) return '';
    const labels: Record<string, string> = {
      nome: 'Nome',
      email: 'E-mail',
      documento: 'Documento',
      data_admissao: 'Data de admissão',
      cargo_id: 'Cargo',
      ativo: 'Status',
      nivel_atual: 'Nível avaliado',
      data_avaliacao: 'Data da avaliação',
      origem: 'Origem',
    };
    return changed
      .slice(0, 4)
      .map((k) => labels[k] || k)
      .join(', ');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 px-6">
        <nav className="-mb-px flex space-x-6">
          <Button
            onClick={() => setActiveTab('dados')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'dados' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Dados Pessoais
          </Button>
          <Button
            onClick={() => setActiveTab('competencias')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'competencias' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Competências & Avaliação
          </Button>
          <Button
            onClick={() => setActiveTab('afastamentos')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'afastamentos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!colaborador?.id}
          >
            Afastamentos {!colaborador?.id ? '(salve primeiro)' : ''}
          </Button>
          <Button
            onClick={() => setActiveTab('anexos')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'anexos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!colaborador?.id}
          >
            Anexos {!colaborador?.id ? '(salve primeiro)' : ''}
          </Button>
          <Button
            onClick={() => setActiveTab('treinamentos')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'treinamentos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!colaborador?.id}
          >
            Treinamentos {!colaborador?.id ? '(salve primeiro)' : ''}
          </Button>
          <Button
            onClick={() => setActiveTab('historico')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'historico' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!colaborador?.id}
          >
            Histórico {!colaborador?.id ? '(salve primeiro)' : ''}
          </Button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {readOnly && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Você está em modo somente leitura. Solicite permissão para criar/editar colaboradores.
          </div>
        )}
        {activeTab === 'dados' && (
          <Section title="Identificação" description="Dados cadastrais do colaborador.">
            <Input 
              label="Nome Completo" 
              name="nome" 
              value={formData.nome || ''} 
              onChange={e => handleFormChange('nome', e.target.value)} 
              required 
              className="sm:col-span-4" 
              disabled={readOnly}
            />
            <div className="sm:col-span-2">
              <Toggle 
                label="Ativo" 
                name="ativo" 
                checked={formData.ativo !== false} 
                onChange={checked => handleFormChange('ativo', checked)} 
                disabled={readOnly}
              />
            </div>
            <Input 
              label="E-mail Corporativo" 
              name="email" 
              type="email"
              value={formData.email || ''} 
              onChange={e => handleFormChange('email', e.target.value)} 
              className="sm:col-span-3" 
              disabled={readOnly}
            />
            <Input 
              label="CPF / Documento" 
              name="documento" 
              value={formData.documento || ''} 
              onChange={e => handleFormChange('documento', e.target.value)} 
              className="sm:col-span-3" 
              disabled={readOnly}
            />
            <Input
              label="Telefone (opcional)"
              name="telefone"
              value={(formData as any).telefone || ''}
              onChange={(e) => handleFormChange('telefone', e.target.value)}
              className="sm:col-span-3"
              disabled={readOnly}
            />
            <Input
              label="Matrícula (opcional)"
              name="matricula"
              value={(formData as any).matricula || ''}
              onChange={(e) => handleFormChange('matricula', e.target.value)}
              className="sm:col-span-3"
              disabled={readOnly}
            />
            <Select 
              label="Cargo" 
              name="cargo_id" 
              value={formData.cargo_id || ''} 
              onChange={e => handleFormChange('cargo_id', e.target.value)}
              required
              className="sm:col-span-3"
              disabled={readOnly}
            >
              <option value="">Selecione...</option>
              {cargos.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
            <Input 
              label="Data de Admissão" 
              name="data_admissao" 
              type="date"
              value={formData.data_admissao || ''} 
              onChange={e => handleFormChange('data_admissao', e.target.value)} 
              className="sm:col-span-3" 
              disabled={readOnly}
            />
            <Select
              label="Status (RH)"
              name="status"
              value={(formData as any).status || 'ativo'}
              onChange={(e) => handleFormChange('status', e.target.value)}
              className="sm:col-span-3"
              disabled={readOnly}
            >
              <option value="ativo">Ativo</option>
              <option value="afastado">Afastado</option>
              <option value="ferias">Férias</option>
              <option value="licenca">Licença</option>
              <option value="desligado">Desligado</option>
            </Select>
            <Input
              label="Observações (opcional)"
              name="observacoes"
              value={(formData as any).observacoes || ''}
              onChange={(e) => handleFormChange('observacoes', e.target.value)}
              className="sm:col-span-6"
              disabled={readOnly}
            />
          </Section>
        )}

        {activeTab === 'afastamentos' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <CalendarPlus className="text-blue-600 mt-0.5" size={20} />
              <div>
                <h4 className="font-semibold text-blue-800">Afastamentos</h4>
                <p className="text-sm text-blue-700">Registre períodos de afastamento e mantenha o status do colaborador atualizado.</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <Select
                    label="Tipo"
                    name="tipo_afast"
                    value={novoAfastTipo}
                    onChange={(e) => setNovoAfastTipo(e.target.value as any)}
                    disabled={!canUpdate}
                  >
                    <option value="outros">Outros</option>
                    <option value="ferias">Férias</option>
                    <option value="licenca">Licença</option>
                    <option value="atestado">Atestado</option>
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Input
                    label="Início"
                    name="afast_inicio"
                    type="date"
                    value={novoAfastInicio}
                    onChange={(e) => setNovoAfastInicio(e.target.value)}
                    disabled={!canUpdate}
                  />
                </div>
                <div className="md:col-span-3">
                  <Input
                    label="Fim (opcional)"
                    name="afast_fim"
                    type="date"
                    value={novoAfastFim}
                    onChange={(e) => setNovoAfastFim(e.target.value)}
                    disabled={!canUpdate}
                  />
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button onClick={handleAddAfastamento} disabled={savingAfastamento || !canUpdate} className="gap-2">
                    {savingAfastamento ? <Loader2 className="animate-spin" size={16} /> : <PlusCircle size={18} />}
                    Registrar
                  </Button>
                </div>
                <div className="md:col-span-12">
                  <Input
                    label="Motivo (opcional)"
                    name="afast_motivo"
                    value={novoAfastMotivo}
                    onChange={(e) => setNovoAfastMotivo(e.target.value)}
                    disabled={!canUpdate}
                  />
                </div>
              </div>
            </div>

            <div className="border rounded-2xl overflow-hidden bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Período</th>
                    <th className="px-4 py-2 text-left">Motivo</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAfastamentos && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        <Loader2 className="inline-block w-4 h-4 animate-spin mr-2" />
                        Carregando...
                      </td>
                    </tr>
                  )}
                  {!loadingAfastamentos && afastamentos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Nenhum afastamento registrado.</td>
                    </tr>
                  )}
                  {!loadingAfastamentos &&
                    afastamentos.map((a) => {
                      const aberto = !a.data_fim;
                      return (
                        <tr key={a.id} className="border-t">
                          <td className="px-4 py-2 font-semibold text-gray-900">{a.tipo}</td>
                          <td className="px-4 py-2 text-gray-700">
                            {new Date(a.data_inicio).toLocaleDateString('pt-BR')} {a.data_fim ? `→ ${new Date(a.data_fim).toLocaleDateString('pt-BR')}` : '→ (em aberto)'}
                          </td>
                          <td className="px-4 py-2 text-gray-600">{a.motivo || '—'}</td>
                          <td className="px-4 py-2 text-right">
                            {aberto ? (
                              <Button variant="outline" size="sm" onClick={() => handleEncerrarAfastamento(a)} disabled={!canUpdate}>
                                Encerrar
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-500">Encerrado</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'anexos' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <Paperclip className="text-blue-600 mt-0.5" size={20} />
              <div>
                <h4 className="font-semibold text-blue-800">Anexos do colaborador</h4>
                <p className="text-sm text-blue-700">Anexe documentos (contrato, certificados, atestados, etc.).</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Título do anexo"
                  value={docTitulo}
                  onChange={(e) => setDocTitulo(e.target.value)}
                  placeholder="Ex: Contrato, RG, Certificado NR-12"
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
                    <th className="px-4 py-2 text-left">Versão</th>
                    <th className="px-4 py-2 text-left">Criado</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDocs && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        <Loader2 className="inline-block w-4 h-4 animate-spin mr-2" />
                        Carregando...
                      </td>
                    </tr>
                  )}
                  {!loadingDocs && docs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Nenhum anexo enviado.</td>
                    </tr>
                  )}
                  {!loadingDocs &&
                    docs.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-4 py-2">
                          <div className="font-semibold text-gray-900">{d.titulo}</div>
                          {d.descricao && <div className="text-xs text-gray-500">{d.descricao}</div>}
                        </td>
                        <td className="px-4 py-2">v{d.versao}</td>
                        <td className="px-4 py-2 text-gray-600">{new Date(d.created_at).toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDoc(d)}>
                            <Download className="w-4 h-4 mr-2" />
                            Abrir
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDoc(d)}
                            className="text-rose-600 hover:text-rose-700"
                            disabled={!canDeleteDoc}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'competencias' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="text-blue-600 mt-0.5" size={20} />
              <div>
                <h4 className="font-semibold text-blue-800">Matriz de Competências</h4>
                <p className="text-sm text-blue-700">
                  Avalie o nível atual do colaborador (1-5) em relação ao exigido pelo cargo.
                  Gaps negativos indicam necessidade de treinamento.
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-end gap-3">
              <Select
                label="Adicionar competência extra (opcional)"
                name="extra_competencia"
                value={extraCompetenciaId}
                onChange={(e) => setExtraCompetenciaId(e.target.value)}
                className="min-w-[260px] flex-1"
                disabled={readOnly}
              >
                <option value="">Selecione...</option>
                {allCompetencias
                  .filter((c) => !(formData.competencias || []).some((cc) => cc.competencia_id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.tipo})
                    </option>
                  ))}
              </Select>
              <button
                type="button"
                onClick={handleAddExtraCompetencia}
                disabled={!extraCompetenciaId || readOnly}
                className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <PlusCircle size={18} />
                Adicionar
              </button>
            </div>

            <div className="space-y-4">
              {formData.competencias?.map((comp: any) => {
                const gapNow = (comp.nivel_atual ?? 0) - (comp.nivel_requerido ?? 0);
                return (
                <motion.div 
                  key={comp.competencia_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`border rounded-lg p-4 ${comp.nivel_requerido > 0 && gapNow < 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}
                >
                  <div className="flex flex-wrap justify-between items-center gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-800">{comp.nome}</h4>
                        {comp.obrigatorio && <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">Obrigatório</span>}
                      </div>
                      <p className="text-xs text-gray-500 capitalize">{comp.tipo}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Requerido</p>
                      <p className="font-bold text-lg">{comp.nivel_requerido}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-white/50 p-3 rounded-md">
                    <div className="flex-grow">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nível Atual (Avaliação)</label>
                      <input 
                        type="range" 
                        min="0" 
                        max="5" 
                        step="1"
                        value={comp.nivel_atual} 
                        onChange={e => handleCompetenciaChange(comp.competencia_id, 'nivel_atual', parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        disabled={readOnly}
                      />
                      <div className="flex justify-between text-xs text-gray-400 px-1 mt-1">
                        <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                      </div>
                    </div>
                    <div className="min-w-[60px] text-center">
                      <span className="text-2xl font-bold text-blue-600">{comp.nivel_atual}</span>
                    </div>
                    <div className="min-w-[100px] text-right">
                      {renderGapIndicator(comp.nivel_atual - comp.nivel_requerido, comp.nivel_requerido)}
                    </div>
                  </div>
                </motion.div>
              )})}

              {(!formData.competencias || formData.competencias.length === 0) && (
                <div className="text-center py-12 text-gray-500">
                  <Minus className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                  <p>Nenhuma competência mapeada para este cargo ainda.</p>
                  <p className="text-xs">Edite o Cargo para adicionar requisitos.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'treinamentos' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <GraduationCap className="text-blue-600 mt-0.5" size={20} />
              <div>
                <h4 className="font-semibold text-blue-800">Histórico de Treinamentos</h4>
                <p className="text-sm text-blue-700">
                  Acompanhe inscrições, conclusão e eficácia por colaborador.
                </p>
              </div>
            </div>

            {loadingTreinamentos ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
              </div>
            ) : treinamentos.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Minus className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                <p>Nenhum treinamento encontrado para este colaborador.</p>
              </div>
            ) : (
              <div className="overflow-hidden border border-gray-200 rounded-lg bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left p-3">Treinamento</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Participação</th>
                      <th className="text-left p-3">Data</th>
                      <th className="text-left p-3">Eficácia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {treinamentos.map((t) => (
                      <tr key={t.treinamento_id} className="hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-800">{t.treinamento_nome}</td>
                        <td className="p-3 text-gray-600 capitalize">{t.treinamento_status?.replace(/_/g, ' ')}</td>
                        <td className="p-3 text-gray-600 capitalize">{t.participante_status?.replace(/_/g, ' ')}</td>
                        <td className="p-3 text-gray-600">
                          {t.data_inicio ? new Date(t.data_inicio).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="p-3 text-gray-600">
                          {t.eficacia_avaliada ? 'Avaliada' : 'Pendente'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-600">
                Alterações registradas em <span className="font-medium">Colaborador</span> e <span className="font-medium">Competências avaliadas</span>.
              </div>
            </div>

            {loadingAudit ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
              </div>
            ) : auditRows.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Minus className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                <p>Nenhuma alteração registrada para este colaborador.</p>
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
                        <td className="p-3 text-gray-600">
                          {new Date(r.changed_at).toLocaleString('pt-BR')}
                        </td>
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
    </div>
  );
};

export default ColaboradorFormPanel;

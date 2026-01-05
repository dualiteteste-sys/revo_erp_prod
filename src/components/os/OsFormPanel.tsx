import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Layers, Loader2, Save, Paperclip, Plus, Trash2 } from 'lucide-react';
import { OrdemServicoDetails, saveOs, deleteOsItem, getOsDetails, OsItemSearchResult, addOsItem, listOsTecnicos, setOsTecnico, type OsTecnicoRow } from '@/services/os';
import { getPartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '../ui/forms/Section';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import TextArea from '../ui/forms/TextArea';
import { Database } from '@/types/database.types';
import OsFormItems from './OsFormItems';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '../common/ClientAutocomplete';
import { Button } from '@/components/ui/button';
import OsAuditTrailPanel from '@/components/os/OsAuditTrailPanel';
import { createContaAReceberFromOs, createContasAReceberFromOsParcelas, getContaAReceberDetails, getContaAReceberFromOs, receberContaAReceber, type ContaAReceber } from '@/services/contasAReceber';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { createOsDocSignedUrl, deleteOsDoc, listOsDocs, uploadOsDoc, type OsDoc } from '@/services/osDocs';
import { useHasPermission } from '@/hooks/useHasPermission';
import { generateOsParcelas, listOsParcelas, type OsParcela } from '@/services/osParcelas';
import { ActionLockedError, runWithActionLock } from '@/lib/actionLock';
import OsEquipamentoPanel from '@/components/os/OsEquipamentoPanel';

interface OsFormPanelProps {
  os: OrdemServicoDetails | null;
  onSaveSuccess: (savedOs: OrdemServicoDetails) => void;
  onClose: () => void;
}

const statusOptions: { value: Database['public']['Enums']['status_os']; label: string }[] = [
    { value: 'orcamento', label: 'Orçamento' },
    { value: 'aberta', label: 'Aberta' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' },
];

const OsFormPanel: React.FC<OsFormPanelProps> = ({ os, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { activeEmpresaId, userId } = useAuth();
  const permCreate = useHasPermission('os', 'create');
  const permUpdate = useHasPermission('os', 'update');
  const permManage = useHasPermission('os', 'manage');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [formData, setFormData] = useState<Partial<OrdemServicoDetails>>({});
  const [clientName, setClientName] = useState('');
  const [novoAnexo, setNovoAnexo] = useState('');
  const [docs, setDocs] = useState<OsDoc[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitulo, setDocTitulo] = useState('');
  const [docDescricao, setDocDescricao] = useState('');
  const [contaReceberId, setContaReceberId] = useState<string | null>(null);
  const [contaReceber, setContaReceber] = useState<ContaAReceber | null>(null);
  const [isContaDialogOpen, setIsContaDialogOpen] = useState(false);
  const [contaVencimento, setContaVencimento] = useState<string>('');
  const [isCreatingConta, setIsCreatingConta] = useState(false);
  const [isReceivingConta, setIsReceivingConta] = useState(false);
  const [parcelas, setParcelas] = useState<OsParcela[]>([]);
  const [parcelasLoading, setParcelasLoading] = useState(false);
  const [parcelasDialogOpen, setParcelasDialogOpen] = useState(false);
  const [parcelasCondicao, setParcelasCondicao] = useState('');
  const [parcelasBaseDate, setParcelasBaseDate] = useState('');
  const [isGeneratingParcelas, setIsGeneratingParcelas] = useState(false);
  const [isGeneratingContasParcelas, setIsGeneratingContasParcelas] = useState(false);
  const [tecnicos, setTecnicos] = useState<OsTecnicoRow[]>([]);
  const [tecnicosLoading, setTecnicosLoading] = useState(false);

  const canEdit = formData.id ? permUpdate.data : permCreate.data;
  const permLoading = formData.id ? permUpdate.isLoading : permCreate.isLoading;
  const isClosed = formData.status === 'concluida' || formData.status === 'cancelada';
  const stageReadOnly = isClosed && !permManage.data;
  const readOnly = permLoading || !canEdit || stageReadOnly;

  const descontoProps = useNumericField(formData.desconto_valor, (value) => handleFormChange('desconto_valor', value));
  const custoEstimadoProps = useNumericField((formData as any).custo_estimado, (value) => handleFormChange('custo_estimado' as any, value));
  const custoRealProps = useNumericField((formData as any).custo_real, (value) => handleFormChange('custo_real' as any, value));

  useEffect(() => {
    if (os) {
      setFormData(os);
      setNovoAnexo('');
      setDocs([]);
      setDocFile(null);
      setDocTitulo('');
      setDocDescricao('');
      setContaReceberId(null);
      setContaVencimento('');
      if (os.cliente_id) {
        getPartnerDetails(os.cliente_id).then(partner => {
          if (partner) setClientName(partner.nome);
        });
      } else {
        setClientName('');
      }
    } else {
      setFormData({ status: 'orcamento', desconto_valor: 0, total_itens: 0, total_geral: 0, itens: [] });
      setClientName('');
      setNovoAnexo('');
      setDocs([]);
      setDocFile(null);
      setDocTitulo('');
      setDocDescricao('');
      setContaReceberId(null);
      setContaVencimento('');
    }
  }, [os]);

  useEffect(() => {
    if (!activeEmpresaId) return;
    if (readOnly) return;
    let cancelled = false;
    void (async () => {
      setTecnicosLoading(true);
      try {
        const rows = await listOsTecnicos({ limit: 100 });
        if (!cancelled) setTecnicos(rows ?? []);
      } catch {
        if (!cancelled) setTecnicos([]);
      } finally {
        if (!cancelled) setTecnicosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmpresaId, readOnly]);

  const loadDocs = async (osId: string) => {
    setIsDocsLoading(true);
    try {
      const data = await listOsDocs(osId);
      setDocs(data ?? []);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar anexos.', 'error');
    } finally {
      setIsDocsLoading(false);
    }
  };

  useEffect(() => {
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) return;
    void loadDocs(osId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id]);

  useEffect(() => {
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) return;

    void (async () => {
      const id = await getContaAReceberFromOs(osId);
      setContaReceberId(id);
      setContaReceber(null);
      if (id) {
        try {
          const details = await getContaAReceberDetails(id);
          setContaReceber(details);
        } catch {
          setContaReceber(null);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id]);

  useEffect(() => {
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) {
      setParcelas([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setParcelasLoading(true);
      try {
        const rows = await listOsParcelas(osId);
        if (!cancelled) setParcelas(rows ?? []);
      } catch {
        if (!cancelled) setParcelas([]);
      } finally {
        if (!cancelled) setParcelasLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id]);

  const statusOs = (formData.status as any) as Database['public']['Enums']['status_os'] | undefined;
  const canGenerateConta = !!formData.id && statusOs === 'concluida';

  const defaultVencimento = useMemo(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);

  const handleOpenContaDialog = () => {
    setContaVencimento(contaVencimento || defaultVencimento);
    setIsContaDialogOpen(true);
  };

  const handleOpenParcelasDialog = () => {
    const today = new Date().toISOString().slice(0, 10);
    setParcelasBaseDate(parcelasBaseDate || today);
    setParcelasCondicao(parcelasCondicao || String(formData.condicao_pagamento || '').trim() || '1x');
    setParcelasDialogOpen(true);
  };

  const refreshParcelas = async () => {
    if (!formData.id) return;
    try {
      setParcelasLoading(true);
      const rows = await listOsParcelas(String(formData.id));
      setParcelas(rows ?? []);
    } finally {
      setParcelasLoading(false);
    }
  };

  const handleGerarParcelas = async () => {
    if (!formData.id) return;
    setIsGeneratingParcelas(true);
    try {
      const osId = String(formData.id);
      await runWithActionLock(`os:parcelas:${osId}`, async () => {
        await generateOsParcelas({
          osId,
          condicao: parcelasCondicao || null,
          total: Number(formData.total_geral || 0) || null,
          baseDateISO: parcelasBaseDate || null,
        });
      });
      addToast('Parcelas geradas com sucesso!', 'success');
      await refreshParcelas();
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos gerando parcelas desta OS. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao gerar parcelas.', 'error');
      }
    } finally {
      setIsGeneratingParcelas(false);
    }
  };

  const handleGerarContasPorParcelas = async () => {
    if (!formData.id) return;
    if (parcelas.length === 0) {
      addToast('Gere as parcelas antes (ou use “Gerar Conta a Receber” para conta única).', 'warning');
      return;
    }
    setIsGeneratingContasParcelas(true);
    try {
      const osId = String(formData.id);
      const contas = await runWithActionLock(`os:contas_parcelas:${osId}`, async () => {
        return await createContasAReceberFromOsParcelas(osId);
      });
      if (!contas || contas.length === 0) {
        addToast('Nenhuma conta foi gerada (verifique se há parcelas canceladas).', 'warning');
        return;
      }
      addToast(`${contas.length} conta(s) a receber gerada(s).`, 'success');
      setParcelasDialogOpen(false);
      navigate(`/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(contas[0].id)}`);
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos gerando contas desta OS. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao gerar contas por parcelas.', 'error');
      }
    } finally {
      setIsGeneratingContasParcelas(false);
    }
  };

  const handleCreateConta = async () => {
    if (!formData.id) return;
    setIsCreatingConta(true);
    try {
      const osId = String(formData.id);
      const conta = await runWithActionLock(`os:conta_unica:${osId}`, async () => {
        return await createContaAReceberFromOs({
          osId,
          dataVencimento: contaVencimento || null,
        });
      });
      setContaReceberId(conta.id);
      addToast('Conta a receber gerada com sucesso!', 'success');
      setIsContaDialogOpen(false);
      navigate(`/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(conta.id)}`);
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos gerando a conta desta OS. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao gerar conta a receber.', 'error');
      }
    } finally {
      setIsCreatingConta(false);
    }
  };

  const handleOpenConta = () => {
    if (!contaReceberId) return;
    navigate(`/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(contaReceberId)}`);
  };

  const handleReceberContaAgora = async () => {
    if (!contaReceberId || !contaReceber) return;
    if (contaReceber.status === 'pago' || contaReceber.status === 'cancelado') {
      handleOpenConta();
      return;
    }

    const ok = await confirm({
      title: 'Registrar recebimento',
      description: `Deseja marcar esta conta como paga hoje? Valor: ${new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(contaReceber.valor || 0)}.`,
      confirmText: 'Registrar recebimento',
      cancelText: 'Cancelar',
      variant: 'default',
    });
    if (!ok) return;

    setIsReceivingConta(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const updated = await receberContaAReceber({
        id: contaReceberId,
        dataPagamento: today,
        valorPago: Number(contaReceber.valor || 0),
      });
      setContaReceber(updated);
      addToast('Recebimento registrado com sucesso!', 'success');
      navigate(`/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(contaReceberId)}`);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao registrar recebimento.', 'error');
    } finally {
      setIsReceivingConta(false);
    }
  };

  const contaStatusBadge = useMemo(() => {
    if (!contaReceber) return null;
    const map: Record<string, { label: string; color: string }> = {
      pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
      pago: { label: 'Pago', color: 'bg-green-100 text-green-800' },
      vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
      cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800' },
    };
    const cfg = map[contaReceber.status] || { label: contaReceber.status, color: 'bg-gray-100 text-gray-800' };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>;
  }, [contaReceber]);

  const refreshOsData = async (osId: string) => {
    try {
        const updatedOs = await getOsDetails(osId);
        setFormData(updatedOs);
    } catch (error: any) {
        addToast("Erro ao atualizar dados da O.S.", "error");
    }
  };

  const handleFormChange = (field: keyof OrdemServicoDetails, value: any) => {
    if (readOnly) return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const anexos = (formData.anexos || []) as string[];

  const handleAddAnexo = () => {
    if (readOnly) {
      addToast('Você não tem permissão para editar esta O.S.', 'warning');
      return;
    }
    const value = novoAnexo.trim();
    if (!value) return;
    if (anexos.includes(value)) {
      addToast('Este anexo já foi adicionado.', 'warning');
      return;
    }
    handleFormChange('anexos' as any, [...anexos, value]);
    setNovoAnexo('');
  };

  const handleRemoveAnexo = (value: string) => {
    if (readOnly) return;
    handleFormChange('anexos' as any, anexos.filter((a) => a !== value));
  };

  const handleRemoveItem = async (itemId: string) => {
    if (readOnly) {
      addToast('Você não tem permissão para editar itens.', 'warning');
      return;
    }
    try {
        await deleteOsItem(itemId);
        if(formData.id) await refreshOsData(formData.id);
        addToast('Item removido.', 'success');
    } catch (error: any) {
        addToast(error.message, 'error');
    }
  };

  const handleUploadDoc = async () => {
    if (readOnly) {
      addToast('Você não tem permissão para anexar arquivos.', 'warning');
      return;
    }
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) {
      addToast('Salve a O.S. antes de anexar arquivos.', 'warning');
      return;
    }
    if (!activeEmpresaId) {
      addToast('Nenhuma empresa ativa encontrada.', 'error');
      return;
    }
    if (!docFile) {
      addToast('Selecione um arquivo para enviar.', 'warning');
      return;
    }

    const title = (docTitulo || docFile.name).trim();
    setIsUploadingDoc(true);
    try {
      await uploadOsDoc({
        empresaId: activeEmpresaId,
        osId,
        titulo: title,
        descricao: docDescricao.trim() ? docDescricao.trim() : null,
        file: docFile,
      });
      addToast('Anexo enviado com sucesso!', 'success');
      setDocFile(null);
      setDocTitulo('');
      setDocDescricao('');
      await loadDocs(osId);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao enviar anexo.', 'error');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleOpenDoc = async (arquivoPath: string) => {
    try {
      const url = await createOsDocSignedUrl(arquivoPath, 3600);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao abrir anexo.', 'error');
    }
  };

  const handleDeleteDoc = async (doc: OsDoc) => {
    if (readOnly) {
      addToast('Você não tem permissão para excluir anexos.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Excluir anexo',
      description: `Deseja excluir o anexo “${doc.titulo}”?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setIsUploadingDoc(true);
    try {
      await deleteOsDoc({ id: doc.id, arquivoPath: doc.arquivo_path });
      addToast('Anexo excluído.', 'success');
      const osId = formData.id ? String(formData.id) : null;
      if (osId) await loadDocs(osId);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir anexo.', 'error');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleAddItem = async (item: OsItemSearchResult) => {
    if (readOnly) {
      addToast('Você não tem permissão para editar itens.', 'warning');
      return;
    }
    setIsAddingItem(true);
    try {
      let osToUpdate = formData;
  
      if (!osToUpdate.id) {
        if (!osToUpdate.descricao) {
          addToast('Adicione uma descrição à O.S. antes de adicionar itens.', 'warning');
          setIsAddingItem(false);
          return;
        }
        osToUpdate = await saveOs(osToUpdate);
        setFormData(osToUpdate); // Update form data with the newly created OS
      }
  
      const osId = osToUpdate.id!;
      
      const payload = item.type === 'service'
        ? { servico_id: item.id, qtd: 1 }
        : { produto_id: item.id, quantidade: 1 };

      await addOsItem(osId, payload);
  
      const updatedOs = await getOsDetails(osId);
      setFormData(updatedOs);
  
      addToast(`${item.type === 'service' ? 'Serviço' : 'Produto'} adicionado.`, 'success');
    } catch (error: any) {
      addToast(error.message || 'Falha ao adicionar item à Ordem de Serviço.', 'error');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleSave = async () => {
    if (readOnly) {
      addToast('Você não tem permissão para salvar esta O.S.', 'warning');
      return;
    }
    if (!formData.descricao) {
      addToast('A descrição da O.S. é obrigatória.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const savedOs = await saveOs(formData);
      const desiredTecnicoUserId = (formData as any).tecnico_user_id ?? null;
      const currentTecnicoUserId = (savedOs as any).tecnico_user_id ?? null;
      if (desiredTecnicoUserId !== currentTecnicoUserId) {
        try {
          await setOsTecnico(String(savedOs.id), desiredTecnicoUserId);
        } catch (e: any) {
          addToast(e?.message || 'Não foi possível atribuir técnico.', 'warning');
        }
      }

      const finalOs = await getOsDetails(String(savedOs.id));
      addToast('Ordem de Serviço salva com sucesso!', 'success');
      onSaveSuccess(finalOs);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {readOnly ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Você não tem permissão para editar esta O.S. (modo somente leitura).
          </div>
        ) : null}
        <Section title="Dados Gerais" description="Informações principais da Ordem de Serviço">
          <Input
            label="Número"
            name="numero"
            value={formData.numero ?? ''}
            readOnly
            className="sm:col-span-2"
          />
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={clientName}
              disabled={readOnly}
              onChange={(id, name) => {
                handleFormChange('cliente_id', id);
                handleFormChange('equipamento_id' as any, null);
                if (name) setClientName(name);
              }}
              placeholder="Buscar cliente..."
            />
          </div>
          <Input label="Descrição do Serviço" name="descricao" value={formData.descricao || ''} onChange={e => handleFormChange('descricao', e.target.value)} required className="sm:col-span-4" disabled={readOnly} />
          <Select label="Status" name="status" value={formData.status || 'orcamento'} onChange={e => handleFormChange('status', e.target.value)} className="sm:col-span-2" disabled={readOnly}>
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Técnico responsável</label>
            <div className="flex gap-2 items-center">
              <Select
                name="tecnico_user_id"
                value={(formData as any).tecnico_user_id || ''}
                onChange={(e) => handleFormChange('tecnico_user_id' as any, e.target.value || null)}
                disabled={readOnly || tecnicosLoading}
                className="flex-1"
              >
                <option value="">Sem técnico</option>
                {tecnicos.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.nome || t.email}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleFormChange('tecnico_user_id' as any, userId)}
                disabled={readOnly || !userId}
                title="Atribuir a mim"
              >
                Atribuir a mim
              </Button>
            </div>
            {tecnicosLoading ? <div className="text-xs text-gray-500 mt-1">Carregando técnicos…</div> : null}
          </div>
        </Section>

        <OsEquipamentoPanel
          clienteId={formData.cliente_id || null}
          equipamentoId={(formData as any).equipamento_id ?? null}
          onChangeEquipamentoId={(id) => handleFormChange('equipamento_id' as any, id)}
          readOnly={readOnly}
        />

        <Section title="Datas e Prazos" description="Agendamento e execução do serviço">
          <Input label="Data de Início" name="data_inicio" type="date" value={formData.data_inicio?.split('T')[0] || ''} onChange={e => handleFormChange('data_inicio', e.target.value)} className="sm:col-span-2" disabled={readOnly} />
          <Input label="Data Prevista" name="data_prevista" type="date" value={formData.data_prevista?.split('T')[0] || ''} onChange={e => handleFormChange('data_prevista', e.target.value)} className="sm:col-span-2" disabled={readOnly} />
          <Input label="Hora" name="hora" type="time" value={formData.hora || ''} onChange={e => handleFormChange('hora', e.target.value)} className="sm:col-span-2" disabled={readOnly} />
        </Section>
        
        <OsFormItems items={formData.itens || []} onRemoveItem={handleRemoveItem} onAddItem={handleAddItem} isAddingItem={isAddingItem} readOnly={readOnly} />

        <Section title="Custos" description="Controle básico de custos para cálculo de margem e relatórios.">
          <Input label="Custo Estimado (R$)" name="custo_estimado" {...custoEstimadoProps} className="sm:col-span-3" disabled={readOnly} />
          <Input label="Custo Real (R$)" name="custo_real" {...custoRealProps} className="sm:col-span-3" disabled={readOnly} />
        </Section>

        <Section title="Financeiro" description="Valores e condições de pagamento">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total dos Itens</label>
            <div className="p-3 bg-gray-100 rounded-lg text-right font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_itens || 0)}</div>
          </div>
          <Input label="Desconto (R$)" name="desconto_valor" {...descontoProps} className="sm:col-span-2" disabled={readOnly} />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Geral</label>
            <div className="p-3 bg-blue-100 text-blue-800 rounded-lg text-right font-bold text-lg">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_geral || 0)}</div>
          </div>
          <Input label="Forma de Recebimento" name="forma_recebimento" value={formData.forma_recebimento || ''} onChange={e => handleFormChange('forma_recebimento', e.target.value)} className="sm:col-span-3" disabled={readOnly} />
          <Input label="Condição de Pagamento" name="condicao_pagamento" value={formData.condicao_pagamento || ''} onChange={e => handleFormChange('condicao_pagamento', e.target.value)} className="sm:col-span-3" disabled={readOnly} />

          {canGenerateConta ? (
            <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Conta a receber vinculada à OS concluída.</span>
                {contaStatusBadge}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenParcelasDialog}
                  disabled={parcelasLoading}
                  className="gap-2"
                  title="Parcelar e/ou gerar contas por parcela"
                >
                  {parcelasLoading ? <Loader2 className="animate-spin" size={18} /> : <Layers size={18} />}
                  Parcelas
                </Button>
                {contaReceberId ? (
                  <>
                    {contaReceber && contaReceber.status !== 'pago' && contaReceber.status !== 'cancelado' ? (
                      <Button type="button" onClick={handleReceberContaAgora} disabled={isReceivingConta} className="gap-2">
                        {isReceivingConta ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                        Registrar Recebimento
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={handleOpenConta} className="gap-2">
                      <FileText size={18} />
                      Abrir Conta
                    </Button>
                  </>
                ) : (
                  <Button type="button" onClick={handleOpenContaDialog} className="gap-2">
                    <FileText size={18} />
                    Gerar Conta a Receber
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </Section>

        <Section title="Observações" description="Detalhes adicionais e anotações internas">
            <TextArea label="Observações" name="observacoes" value={formData.observacoes || ''} onChange={e => handleFormChange('observacoes', e.target.value)} rows={3} className="sm:col-span-3" disabled={readOnly} />
            <TextArea label="Observações Internas" name="observacoes_internas" value={formData.observacoes_internas || ''} onChange={e => handleFormChange('observacoes_internas', e.target.value)} rows={3} className="sm:col-span-3" disabled={readOnly} />
        </Section>

        <Section title="Arquivos" description="Anexos enviados para o sistema (PDFs, fotos, comprovantes).">
          <Input
            label="Título (opcional)"
            name="doc_titulo"
            value={docTitulo}
            onChange={(e) => setDocTitulo(e.target.value)}
            placeholder="Ex.: Foto do equipamento, Laudo, etc."
            className="sm:col-span-3"
            disabled={readOnly}
          />
          <Input
            label="Descrição (opcional)"
            name="doc_descricao"
            value={docDescricao}
            onChange={(e) => setDocDescricao(e.target.value)}
            placeholder="Detalhe rápido do anexo"
            className="sm:col-span-3"
            disabled={readOnly}
          />
          <div className="sm:col-span-6 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
              <input
                aria-label="Arquivo"
                type="file"
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-200 rounded-lg px-3 py-2 bg-white"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                disabled={readOnly}
              />
              {docFile ? (
                <div className="text-xs text-gray-500 mt-1 truncate" title={docFile.name}>
                  Selecionado: {docFile.name}
                </div>
              ) : null}
            </div>
            <Button type="button" onClick={handleUploadDoc} disabled={isUploadingDoc || readOnly} className="gap-2">
              {isUploadingDoc ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              Enviar
            </Button>
          </div>

          <div className="sm:col-span-6">
            {isDocsLoading ? (
              <div className="py-6 flex items-center justify-center text-sm text-gray-500">
                <Loader2 className="animate-spin mr-2" size={18} />
                Carregando anexos…
              </div>
            ) : docs.length === 0 ? (
              <div className="text-sm text-gray-500 py-3">Nenhum arquivo anexado.</div>
            ) : (
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate" title={d.titulo}>{d.titulo}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(d.created_at).toLocaleString('pt-BR')}
                        {typeof d.tamanho_bytes === 'number' ? ` • ${(d.tamanho_bytes / 1024 / 1024).toFixed(2)} MB` : ''}
                      </div>
                      {d.descricao ? <div className="text-xs text-gray-600 mt-1">{d.descricao}</div> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="gap-2" onClick={() => handleOpenDoc(d.arquivo_path)}>
                        <FileText size={16} />
                        Abrir
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="text-rose-600 hover:text-rose-700" onClick={() => handleDeleteDoc(d)} disabled={readOnly}>
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title="Anexos" description="Links/arquivos relacionados (fotos, PDFs, comprovantes).">
          <div className="sm:col-span-6 flex gap-2 items-end">
            <Input
              label="Adicionar anexo (URL ou caminho)"
              name="novo_anexo"
              value={novoAnexo}
              onChange={(e) => setNovoAnexo(e.target.value)}
              className="flex-1"
              startAdornment={<Paperclip size={18} />}
              disabled={readOnly}
            />
            <Button type="button" onClick={handleAddAnexo} className="gap-2" disabled={readOnly}>
              <Plus size={18} />
              Adicionar
            </Button>
          </div>
          <div className="sm:col-span-6 space-y-2">
            {anexos.length === 0 ? (
              <div className="text-sm text-gray-500 py-3">Nenhum anexo adicionado.</div>
            ) : (
              anexos.map((a) => (
                <div key={a} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <a
                    href={a}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-700 hover:underline truncate"
                    title={a}
                  >
                    {a}
                  </a>
                  <Button type="button" variant="ghost" size="icon" className="text-rose-600 hover:text-rose-700" onClick={() => handleRemoveAnexo(a)} disabled={readOnly}>
                    <Trash2 size={18} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </Section>

        {formData.id ? (
          <div className="mt-6">
            <OsAuditTrailPanel osId={String(formData.id)} />
          </div>
        ) : null}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <Button type="button" onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || readOnly} className="gap-2">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar O.S.
          </Button>
        </div>
      </footer>

      <Dialog open={isContaDialogOpen} onOpenChange={setIsContaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Conta a Receber</DialogTitle>
            <DialogDescription>
              Cria uma conta a receber vinculada a esta OS. Se já existir uma conta vinculada, o sistema retorna a existente.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            <Input
              label="Data de vencimento"
              name="conta_vencimento"
              type="date"
              value={contaVencimento}
              onChange={(e) => setContaVencimento(e.target.value)}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsContaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreateConta} disabled={isCreatingConta} className="gap-2">
              {isCreatingConta ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
              Gerar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={parcelasDialogOpen}
        onOpenChange={(open) => {
          setParcelasDialogOpen(open);
          if (open) void refreshParcelas();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Parcelas & Financeiro</DialogTitle>
            <DialogDescription>
              Gere parcelas (condição de pagamento) e, se desejar, crie <b>contas a receber</b> por parcela (idempotente).
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <Input
              label="Condição (ex.: 30 60 90 | 3x | 2x +1x)"
              name="parcelas_cond"
              value={parcelasCondicao}
              onChange={(e) => setParcelasCondicao(e.target.value)}
              className="md:col-span-4"
            />
            <Input
              label="Base"
              name="parcelas_base"
              type="date"
              value={parcelasBaseDate}
              onChange={(e) => setParcelasBaseDate(e.target.value)}
              className="md:col-span-2"
            />
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => void refreshParcelas()} disabled={parcelasLoading}>
              {parcelasLoading ? <Loader2 className="animate-spin" size={18} /> : 'Atualizar'}
            </Button>
            <Button type="button" onClick={handleGerarParcelas} disabled={isGeneratingParcelas} className="gap-2">
              {isGeneratingParcelas ? <Loader2 className="animate-spin" size={18} /> : <Layers size={18} />}
              Gerar parcelas
            </Button>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
              Parcelas ({parcelas.length})
            </div>
            <div className="max-h-[280px] overflow-auto bg-white">
              {parcelasLoading ? (
                <div className="p-6 flex items-center justify-center text-sm text-gray-500">
                  <Loader2 className="animate-spin mr-2" size={18} />
                  Carregando parcelas…
                </div>
              ) : parcelas.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">
                  Nenhuma parcela gerada ainda. Use “Gerar parcelas” acima.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-white sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Vencimento</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {parcelas.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-800">{p.numero_parcela}</td>
                        <td className="px-4 py-2 text-sm text-gray-800">
                          {new Date(`${p.vencimento}T00:00:00`).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-800 text-right">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.valor || 0))}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {p.status === 'paga' ? 'Paga' : p.status === 'cancelada' ? 'Cancelada' : 'Aberta'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setParcelasDialogOpen(false)}>
              Fechar
            </Button>
            <Button
              type="button"
              onClick={handleGerarContasPorParcelas}
              disabled={isGeneratingContasParcelas || parcelas.length === 0}
              className="gap-2"
            >
              {isGeneratingContasParcelas ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
              Gerar contas por parcelas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OsFormPanel;

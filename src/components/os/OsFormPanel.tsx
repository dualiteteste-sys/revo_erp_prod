import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Layers, Loader2, Save, Paperclip, Plus, Trash2, Send, ThumbsDown, ThumbsUp, ClipboardList, RefreshCw } from 'lucide-react';
import { OrdemServicoDetails, saveOs, deleteOsItem, getOsDetails, OsItemSearchResult, addOsItem, listOsTecnicos, setOsTecnico, type OsTecnicoRow, getOsOrcamento, enviarOrcamento, decidirOrcamento, type OsOrcamentoSummary } from '@/services/os';
import { getPartnerDetails, type PartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '../ui/forms/Section';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import TextArea from '../ui/forms/TextArea';
import OsFormItems from './OsFormItems';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '../common/ClientAutocomplete';
import MeioPagamentoDropdown from '@/components/common/MeioPagamentoDropdown';
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
import { getOsChecklist, listOsChecklistTemplates, setOsChecklistTemplate, toggleOsChecklistItem, type OsChecklistPayload, type OsChecklistTemplate } from '@/services/osChecklist';
import { createOsPortalLink, listOsCommsLogs, listOsCommsTemplates, registerOsCommsLog, type OsCommsLog, type OsCommsTemplate } from '@/services/osComms';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

type OsStatus = 'orcamento' | 'aberta' | 'concluida' | 'cancelada';

interface OsFormPanelProps {
  os: OrdemServicoDetails | null;
  onSaveSuccess: (savedOs: OrdemServicoDetails) => void;
  onClose: () => void;
}

const statusOptions: { value: OsStatus; label: string }[] = [
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
  const [orcamentoSummary, setOrcamentoSummary] = useState<OsOrcamentoSummary | null>(null);
  const [orcamentoLoading, setOrcamentoLoading] = useState(false);
  const [orcamentoSendDialogOpen, setOrcamentoSendDialogOpen] = useState(false);
  const [orcamentoMensagem, setOrcamentoMensagem] = useState('');
  const [orcamentoSending, setOrcamentoSending] = useState(false);
  const [orcamentoDecideDialogOpen, setOrcamentoDecideDialogOpen] = useState(false);
  const [orcamentoDecisao, setOrcamentoDecisao] = useState<'approved' | 'rejected'>('approved');
  const [orcamentoClienteNome, setOrcamentoClienteNome] = useState('');
  const [orcamentoObservacao, setOrcamentoObservacao] = useState('');
  const [orcamentoDeciding, setOrcamentoDeciding] = useState(false);
  const [checklist, setChecklist] = useState<OsChecklistPayload | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<OsChecklistTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [clientDetails, setClientDetails] = useState<PartnerDetails | null>(null);
  const [commsTemplates, setCommsTemplates] = useState<OsCommsTemplate[]>([]);
  const [commsLogs, setCommsLogs] = useState<OsCommsLog[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsDialogOpen, setCommsDialogOpen] = useState(false);
  const [commsCanal, setCommsCanal] = useState<'whatsapp' | 'email'>('whatsapp');
  const [commsTemplateSlug, setCommsTemplateSlug] = useState<string>('');
  const [commsPreview, setCommsPreview] = useState<string>('');
  const [commsAssunto, setCommsAssunto] = useState<string>('');
  const [commsTo, setCommsTo] = useState<string>('');
  const [portalUrl, setPortalUrl] = useState<string>('');
  const [portalGenerating, setPortalGenerating] = useState(false);
  const [commsRegistering, setCommsRegistering] = useState(false);
  const [commsSort, setCommsSort] = useState<SortState<string>>({ column: 'quando', direction: 'desc' });
  const [parcelasSort, setParcelasSort] = useState<SortState<string>>({ column: 'numero', direction: 'asc' });

  const commsColumns: TableColumnWidthDef[] = [
    { id: 'quando', defaultWidth: 220, minWidth: 200 },
    { id: 'canal', defaultWidth: 140, minWidth: 120 },
    { id: 'direcao', defaultWidth: 160, minWidth: 140 },
    { id: 'para_de', defaultWidth: 360, minWidth: 180 },
  ];
  const { widths: commsWidths, startResize: startCommsResize } = useTableColumnWidths({
    tableId: 'os:comunicacao:logs',
    columns: commsColumns,
  });
  const sortedCommsLogs = useMemo(() => {
    return sortRows(
      commsLogs,
      commsSort as any,
      [
        { id: 'quando', type: 'date', getValue: (l) => l.created_at },
        { id: 'canal', type: 'string', getValue: (l) => l.canal ?? '' },
        { id: 'direcao', type: 'string', getValue: (l) => (l.direction === 'outbound' ? 'Saída' : 'Entrada') },
        { id: 'para_de', type: 'string', getValue: (l) => l.to_value ?? l.actor_email ?? '' },
      ] as const
    );
  }, [commsLogs, commsSort]);

  const parcelasColumns: TableColumnWidthDef[] = [
    { id: 'numero', defaultWidth: 80, minWidth: 64 },
    { id: 'vencimento', defaultWidth: 200, minWidth: 180 },
    { id: 'valor', defaultWidth: 160, minWidth: 140 },
    { id: 'status', defaultWidth: 160, minWidth: 140 },
  ];
  const { widths: parcelasWidths, startResize: startParcelasResize } = useTableColumnWidths({
    tableId: 'os:parcelas',
    columns: parcelasColumns,
  });
  const sortedParcelas = useMemo(() => {
    return sortRows(
      parcelas,
      parcelasSort as any,
      [
        { id: 'numero', type: 'number', getValue: (p) => p.numero_parcela ?? 0 },
        { id: 'vencimento', type: 'date', getValue: (p) => p.vencimento },
        { id: 'valor', type: 'number', getValue: (p) => Number(p.valor || 0) },
        { id: 'status', type: 'string', getValue: (p) => p.status ?? '' },
      ] as const
    );
  }, [parcelas, parcelasSort]);

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
          if (partner) {
            setClientName(partner.nome);
            setClientDetails(partner);
          }
        });
      } else {
        setClientName('');
        setClientDetails(null);
      }
    } else {
      setFormData({ status: 'orcamento', desconto_valor: 0, total_itens: 0, total_geral: 0, itens: [] });
      setClientName('');
      setClientDetails(null);
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
    if (formData.cliente_id) {
      getPartnerDetails(String(formData.cliente_id)).then((partner) => {
        if (partner) setClientDetails(partner);
      });
    } else {
      setClientDetails(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.cliente_id]);

  const loadComms = async (osId: string) => {
    setCommsLoading(true);
    try {
      const [tpls, logs] = await Promise.all([
        listOsCommsTemplates({ canal: commsCanal, limit: 100 }),
        listOsCommsLogs(osId, 50),
      ]);
      setCommsTemplates(tpls ?? []);
      setCommsLogs(logs ?? []);
    } catch {
      setCommsTemplates([]);
      setCommsLogs([]);
    } finally {
      setCommsLoading(false);
    }
  };

  useEffect(() => {
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) {
      setCommsLogs([]);
      setCommsTemplates([]);
      return;
    }
    void loadComms(osId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id, commsCanal]);

  const normalizePhone = (raw?: string | null) => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('55')) return digits;
    return `55${digits}`;
  };

  const osStatusLabel = (s?: string | null) => {
    const map: Record<string, string> = {
      orcamento: 'Orçamento',
      aberta: 'Aberta',
      concluida: 'Concluída',
      cancelada: 'Cancelada',
    };
    const key = String(s ?? '').toLowerCase();
    return map[key] ?? String(s ?? '');
  };

  const buildPortalUrlFromPath = (path: string) => {
    try {
      const base = window.location.origin;
      return new URL(path, base).toString();
    } catch {
      return path;
    }
  };

  const interpolateTemplate = (template: string) => {
    const numero = formData.numero ?? '';
    const descricao = formData.descricao ?? '';
    const status = osStatusLabel(String(formData.status ?? ''));
    const cliente = clientDetails?.nome ?? clientName ?? '';
    const replaceToken = (s: string, token: string, value: string) => s.split(token).join(value);
    return [
      ['{{os_numero}}', String(numero)],
      ['{{os_descricao}}', String(descricao)],
      ['{{os_status_label}}', String(status)],
      ['{{cliente_nome}}', String(cliente)],
      ['{{portal_url}}', portalUrl || ''],
    ].reduce((acc, [token, value]) => replaceToken(acc, token, value), template);
  };

  useEffect(() => {
    const tpl = commsTemplates.find((t) => t.slug === commsTemplateSlug) || null;
    if (!tpl) {
      setCommsPreview('');
      setCommsAssunto('');
      return;
    }
    setCommsAssunto(interpolateTemplate(tpl.assunto || ''));
    setCommsPreview(interpolateTemplate(tpl.corpo || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commsTemplateSlug, portalUrl, formData.numero, formData.descricao, formData.status, clientDetails?.nome, clientName, commsTemplates]);

  const handleGeneratePortalLink = async () => {
    if (!formData.id) return;
    setPortalGenerating(true);
    try {
      const osId = String(formData.id);
      const payload = await runWithActionLock(`os:portal_link:${osId}`, async () => {
        return await createOsPortalLink({ osId, expiresInDays: 30 });
      });
      const url = buildPortalUrlFromPath(payload.path);
      setPortalUrl(url);
      await navigator.clipboard.writeText(url);
      addToast('Link do portal copiado.', 'success');
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos gerando o link. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao gerar link do portal.', 'error');
      }
    } finally {
      setPortalGenerating(false);
    }
  };

  const handleCopyComms = async () => {
    if (!commsPreview.trim()) return;
    await navigator.clipboard.writeText(commsPreview);
    addToast('Mensagem copiada.', 'success');
  };

  const handleRegisterComms = async () => {
    if (!formData.id) return;
    if (!commsPreview.trim()) {
      addToast('Selecione um template para registrar.', 'warning');
      return;
    }
    setCommsRegistering(true);
    try {
      const osId = String(formData.id);
      await runWithActionLock(`os:comms:register:${osId}`, async () => {
        await registerOsCommsLog({
          osId,
          canal: commsCanal,
          toValue: commsTo || null,
          assunto: commsCanal === 'email' ? (commsAssunto.trim() || null) : null,
          corpo: commsPreview,
          templateSlug: commsTemplateSlug || null,
        });
      });
      addToast('Envio registrado no log.', 'success');
      setCommsDialogOpen(false);
      await loadComms(osId);
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos registrando este envio. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao registrar envio.', 'error');
      }
    } finally {
      setCommsRegistering(false);
    }
  };

  const refreshOrcamento = async (osId: string) => {
    setOrcamentoLoading(true);
    try {
      const data = await getOsOrcamento(osId);
      setOrcamentoSummary(data);
      setOrcamentoClienteNome(data.cliente_nome || '');
      setOrcamentoObservacao(data.observacao || '');
    } catch (e: any) {
      setOrcamentoSummary(null);
    } finally {
      setOrcamentoLoading(false);
    }
  };

  useEffect(() => {
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) {
      setOrcamentoSummary(null);
      return;
    }
    void refreshOrcamento(osId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id]);

  const refreshChecklist = async (osId: string) => {
    setChecklistLoading(true);
    try {
      const data = await getOsChecklist(osId);
      setChecklist(data);
    } catch {
      setChecklist(null);
    } finally {
      setChecklistLoading(false);
    }
  };

  useEffect(() => {
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) {
      setChecklist(null);
      return;
    }
    void refreshChecklist(osId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id]);

  const openChecklistTemplates = async () => {
    setChecklistDialogOpen(true);
    setTemplatesLoading(true);
    try {
      const rows = await listOsChecklistTemplates({ limit: 100 });
      setTemplates(rows ?? []);
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleSelectChecklistTemplate = async (templateSlug: string) => {
    if (readOnly) return;
    if (!formData.id) {
      addToast('Salve a O.S. antes de aplicar um checklist.', 'warning');
      return;
    }
    const osId = String(formData.id);
    try {
      await runWithActionLock(`os:checklist:set:${osId}`, async () => {
        await setOsChecklistTemplate(osId, templateSlug);
      });
      addToast('Checklist aplicado.', 'success');
      setChecklistDialogOpen(false);
      await refreshChecklist(osId);
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos aplicando checklist nesta OS. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao aplicar checklist.', 'error');
      }
    }
  };

  const handleToggleChecklistItem = async (stepId: string, done: boolean) => {
    if (readOnly) return;
    if (!formData.id) return;
    const osId = String(formData.id);
    try {
      await runWithActionLock(`os:checklist:toggle:${osId}:${stepId}`, async () => {
        await toggleOsChecklistItem(osId, stepId, done);
      });
      await refreshChecklist(osId);
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Aguarde: já estamos atualizando este checklist.', 'info');
      } else {
        addToast(e?.message || 'Erro ao atualizar checklist.', 'error');
      }
    }
  };

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

  const statusOs = (formData.status as any) as OsStatus | undefined;
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
	      variant: 'primary',
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

  const orcamentoBadge = useMemo(() => {
    if (orcamentoLoading) {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
          <Loader2 className="animate-spin" size={14} /> Carregando…
        </span>
      );
    }
    if (!orcamentoSummary) return null;
    const map: Record<string, { label: string; color: string }> = {
      draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-800' },
      sent: { label: 'Enviado', color: 'bg-blue-100 text-blue-800' },
      approved: { label: 'Aprovado', color: 'bg-green-100 text-green-800' },
      rejected: { label: 'Reprovado', color: 'bg-rose-100 text-rose-800' },
    };
    const cfg = map[orcamentoSummary.orcamento_status] || { label: orcamentoSummary.orcamento_status, color: 'bg-gray-100 text-gray-800' };
    return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>;
  }, [orcamentoLoading, orcamentoSummary]);

  const handleEnviarOrcamento = async () => {
    if (readOnly) {
      addToast('Você não tem permissão para enviar orçamento.', 'warning');
      return;
    }
    if (!formData.id) {
      addToast('Salve a O.S. antes de enviar o orçamento.', 'warning');
      return;
    }
    setOrcamentoSending(true);
    try {
      const osId = String(formData.id);
      await runWithActionLock(`os:orcamento:send:${osId}`, async () => {
        await enviarOrcamento(osId, orcamentoMensagem.trim() ? orcamentoMensagem.trim() : null);
      });
      addToast('Orçamento marcado como enviado.', 'success');
      setOrcamentoSendDialogOpen(false);
      setOrcamentoMensagem('');
      await refreshOrcamento(osId);
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos enviando este orçamento. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao enviar orçamento.', 'error');
      }
    } finally {
      setOrcamentoSending(false);
    }
  };

  const openDecideDialog = (decisao: 'approved' | 'rejected') => {
    setOrcamentoDecisao(decisao);
    setOrcamentoDecideDialogOpen(true);
  };

  const handleDecidirOrcamento = async () => {
    if (!formData.id) return;
    if (!permManage.data) {
      addToast('Você não tem permissão para aprovar/reprovar orçamento.', 'warning');
      return;
    }
    const clienteNome = orcamentoClienteNome.trim();
    if (!clienteNome) {
      addToast('Informe o nome do cliente/responsável pelo aceite.', 'warning');
      return;
    }
    setOrcamentoDeciding(true);
    try {
      const osId = String(formData.id);
      await runWithActionLock(`os:orcamento:decide:${osId}`, async () => {
        await decidirOrcamento({
          osId,
          decisao: orcamentoDecisao,
          clienteNome,
          observacao: orcamentoObservacao.trim() ? orcamentoObservacao.trim() : null,
        });
      });
      addToast(orcamentoDecisao === 'approved' ? 'Orçamento aprovado.' : 'Orçamento reprovado.', 'success');
      setOrcamentoDecideDialogOpen(false);
      await refreshOrcamento(osId);
    } catch (e: any) {
      if (e instanceof ActionLockedError) {
        addToast('Já estamos registrando uma decisão deste orçamento. Aguarde alguns segundos.', 'info');
      } else {
        addToast(e?.message || 'Erro ao registrar decisão.', 'error');
      }
    } finally {
      setOrcamentoDeciding(false);
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
          <Input label="Custo Estimado" name="custo_estimado" startAdornment="R$" inputMode="numeric" {...custoEstimadoProps} className="sm:col-span-3" disabled={readOnly} />
          <Input label="Custo Real" name="custo_real" startAdornment="R$" inputMode="numeric" {...custoRealProps} className="sm:col-span-3" disabled={readOnly} />
        </Section>

        <Section title="Financeiro" description="Valores e condições de pagamento">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total dos Itens</label>
            <div className="p-3 bg-gray-100 rounded-lg text-right font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_itens || 0)}</div>
          </div>
          <Input label="Desconto" name="desconto_valor" startAdornment="R$" inputMode="numeric" {...descontoProps} className="sm:col-span-2" disabled={readOnly} />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Geral</label>
            <div className="p-3 bg-blue-100 text-blue-800 rounded-lg text-right font-bold text-lg">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_geral || 0)}</div>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Recebimento</label>
            <MeioPagamentoDropdown
              tipo="recebimento"
              value={formData.forma_recebimento || null}
              onChange={(name) => handleFormChange('forma_recebimento', name || '')}
              placeholder="Selecionar…"
              disabled={readOnly}
            />
          </div>
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

        <Section title="Orçamento & Aprovação" description="Envio e registro de aceite do cliente (auditável).">
          <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {orcamentoBadge}
              {orcamentoSummary?.sent_at ? (
                <span className="text-xs text-gray-500">
                  Enviado em {new Date(orcamentoSummary.sent_at).toLocaleString('pt-BR')}
                </span>
              ) : null}
              {orcamentoSummary?.decided_at ? (
                <span className="text-xs text-gray-500">
                  Decidido em {new Date(orcamentoSummary.decided_at).toLocaleString('pt-BR')}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOrcamentoSendDialogOpen(true)}
                disabled={readOnly || !permUpdate.data || !formData.id}
                className="gap-2"
                title={!formData.id ? 'Salve a OS antes.' : undefined}
              >
                <Send size={18} />
                Marcar como enviado
              </Button>
              <Button
                type="button"
                onClick={() => openDecideDialog('approved')}
                disabled={readOnly || !permManage.data || !formData.id}
                className="gap-2"
              >
                <ThumbsUp size={18} />
                Aprovar
              </Button>
	              <Button
	                type="button"
	                variant="destructive"
	                onClick={() => openDecideDialog('rejected')}
	                disabled={readOnly || !permManage.data || !formData.id}
	                className="gap-2"
	              >
                <ThumbsDown size={18} />
                Reprovar
              </Button>
            </div>
          </div>

          {orcamentoSummary?.cliente_nome ? (
            <div className="sm:col-span-6 mt-2 text-sm text-gray-700">
              <span className="font-medium">Aceite por:</span> {orcamentoSummary.cliente_nome}
              {orcamentoSummary.observacao ? <span className="text-gray-500"> • {orcamentoSummary.observacao}</span> : null}
            </div>
          ) : null}

          {orcamentoSummary?.last_event ? (
            <div className="sm:col-span-6 mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700 uppercase">Último evento</div>
                <div className="text-xs text-gray-500">
                  {new Date(orcamentoSummary.last_event.created_at).toLocaleString('pt-BR')}
                  {orcamentoSummary.last_event.actor_email ? ` • ${orcamentoSummary.last_event.actor_email}` : ''}
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-800">
                <span className="font-medium">
                  {orcamentoSummary.last_event.tipo === 'sent'
                    ? 'Enviado'
                    : orcamentoSummary.last_event.tipo === 'approved'
                    ? 'Aprovado'
                    : 'Reprovado'}
                </span>
                {orcamentoSummary.last_event.mensagem ? <div className="mt-1 text-gray-700">{orcamentoSummary.last_event.mensagem}</div> : null}
                {orcamentoSummary.last_event.cliente_nome ? (
                  <div className="mt-1 text-gray-700">
                    <span className="font-medium">Cliente:</span> {orcamentoSummary.last_event.cliente_nome}
                  </div>
                ) : null}
                {orcamentoSummary.last_event.observacao ? <div className="mt-1 text-gray-700">{orcamentoSummary.last_event.observacao}</div> : null}
              </div>
            </div>
          ) : null}
        </Section>

        <Section title="Checklist do serviço" description="Passo a passo por tipo de serviço (com progresso e etapas automáticas).">
          <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList size={18} className="text-gray-600" />
              <div className="text-sm text-gray-900">
                <span className="font-semibold">{checklist?.template?.titulo || 'Sem checklist'}</span>
                {checklist?.template?.descricao ? (
                  <span className="text-gray-500"> • {checklist.template.descricao}</span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {checklistLoading ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  <Loader2 className="animate-spin" size={14} /> Carregando…
                </span>
              ) : checklist?.progress ? (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                  {checklist.progress.done}/{checklist.progress.total} • {checklist.progress.pct}%
                </span>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => (formData.id ? refreshChecklist(String(formData.id)) : undefined)}
                disabled={!formData.id || checklistLoading}
                className="gap-2"
                title="Atualizar"
              >
                <RefreshCw size={18} />
                Atualizar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openChecklistTemplates}
                disabled={readOnly || !formData.id}
                className="gap-2"
              >
                <ClipboardList size={18} />
                Selecionar checklist
              </Button>
            </div>
          </div>

          {!formData.id ? (
            <div className="sm:col-span-6 mt-3 text-sm text-gray-500">
              Salve a OS para aplicar e acompanhar o checklist.
            </div>
          ) : checklist?.items?.length ? (
            <div className="sm:col-span-6 mt-4 space-y-2">
              {checklist.items.map((it) => (
                <label
                  key={it.step_id}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${
                    it.done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                  } ${readOnly ? 'opacity-80' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!!it.done}
                      onChange={(e) => handleToggleChecklistItem(it.step_id, e.target.checked)}
                      disabled={readOnly}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span className="truncate">{it.titulo}</span>
                        {it.auto_rule ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${it.manual_override ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                            {it.manual_override ? 'Auto (manual)' : 'Auto'}
                          </span>
                        ) : null}
                      </div>
                      {it.descricao ? <div className="text-xs text-gray-600 mt-1">{it.descricao}</div> : null}
                      {it.done_at ? (
                        <div className="text-xs text-gray-500 mt-1">
                          Concluído em {new Date(it.done_at).toLocaleString('pt-BR')}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {it.done ? <CheckCircle2 className="text-green-600 mt-1" size={18} /> : null}
                </label>
              ))}
            </div>
          ) : (
            <div className="sm:col-span-6 mt-3 text-sm text-gray-500">
              Nenhum item. Selecione um checklist para começar.
            </div>
          )}
        </Section>

        <Section title="Comunicação" description="Templates + links (WhatsApp/e-mail) + log por OS + portal simples.">
          <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">Cliente:</span> {clientDetails?.nome || clientName || '—'}
              {clientDetails?.telefone ? <span className="text-gray-500"> • Tel: {clientDetails.telefone}</span> : null}
              {clientDetails?.email ? <span className="text-gray-500"> • E-mail: {clientDetails.email}</span> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleGeneratePortalLink} disabled={!formData.id || portalGenerating} className="gap-2">
                {portalGenerating ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                Gerar link do portal
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCommsDialogOpen(true)}
                disabled={!formData.id || readOnly}
                className="gap-2"
              >
                <FileText size={18} />
                Abrir templates
              </Button>
            </div>
          </div>

          {portalUrl ? (
            <div className="sm:col-span-6 mt-2 text-xs text-gray-600">
              <span className="font-semibold">Portal:</span> <a className="text-blue-700 hover:underline" href={portalUrl} target="_blank" rel="noreferrer">{portalUrl}</a>
            </div>
          ) : null}

          <div className="sm:col-span-6 mt-4 rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase flex items-center justify-between">
              <span>Log de comunicação</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => (formData.id ? loadComms(String(formData.id)) : undefined)} disabled={!formData.id || commsLoading} className="gap-2">
                {commsLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Atualizar
              </Button>
            </div>
            <div className="max-h-[260px] overflow-auto bg-white">
              {commsLoading ? (
                <div className="p-6 flex items-center justify-center text-sm text-gray-500">
                  <Loader2 className="animate-spin mr-2" size={18} />
                  Carregando…
                </div>
              ) : commsLogs.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">Nenhum registro ainda.</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                  <TableColGroup columns={commsColumns} widths={commsWidths} />
                  <thead className="bg-white sticky top-0">
                    <tr>
                      <ResizableSortableTh
                        columnId="quando"
                        label="Quando"
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                        sort={commsSort as any}
                        onSort={(col) => setCommsSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startCommsResize}
                      />
                      <ResizableSortableTh
                        columnId="canal"
                        label="Canal"
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                        sort={commsSort as any}
                        onSort={(col) => setCommsSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startCommsResize}
                      />
                      <ResizableSortableTh
                        columnId="direcao"
                        label="Direção"
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                        sort={commsSort as any}
                        onSort={(col) => setCommsSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startCommsResize}
                      />
                      <ResizableSortableTh
                        columnId="para_de"
                        label="Para/De"
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                        sort={commsSort as any}
                        onSort={(col) => setCommsSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startCommsResize}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedCommsLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-800">{new Date(l.created_at).toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{l.canal}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{l.direction === 'outbound' ? 'Saída' : 'Entrada'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{l.to_value || l.actor_email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
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
        open={orcamentoSendDialogOpen}
        onOpenChange={(open) => {
          setOrcamentoSendDialogOpen(open);
          if (open && orcamentoSummary) {
            setOrcamentoMensagem('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar orçamento</DialogTitle>
            <DialogDescription>
              Marca o orçamento como <b>enviado</b> e registra um evento (auditável). Opcionalmente, salve uma mensagem.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            <TextArea
              label="Mensagem (opcional)"
              name="orcamento_mensagem"
              value={orcamentoMensagem}
              onChange={(e) => setOrcamentoMensagem(e.target.value)}
              rows={4}
              disabled={orcamentoSending}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOrcamentoSendDialogOpen(false)} disabled={orcamentoSending}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleEnviarOrcamento} disabled={orcamentoSending} className="gap-2">
              {orcamentoSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              Marcar como enviado
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={orcamentoDecideDialogOpen} onOpenChange={setOrcamentoDecideDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{orcamentoDecisao === 'approved' ? 'Aprovar orçamento' : 'Reprovar orçamento'}</DialogTitle>
            <DialogDescription>
              Registra a decisão com evidência do aceite (auditável). Exige permissão <b>OS → Gerenciar</b>.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <Input
              label="Nome do cliente/responsável"
              name="orcamento_cliente_nome"
              value={orcamentoClienteNome}
              onChange={(e) => setOrcamentoClienteNome(e.target.value)}
              placeholder="Ex.: João da Silva"
              disabled={orcamentoDeciding}
              required
            />
            <TextArea
              label="Observação (opcional)"
              name="orcamento_observacao"
              value={orcamentoObservacao}
              onChange={(e) => setOrcamentoObservacao(e.target.value)}
              rows={4}
              disabled={orcamentoDeciding}
              placeholder={orcamentoDecisao === 'approved' ? 'Ex.: Aprovado por WhatsApp.' : 'Ex.: Cliente pediu ajuste no valor.'}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOrcamentoDecideDialogOpen(false)} disabled={orcamentoDeciding}>
              Cancelar
            </Button>
            <Button
              type="button"
	              variant={orcamentoDecisao === 'approved' ? 'default' : 'destructive'}
	              onClick={handleDecidirOrcamento}
	              disabled={orcamentoDeciding}
	              className="gap-2"
	            >
              {orcamentoDeciding ? <Loader2 className="animate-spin" size={18} /> : orcamentoDecisao === 'approved' ? <ThumbsUp size={18} /> : <ThumbsDown size={18} />}
              {orcamentoDecisao === 'approved' ? 'Aprovar' : 'Reprovar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selecionar checklist</DialogTitle>
            <DialogDescription>
              Escolha um checklist por tipo de serviço. O sistema cria/atualiza os itens desta OS e mantém o progresso.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            {templatesLoading ? (
              <div className="py-6 flex items-center justify-center text-sm text-gray-500">
                <Loader2 className="animate-spin mr-2" size={18} />
                Carregando checklists…
              </div>
            ) : templates.length === 0 ? (
              <div className="text-sm text-gray-500 py-2">Nenhum checklist disponível.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    className="text-left rounded-lg border border-gray-200 bg-white hover:bg-gray-50 p-4"
                    onClick={() => handleSelectChecklistTemplate(t.slug)}
                    disabled={readOnly}
                  >
                    <div className="text-sm font-semibold text-gray-900">{t.titulo}</div>
                    {t.descricao ? <div className="text-xs text-gray-600 mt-1">{t.descricao}</div> : null}
                    <div className="text-xs text-gray-500 mt-2">
                      {Array.isArray((t as any).steps) ? (t as any).steps.length : Array.isArray(t.steps) ? t.steps.length : 0} etapa(s)
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setChecklistDialogOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={commsDialogOpen}
        onOpenChange={(open) => {
          setCommsDialogOpen(open);
          if (open) {
            setCommsTemplateSlug('');
            setCommsPreview('');
            setCommsAssunto('');
            setCommsTo('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Templates de comunicação</DialogTitle>
            <DialogDescription>
              Gere uma mensagem pronta, copie, abra WhatsApp/e-mail e registre o envio no log (auditável).
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2">
              <Select label="Canal" name="comms_canal" value={commsCanal} onChange={(e) => setCommsCanal(e.target.value as any)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
              </Select>
            </div>
            <div className="md:col-span-4">
              <Select
                label="Template"
                name="comms_tpl"
                value={commsTemplateSlug}
                onChange={(e) => setCommsTemplateSlug(e.target.value)}
              >
                <option value="">Selecione…</option>
                {commsTemplates.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.titulo}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <Input
              label={commsCanal === 'email' ? 'E-mail do cliente' : 'Telefone/contato'}
              name="comms_to"
              value={commsTo}
              onChange={(e) => setCommsTo(e.target.value)}
              placeholder={commsCanal === 'email' ? (clientDetails?.email || '') : (clientDetails?.telefone || '')}
              className="md:col-span-3"
            />
            {commsCanal === 'email' ? (
              <Input
                label="Assunto"
                name="comms_subject"
                value={commsAssunto}
                onChange={(e) => setCommsAssunto(e.target.value)}
                className="md:col-span-3"
              />
            ) : (
              <div className="md:col-span-3" />
            )}
          </div>

          <div className="mt-3">
            <TextArea label="Prévia" name="comms_preview" value={commsPreview} onChange={() => {}} rows={8} disabled />
            <div className="text-xs text-gray-500 mt-1">
              Variáveis: <code>{'{{os_numero}}'}</code>, <code>{'{{os_descricao}}'}</code>, <code>{'{{os_status_label}}'}</code>, <code>{'{{cliente_nome}}'}</code>, <code>{'{{portal_url}}'}</code>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleCopyComms} disabled={!commsPreview.trim()} className="gap-2">
                <FileText size={18} />
                Copiar mensagem
              </Button>
              {commsCanal === 'whatsapp' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!normalizePhone(commsTo || clientDetails?.telefone || clientDetails?.celular || '') || !commsPreview.trim()}
                  onClick={() => {
                    const phone = normalizePhone(commsTo || clientDetails?.telefone || clientDetails?.celular || '');
                    if (!phone) return;
                    const url = `https://wa.me/${phone}?text=${encodeURIComponent(commsPreview)}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="gap-2"
                >
                  <FileText size={18} />
                  Abrir WhatsApp
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!((commsTo || clientDetails?.email || '').trim()) || !commsPreview.trim()}
                  onClick={() => {
                    const email = (commsTo || clientDetails?.email || '').trim();
                    if (!email) return;
                    const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(commsAssunto || '')}&body=${encodeURIComponent(commsPreview)}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="gap-2"
                >
                  <FileText size={18} />
                  Abrir e-mail
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCommsDialogOpen(false)} disabled={commsRegistering}>
                Fechar
              </Button>
              <Button type="button" onClick={handleRegisterComms} disabled={commsRegistering || !commsPreview.trim()} className="gap-2">
                {commsRegistering ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                Registrar envio
              </Button>
            </div>
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
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                  <TableColGroup columns={parcelasColumns} widths={parcelasWidths} />
                  <thead className="bg-white sticky top-0">
                    <tr>
                      <ResizableSortableTh
                        columnId="numero"
                        label="#"
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                        sort={parcelasSort as any}
                        onSort={(col) => setParcelasSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startParcelasResize}
                      />
                      <ResizableSortableTh
                        columnId="vencimento"
                        label="Vencimento"
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                        sort={parcelasSort as any}
                        onSort={(col) => setParcelasSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startParcelasResize}
                      />
                      <ResizableSortableTh
                        columnId="valor"
                        label="Valor"
                        align="right"
                        className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase"
                        sort={parcelasSort as any}
                        onSort={(col) => setParcelasSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startParcelasResize}
                      />
                      <ResizableSortableTh
                        columnId="status"
                        label="Status"
                        className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase"
                        sort={parcelasSort as any}
                        onSort={(col) => setParcelasSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startParcelasResize}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedParcelas.map((p) => (
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

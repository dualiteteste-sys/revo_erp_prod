import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, PlusCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ServiceAutocomplete from '@/components/common/ServiceAutocomplete';
import { getPartners, type PartnerListItem } from '@/services/partners';
import { listAllCentrosDeCusto, type CentroDeCustoListItem } from '@/services/centrosDeCusto';
import { deleteContrato, listContratos, upsertContrato, type ServicoContrato, type ServicoContratoStatus } from '@/services/servicosMvp';
import { getService } from '@/services/services';
import { useNumericField } from '@/hooks/useNumericField';
import Input from '@/components/ui/forms/Input';
import {
  addAvulso,
  cancelFutureBilling,
  generateReceivables as rpcGenerateReceivables,
  generateSchedule as rpcGenerateSchedule,
  getBillingRuleByContratoId,
  listScheduleByContratoId,
  recalcMensalFuture,
  type BillingRuleTipo,
  type ServicosContratoBillingRule,
  type ServicosContratoBillingSchedule,
  upsertBillingRule,
} from '@/services/servicosContratosBilling';
import {
  createContratoDocumento,
  listContratoDocumentos,
  listContratoTemplates,
  revokeContratoDocumento,
  type ServicosContratoDocumento,
  type ServicosContratoTemplate,
} from '@/services/servicosContratosDocs';
import {
  deleteContratoItem,
  listItensByContratoId,
  upsertContratoItem,
  type ServicosContratoItem,
} from '@/services/servicosContratosItens';
import {
  deleteContratoTemplateAdmin,
  listContratoTemplatesAdmin,
  upsertContratoTemplateAdmin,
} from '@/services/servicosContratosTemplatesAdmin';

type FormState = {
  id: string | null;
  cliente_id: string;
  servico_id: string;
  numero: string;
  descricao: string;
  valor_mensal: number | null;
  status: ServicoContratoStatus;
  data_inicio: string;
  data_fim: string;
  fidelidade_meses: number | null;
  observacoes: string;
};

type BillingRuleRow = ServicosContratoBillingRule;
type BillingScheduleRow = ServicosContratoBillingSchedule;
type DocumentoRow = ServicosContratoDocumento;
type TemplateRow = ServicosContratoTemplate;
type ItemRow = ServicosContratoItem;

const emptyForm: FormState = {
  id: null,
  cliente_id: '',
  servico_id: '',
  numero: '',
  descricao: '',
  valor_mensal: 0,
  status: 'ativo',
  data_inicio: '',
  data_fim: '',
  fidelidade_meses: null,
  observacoes: '',
};

function slugify(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function addMonthsToIsoDate(dateIso: string, months: number): string | null {
  if (!dateIso) return null;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
}

export default function ContratosPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<ServicoContrato[]>([]);
  const [clients, setClients] = useState<PartnerListItem[]>([]);
  const [selectedClientName, setSelectedClientName] = useState('');
  const [selectedServiceName, setSelectedServiceName] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [originalStatus, setOriginalStatus] = useState<ServicoContratoStatus>('ativo');
  const [lastDataFim, setLastDataFim] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingActionLoading, setBillingActionLoading] = useState(false);
  const [billingRule, setBillingRule] = useState<BillingRuleRow | null>(null);
  const [schedule, setSchedule] = useState<BillingScheduleRow[]>([]);
  const [billingUntil, setBillingUntil] = useState(() => new Date().toISOString().slice(0, 10));
  const [centrosDeCustoLoading, setCentrosDeCustoLoading] = useState(false);
  const [centrosDeCusto, setCentrosDeCusto] = useState<CentroDeCustoListItem[]>([]);
  const [avulsoVencimento, setAvulsoVencimento] = useState(() => new Date().toISOString().slice(0, 10));
  const [avulsoValor, setAvulsoValor] = useState<number | null>(0);
  const [avulsoDescricao, setAvulsoDescricao] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentoRow[]>([]);
  const [docExpiresDays, setDocExpiresDays] = useState(30);
  const [lastPortalLink, setLastPortalLink] = useState<string | null>(null);
  const [docActionLoading, setDocActionLoading] = useState(false);
  const [itensLoading, setItensLoading] = useState(false);
  const [itensActionLoading, setItensActionLoading] = useState(false);
  const [itens, setItens] = useState<ItemRow[]>([]);
  const [itemForm, setItemForm] = useState<{
    id: string | null;
    titulo: string;
    descricao: string;
    quantidade: string;
    unidade: string;
    valor_unitario: number | null;
    recorrente: boolean;
  }>({
    id: null,
    titulo: '',
    descricao: '',
    quantidade: '1',
    unidade: '',
    valor_unitario: 0,
    recorrente: true,
  });
  const [templatesAdminOpen, setTemplatesAdminOpen] = useState(false);
  const [templatesAdminLoading, setTemplatesAdminLoading] = useState(false);
  const [templatesAdminRows, setTemplatesAdminRows] = useState<TemplateRow[]>([]);
  const [templateForm, setTemplateForm] = useState<{
    id: string | null;
    slug: string;
    titulo: string;
    corpo: string;
    active: boolean;
  }>({
    id: null,
    slug: '',
    titulo: '',
    corpo: '',
    active: true,
  });

  const clientById = useMemo(() => {
    const m = new Map<string, PartnerListItem>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  async function load() {
    setLoading(true);
    try {
      const [contratos, partners] = await Promise.all([
        listContratos(),
        getPartners({
          page: 1,
          pageSize: 200,
          searchTerm: '',
          filterType: null,
          sortBy: { column: 'nome', ascending: true },
        }),
      ]);
      const eligible = partners.data.filter((p) => p.tipo === 'cliente' || p.tipo === 'ambos');
      setRows(contratos);
      setClients(eligible);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar contratos.', 'error');
      setRows([]);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let canceled = false;

    const loadCentros = async () => {
      setCentrosDeCustoLoading(true);
      try {
        const rows = await listAllCentrosDeCusto({ status: 'ativo' });
        if (!canceled) setCentrosDeCusto(rows);
      } catch {
        if (!canceled) setCentrosDeCusto([]);
      } finally {
        if (!canceled) setCentrosDeCustoLoading(false);
      }
    };

    void loadCentros();
    return () => {
      canceled = true;
    };
  }, []);

  const openNew = () => {
    setForm(emptyForm);
    setOriginalStatus('ativo');
    setLastDataFim('');
    setBillingRule(null);
    setSchedule([]);
    setBillingUntil(new Date().toISOString().slice(0, 10));
    setAvulsoVencimento(new Date().toISOString().slice(0, 10));
    setAvulsoValor(0);
    setAvulsoDescricao('');
    setTemplates([]);
    setSelectedTemplateId('');
    setDocuments([]);
    setDocExpiresDays(30);
    setLastPortalLink(null);
    setItens([]);
    setItensLoading(false);
    setItensActionLoading(false);
    setItemForm({
      id: null,
      titulo: '',
      descricao: '',
      quantidade: '1',
      unidade: '',
      valor_unitario: 0,
      recorrente: true,
    });
    setSelectedClientName('');
    setSelectedServiceName('');
    setIsOpen(true);
  };

  const openEdit = (row: ServicoContrato) => {
    setForm({
      id: row.id,
      cliente_id: row.cliente_id || '',
      servico_id: (row as any).servico_id || '',
      numero: row.numero || '',
      descricao: row.descricao || '',
      valor_mensal: row.valor_mensal ?? 0,
      status: row.status,
      data_inicio: row.data_inicio || '',
      data_fim: row.data_fim || '',
      fidelidade_meses: (row as any).fidelidade_meses ?? null,
      observacoes: row.observacoes || '',
    });
    setSelectedClientName(row.cliente_id ? clientById.get(row.cliente_id)?.nome || '' : '');
    setSelectedServiceName('');
    setLastDataFim(row.data_fim || '');
    setOriginalStatus(row.status);
    setBillingRule(null);
    setSchedule([]);
    setBillingUntil(new Date().toISOString().slice(0, 10));
    setAvulsoVencimento(new Date().toISOString().slice(0, 10));
    setAvulsoValor(0);
    setAvulsoDescricao('');
    setSelectedTemplateId('');
    setDocuments([]);
    setLastPortalLink(null);
    setItens([]);
    setItemForm({
      id: null,
      titulo: '',
      descricao: '',
      quantidade: '1',
      unidade: '',
      valor_unitario: 0,
      recorrente: true,
    });
    setIsOpen(true);
    if ((row as any).servico_id) {
      void (async () => {
        try {
          const s = await getService((row as any).servico_id);
          setSelectedServiceName(s?.descricao || '');
        } catch {
          setSelectedServiceName('');
        }
      })();
    }
    void loadBilling(row);
    void loadDocsAndTemplates(row.id);
    void loadItens(row.id);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
    setOriginalStatus('ativo');
    setLastDataFim('');
    setBillingRule(null);
    setSchedule([]);
    setBillingUntil(new Date().toISOString().slice(0, 10));
    setAvulsoVencimento(new Date().toISOString().slice(0, 10));
    setAvulsoValor(0);
    setAvulsoDescricao('');
    setTemplates([]);
    setSelectedTemplateId('');
    setDocuments([]);
    setDocExpiresDays(30);
    setLastPortalLink(null);
    setItens([]);
    setItensLoading(false);
    setItensActionLoading(false);
    setItemForm({
      id: null,
      titulo: '',
      descricao: '',
      quantidade: '1',
      unidade: '',
      valor_unitario: 0,
      recorrente: true,
    });
    setSelectedClientName('');
    setSelectedServiceName('');
    setTemplatesAdminOpen(false);
    setTemplatesAdminRows([]);
    setTemplateForm({ id: null, slug: '', titulo: '', corpo: '', active: true });
  };

  const canUseBilling = useMemo(() => {
    if (!form.id) return false;
    if (form.status !== 'ativo') return false;
    if (!form.cliente_id) return false;
    return true;
  }, [form.id, form.status, form.cliente_id]);

  const valorMensalProps = useNumericField(form.valor_mensal, (value) => {
    setForm((s) => ({ ...s, valor_mensal: value }));
  });

  const billingValorMensalProps = useNumericField(billingRule?.valor_mensal ?? null, (value) => {
    setBillingRule((r) => (r ? { ...r, valor_mensal: value ?? 0 } : r));
  });

  const avulsoValorProps = useNumericField(avulsoValor, setAvulsoValor);

  const itemValorUnitarioProps = useNumericField(itemForm.valor_unitario, (value) => {
    setItemForm((s) => ({ ...s, valor_unitario: value }));
  });

  const loadBilling = async (row: Pick<ServicoContrato, 'id' | 'valor_mensal' | 'data_inicio'>) => {
    setBillingLoading(true);
    try {
      const rule = await getBillingRuleByContratoId(row.id);

      if (rule) {
        setBillingRule(rule as BillingRuleRow);
      } else {
        const start = row.data_inicio ? String(row.data_inicio) : '';
        const first = start ? `${start.slice(0, 7)}-01` : `${new Date().toISOString().slice(0, 7)}-01`;
        setBillingRule({
          id: '',
          contrato_id: row.id,
          tipo: 'mensal',
          ativo: true,
          valor_mensal: Number(row.valor_mensal ?? 0),
          dia_vencimento: 5,
          primeira_competencia: first,
          centro_de_custo_id: null,
        });
      }

      const sch = await listScheduleByContratoId(row.id, 24);
      setSchedule((sch ?? []) as BillingScheduleRow[]);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar faturamento do contrato.', 'error');
      setBillingRule(null);
      setSchedule([]);
    } finally {
      setBillingLoading(false);
    }
  };

  const loadDocsAndTemplates = async (contratoId: string) => {
    setTemplatesLoading(true);
    setDocumentsLoading(true);
    try {
      const [tpl, docs] = await Promise.all([
        listContratoTemplates({ activeOnly: true }),
        listContratoDocumentos({ contratoId, limit: 20 }),
      ]);
      setTemplates(tpl);
      if (tpl.length > 0) setSelectedTemplateId(tpl[0]!.id);
      setDocuments(docs);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar documentos/templates do contrato.', 'error');
      setTemplates([]);
      setSelectedTemplateId('');
      setDocuments([]);
    } finally {
      setTemplatesLoading(false);
      setDocumentsLoading(false);
    }
  };

  const loadItens = async (contratoId: string) => {
    setItensLoading(true);
    try {
      const rows = await listItensByContratoId(contratoId);
      setItens(rows);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar itens do contrato.', 'error');
      setItens([]);
    } finally {
      setItensLoading(false);
    }
  };

  const startAddItem = () => {
    setItemForm({
      id: null,
      titulo: '',
      descricao: '',
      quantidade: '1',
      unidade: '',
      valor_unitario: 0,
      recorrente: true,
    });
  };

  const startEditItem = (it: ItemRow) => {
    setItemForm({
      id: it.id,
      titulo: it.titulo || '',
      descricao: it.descricao || '',
      quantidade: String(it.quantidade ?? 0),
      unidade: it.unidade || '',
      valor_unitario: it.valor_unitario ?? 0,
      recorrente: it.recorrente !== false,
    });
  };

  const saveItem = async () => {
    if (!form.id) return;
    const titulo = itemForm.titulo.trim();
    if (!titulo) {
      addToast('Informe o título do item.', 'error');
      return;
    }
    const qtd = Number(itemForm.quantidade || 0);
    const valor = Number(itemForm.valor_unitario ?? 0);
    if (!Number.isFinite(qtd) || qtd < 0) {
      addToast('Quantidade inválida.', 'error');
      return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
      addToast('Valor unitário inválido.', 'error');
      return;
    }

    setItensActionLoading(true);
    try {
      const maxPos = itens.reduce((acc, x) => Math.max(acc, Number(x.pos ?? 0)), 0);
      const payload: any = {
        id: itemForm.id || undefined,
        contrato_id: form.id,
        pos: itemForm.id ? undefined : maxPos + 1,
        titulo,
        descricao: itemForm.descricao.trim() || null,
        quantidade: qtd,
        unidade: itemForm.unidade.trim() || null,
        valor_unitario: valor,
        recorrente: itemForm.recorrente,
      };
      await upsertContratoItem(payload);
      addToast('Item salvo.', 'success');
      startAddItem();
      await loadItens(form.id);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar item.', 'error');
    } finally {
      setItensActionLoading(false);
    }
  };

  const removeItem = async (it: ItemRow) => {
    if (!form.id) return;
    const ok = window.confirm(`Remover o item “${it.titulo}”?`);
    if (!ok) return;
    setItensActionLoading(true);
    try {
      await deleteContratoItem(it.id);
      addToast('Item removido.', 'success');
      if (itemForm.id === it.id) startAddItem();
      await loadItens(form.id);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao remover item.', 'error');
    } finally {
      setItensActionLoading(false);
    }
  };

  const recurringTotal = useMemo(() => {
    return itens
      .filter((x) => x.recorrente !== false)
      .reduce((acc, x) => acc + Number(x.quantidade || 0) * Number(x.valor_unitario || 0), 0);
  }, [itens]);

  const applyRecurringTotalToMensal = () => {
    setForm((s) => ({ ...s, valor_mensal: recurringTotal }));
    addToast('Valor mensal preenchido pelo somatório recorrente.', 'success');
  };

  const openTemplatesAdmin = async () => {
    setTemplatesAdminOpen(true);
    setTemplatesAdminLoading(true);
    try {
      // garante defaults idempotentes (RPC) antes do CRUD direto na tabela
      await listContratoTemplates({ activeOnly: false });
      const all = await listContratoTemplatesAdmin({ includeInactive: true });
      setTemplatesAdminRows(all as any);
      if (all.length > 0) {
        const t = all[0] as any;
        setTemplateForm({ id: t.id, slug: t.slug, titulo: t.titulo, corpo: t.corpo, active: t.active !== false });
      } else {
        setTemplateForm({ id: null, slug: '', titulo: '', corpo: '', active: true });
      }
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar templates.', 'error');
      setTemplatesAdminRows([]);
      setTemplateForm({ id: null, slug: '', titulo: '', corpo: '', active: true });
    } finally {
      setTemplatesAdminLoading(false);
    }
  };

  const selectTemplateForEdit = (t: TemplateRow) => {
    setTemplateForm({ id: t.id, slug: t.slug || '', titulo: t.titulo || '', corpo: t.corpo || '', active: t.active !== false });
  };

  const newTemplate = () => {
    setTemplateForm({ id: null, slug: '', titulo: '', corpo: '', active: true });
  };

  const saveTemplate = async () => {
    const titulo = templateForm.titulo.trim();
    const slug = slugify(templateForm.slug || titulo);
    const corpo = templateForm.corpo ?? '';
    if (!titulo) {
      addToast('Informe o título do template.', 'error');
      return;
    }
    if (!slug) {
      addToast('Slug inválido.', 'error');
      return;
    }
    if (!corpo.trim()) {
      addToast('Informe o corpo do template.', 'error');
      return;
    }

    setTemplatesAdminLoading(true);
    try {
      await upsertContratoTemplateAdmin({
        id: templateForm.id || undefined,
        slug,
        titulo,
        corpo,
        active: templateForm.active,
      } as any);
      addToast('Template salvo.', 'success');
      const all = await listContratoTemplatesAdmin({ includeInactive: true });
      setTemplatesAdminRows(all as any);
      const saved = all.find((x: any) => x.slug === slug) ?? null;
      if (saved) selectTemplateForEdit(saved as any);
      if (form.id) await loadDocsAndTemplates(form.id);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar template.', 'error');
    } finally {
      setTemplatesAdminLoading(false);
    }
  };

  const removeTemplate = async () => {
    if (!templateForm.id) return;
    const t = templatesAdminRows.find((x) => x.id === templateForm.id) || null;
    const ok = window.confirm(`Remover o template “${t?.titulo || templateForm.slug}”?`);
    if (!ok) return;
    setTemplatesAdminLoading(true);
    try {
      await deleteContratoTemplateAdmin(templateForm.id);
      addToast('Template removido.', 'success');
      const all = await listContratoTemplatesAdmin({ includeInactive: true });
      setTemplatesAdminRows(all as any);
      if (all.length > 0) selectTemplateForEdit(all[0] as any);
      else newTemplate();
      if (form.id) await loadDocsAndTemplates(form.id);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao remover template.', 'error');
    } finally {
      setTemplatesAdminLoading(false);
    }
  };

  const generateDocumento = async () => {
    if (!form.id) return;
    if (!selectedTemplateId) {
      addToast('Selecione um template de contrato.', 'error');
      return;
    }
    const days = Number(docExpiresDays || 30);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      addToast('Validade do link inválida (1..365).', 'error');
      return;
    }
    setDocActionLoading(true);
    try {
      const res = await createContratoDocumento({ contratoId: form.id, templateId: selectedTemplateId, expiresInDays: days });
      const link = `${window.location.origin}${res.path}`;
      setLastPortalLink(link);
      addToast('Link do contrato gerado.', 'success');
      await loadDocsAndTemplates(form.id);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar link do contrato.', 'error');
    } finally {
      setDocActionLoading(false);
    }
  };

  const revokeDocumento = async (docId: string) => {
    if (!form.id) return;
    setDocActionLoading(true);
    try {
      await revokeContratoDocumento({ docId });
      addToast('Link revogado.', 'success');
      await loadDocsAndTemplates(form.id);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao revogar link.', 'error');
    } finally {
      setDocActionLoading(false);
    }
  };

  const copyLastLink = async () => {
    if (!lastPortalLink) return;
    try {
      await navigator.clipboard.writeText(lastPortalLink);
      addToast('Link copiado.', 'success');
    } catch {
      addToast('Não foi possível copiar automaticamente. Selecione e copie manualmente.', 'warn');
    }
  };

  const saveBillingRule = async () => {
    if (!form.id || !billingRule) return;
    if (billingRule.tipo !== 'mensal') {
      addToast('Por enquanto, apenas regra mensal está habilitada.', 'warn');
      return;
    }

    const valor = Number(billingRule.valor_mensal ?? 0);
    if (Number.isNaN(valor) || valor < 0) {
      addToast('Valor mensal inválido.', 'error');
      return;
    }
    const dia = Number(billingRule.dia_vencimento ?? 5);
    if (!Number.isFinite(dia) || dia < 1 || dia > 28) {
      addToast('Dia de vencimento inválido (1..28).', 'error');
      return;
    }
    const comp = String(billingRule.primeira_competencia ?? '').trim();
    if (!comp) {
      addToast('Informe a primeira competência.', 'error');
      return;
    }

    setBillingActionLoading(true);
    try {
      const payload = {
        contrato_id: form.id,
        tipo: 'mensal',
        ativo: billingRule.ativo !== false,
        valor_mensal: valor,
        dia_vencimento: dia,
        primeira_competencia: comp,
        centro_de_custo_id: billingRule.centro_de_custo_id || null,
      };
      const savedRule = await upsertBillingRule(payload);
      setBillingRule(savedRule as BillingRuleRow);
      addToast('Regra de faturamento salva.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar regra de faturamento.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const generateSchedule = async () => {
    if (!form.id) return;
    setBillingActionLoading(true);
    try {
      const res = await rpcGenerateSchedule({ contratoId: form.id, monthsAhead: 12 });
      addToast(`Agenda atualizada. Inseridos: ${res.inserted}`, 'success');
      await loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar agenda.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const generateReceivables = async () => {
    if (!form.id) return;
    setBillingActionLoading(true);
    try {
      const until = String(billingUntil || new Date().toISOString().slice(0, 10));
      const res = await rpcGenerateReceivables({ contratoId: form.id, until });
      const meta = res.monthsAhead ? ` (agenda ${res.monthsAhead}m)` : '';
      addToast(`Títulos gerados: ${res.created}${meta}`, 'success');
      await loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar contas a receber.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const addAvulsoItem = async () => {
    if (!form.id) return;
    const valor = Number(avulsoValor ?? 0);
    if (!avulsoVencimento) {
      addToast('Informe o vencimento do avulso.', 'error');
      return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
      addToast('Valor do avulso inválido.', 'error');
      return;
    }

    setBillingActionLoading(true);
    try {
      await addAvulso({
        contratoId: form.id,
        dataVencimento: avulsoVencimento,
        valor,
        descricao: avulsoDescricao.trim() || null,
      });
      addToast('Item avulso adicionado ao schedule.', 'success');
      setAvulsoValor(0);
      setAvulsoDescricao('');
      await loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao adicionar item avulso.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const recalcFuture = async () => {
    if (!form.id) return;
    setBillingActionLoading(true);
    try {
      const res = await recalcMensalFuture({ contratoId: form.id, from: new Date().toISOString().slice(0, 10) });
      if (res.reason === 'nao_mensal') {
        addToast('Recalcular futuro aplica-se apenas a regras mensais.', 'warn');
      } else {
        addToast(`Agenda mensal recalculada. Atualizados: ${res.updated}`, 'success');
      }
      await loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao recalcular agenda futura.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const save = async () => {
    if (!form.descricao.trim()) {
      addToast('Informe a descrição do contrato.', 'error');
      return;
    }
    const valor = Number(form.valor_mensal ?? 0);
    if (Number.isNaN(valor) || valor < 0) {
      addToast('Valor mensal inválido.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertContrato({
        id: form.id || undefined,
        cliente_id: form.cliente_id || null,
        servico_id: form.servico_id || null,
        numero: form.numero.trim() || null,
        descricao: form.descricao.trim(),
        valor_mensal: valor,
        status: form.status,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        fidelidade_meses: form.fidelidade_meses ?? null,
        observacoes: form.observacoes.trim() || null,
      } as any);

      // Se o contrato deixou de ser ativo, cancela agenda futura (e opcionalmente títulos futuros).
      if (originalStatus !== form.status && form.status !== 'ativo' && saved?.id) {
        try {
          const res = await cancelFutureBilling({
            contratoId: saved.id,
            cancelReceivables: form.status === 'cancelado',
            reason: form.status === 'cancelado' ? 'Contrato cancelado' : 'Contrato suspenso',
          });
          if (res.scheduleCancelled > 0 || res.receivablesCancelled > 0) {
            const msg =
              form.status === 'cancelado'
                ? `Cancelados: ${res.scheduleCancelled} agendas, ${res.receivablesCancelled} títulos.`
                : `Canceladas: ${res.scheduleCancelled} agendas futuras.`;
            addToast(msg, 'success');
          }
        } catch (e: any) {
          addToast(e?.message || 'Contrato salvo, mas falhou ao cancelar agenda/títulos futuros.', 'warn');
        }
      }

      addToast('Contrato salvo.', 'success');
      await load();
      if (form.id) {
        close();
      } else {
        setForm((prev) => ({ ...prev, id: saved.id }));
        await loadBilling(saved);
      }
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar contrato.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteContrato(id);
      addToast('Contrato removido.', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao remover contrato.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" /> Contratos (Serviços)
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: cadastro de contratos recorrentes.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Novo Contrato
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhum contrato cadastrado.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Valor mensal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((r) => {
                  const c = r.cliente_id ? clientById.get(r.cliente_id) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{c?.nome || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.descricao}</td>
                      <td className="px-4 py-3">{Number(r.valor_mensal || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(r)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                            Editar
                          </button>
                          <button
                            onClick={() => remove(r.id)}
                            disabled={deletingId === r.id}
                            className="px-3 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            {deletingId === r.id ? 'Removendo…' : 'Remover'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={close} title="Contrato" size="4xl" bodyClassName="p-6 md:p-8">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Cliente</label>
              <div className="mt-1">
                <ClientAutocomplete
                  value={form.cliente_id || null}
                  initialName={selectedClientName || (form.cliente_id ? clientById.get(form.cliente_id)?.nome || undefined : undefined)}
                  placeholder="Digite para buscar..."
                  onChange={(id, name) => {
                    setForm((s) => ({ ...s, cliente_id: id ?? '' }));
                    setSelectedClientName(name || '');
                  }}
                  disabled={saving}
                />
                <div className="mt-1 text-[11px] text-gray-500">Opcional. Digite 2+ caracteres para buscar.</div>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-700">Número</label>
              <input
                value={form.numero}
                onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-700">Descrição</label>
            <input
              value={form.descricao}
              onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Serviço (opcional)</label>
              <div className="mt-1">
                <ServiceAutocomplete
                  value={form.servico_id || null}
                  initialName={selectedServiceName || undefined}
                  placeholder="Digite para buscar..."
                  onChange={(id, service) => {
                    setForm((s) => ({ ...s, servico_id: id ?? '' }));
                    setSelectedServiceName(service?.descricao || '');
                  }}
                  disabled={saving}
                />
                <div className="mt-1 text-[11px] text-gray-500">Opcional. Use para relatórios/comissões futuras.</div>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as ServicoContratoStatus }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                label="Valor mensal"
                name="valor_mensal"
                inputMode="numeric"
                startAdornment="R$"
                {...valorMensalProps}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Fidelidade (meses)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.fidelidade_meses ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === '' ? null : Number(raw);
                  setForm((s) => ({ ...s, fidelidade_meses: Number.isFinite(n as number) ? (n as number) : null }));
                }}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                disabled={saving}
              />
              {form.fidelidade_meses && form.data_inicio ? (
                <div className="mt-1 text-[11px] text-gray-500">
                  Fidelidade até: {addMonthsToIsoDate(form.data_inicio, form.fidelidade_meses) || '—'}
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-gray-500">Opcional. Ex.: 12 = fidelidade de 12 meses.</div>
              )}
            </div>
            <div className="flex items-end">
              <div className="text-xs text-gray-500">
                Dica: você pode preencher o valor mensal pelo somatório dos itens recorrentes na seção “Escopo”.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Início</label>
              <input
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm((s) => ({ ...s, data_inicio: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Fim</label>
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={!form.data_fim}
                  onChange={(e) => {
                    const indeterminate = e.target.checked;
                    if (indeterminate) {
                      setLastDataFim(form.data_fim || '');
                      setForm((s) => ({ ...s, data_fim: '' }));
                      return;
                    }

                    const restore = lastDataFim || new Date().toISOString().slice(0, 10);
                    setForm((s) => ({ ...s, data_fim: restore }));
                  }}
                  disabled={saving}
                />
                Sem data de fim (renovação automática)
              </label>
              <input
                type="date"
                value={form.data_fim}
                onChange={(e) => setForm((s) => ({ ...s, data_fim: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
                disabled={saving || !form.data_fim}
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-700">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={(e) => setForm((s) => ({ ...s, observacoes: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              rows={3}
              disabled={saving}
            />
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Faturamento</div>
                <div className="text-xs text-gray-600">
                  Configure a regra e gere a agenda. Depois, gere os títulos (Contas a Receber) automaticamente a partir do schedule.
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  form.id ? loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null }) : null
                }
                disabled={!form.id || billingLoading || billingActionLoading}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Atualizar
              </button>
            </div>

            {!form.id ? (
              <div className="mt-3 text-sm text-gray-700">Salve o contrato para configurar faturamento e ver o preview.</div>
            ) : billingLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando faturamento…
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Tipo</label>
                    <select
                      value={billingRule?.tipo || 'mensal'}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, tipo: e.target.value as BillingRuleTipo } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled
                    >
                      <option value="mensal">Mensal</option>
                      <option value="avulso">Avulso</option>
                    </select>
                  </div>
                  <div>
                    <Input
                      label="Valor mensal"
                      name="billing_valor_mensal"
                      size="sm"
                      inputMode="numeric"
                      startAdornment="R$"
                      {...billingValorMensalProps}
                      disabled={billingActionLoading}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Dia de vencimento</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={String(billingRule?.dia_vencimento ?? 5)}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, dia_vencimento: Number(e.target.value || 5) } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={billingActionLoading}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Primeira competência</label>
                    <input
                      type="date"
                      value={billingRule?.primeira_competencia || ''}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, primeira_competencia: e.target.value } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={billingActionLoading}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-600">Centro de custo (recomendado)</label>
                    <select
                      value={billingRule?.centro_de_custo_id || ''}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, centro_de_custo_id: e.target.value || null } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={billingActionLoading || centrosDeCustoLoading}
                    >
                      <option value="">{centrosDeCustoLoading ? 'Carregando…' : '(sem centro de custo)'}</option>
                      {centrosDeCusto.map((cc) => {
                        const code = cc.codigo ? `${cc.codigo} ` : '';
                        return (
                          <option key={cc.id} value={cc.id}>
                            {code}
                            {cc.nome} ({cc.tipo})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveBillingRule}
                    disabled={!billingRule || billingActionLoading}
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Salvar regra
                  </button>
                  <button
                    type="button"
                    onClick={generateSchedule}
                    disabled={!billingRule || billingActionLoading || !form.id}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Gerar agenda (12 meses)
                  </button>
                  <button
                    type="button"
                    onClick={recalcFuture}
                    disabled={!billingRule || billingActionLoading || !form.id}
                    className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    title="Recalcula valor/vencimento das linhas futuras (mensal, previsto, sem título) usando a regra atual."
                  >
                    Recalcular futuro
                  </button>
                  <div className="flex items-end gap-2">
                    <div>
                      <div className="text-[11px] text-gray-600">Gerar títulos até</div>
                      <input
                        type="date"
                        value={billingUntil}
                        onChange={(e) => setBillingUntil(e.target.value)}
                        className="mt-1 h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm"
                        disabled={billingActionLoading}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={generateReceivables}
                    disabled={!canUseBilling || billingActionLoading}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    title={!canUseBilling ? 'Requer contrato ativo com cliente selecionado.' : undefined}
                  >
                    Gerar títulos
                  </button>
                  <div className="text-xs text-gray-600 flex items-center">
                    {!form.cliente_id ? 'Dica: selecione um cliente para gerar títulos.' : null}
                    {form.status !== 'ativo' ? ' Dica: contrato precisa estar ativo.' : null}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xs font-semibold text-gray-700">Lançamento avulso</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <div className="text-[11px] text-gray-600">Vencimento</div>
                      <input
                        type="date"
                        value={avulsoVencimento}
                        onChange={(e) => setAvulsoVencimento(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                        disabled={billingActionLoading}
                      />
                    </div>
                    <div>
                      <Input
                        label="Valor"
                        name="avulso_valor"
                        size="sm"
                        inputMode="numeric"
                        startAdornment="R$"
                        {...avulsoValorProps}
                        disabled={billingActionLoading}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[11px] text-gray-600">Descrição (opcional)</div>
                      <input
                        value={avulsoDescricao}
                        onChange={(e) => setAvulsoDescricao(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                        disabled={billingActionLoading}
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={addAvulsoItem}
                      disabled={!form.id || billingActionLoading}
                      className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Adicionar avulso
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Preview da agenda (próximos 24)</div>
                  {schedule.length === 0 ? (
                    <div className="text-sm text-gray-600">Sem linhas no schedule ainda. Clique em “Gerar agenda”.</div>
                  ) : (
                    <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-gray-600">
                            <th className="px-3 py-2">Tipo</th>
                            <th className="px-3 py-2">Competência</th>
                            <th className="px-3 py-2">Vencimento</th>
                            <th className="px-3 py-2">Descrição</th>
                            <th className="px-3 py-2">Valor</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {schedule.map((s) => (
                            <tr key={s.id}>
                              <td className="px-3 py-2">{s.kind}</td>
                              <td className="px-3 py-2">{s.competencia ? s.competencia.slice(0, 7) : '-'}</td>
                              <td className="px-3 py-2">{s.data_vencimento}</td>
                              <td className="px-3 py-2">{s.descricao ? String(s.descricao) : '-'}</td>
                              <td className="px-3 py-2">{Number(s.valor || 0).toFixed(2)}</td>
                              <td className="px-3 py-2">{s.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Escopo do contrato (itens)</div>
                <div className="text-xs text-gray-600">
                  Itens do serviço contratados (informativo). Você pode usar o somatório recorrente para preencher o valor mensal.
                </div>
              </div>
              <button
                type="button"
                onClick={() => (form.id ? loadItens(form.id) : null)}
                disabled={!form.id || itensLoading || itensActionLoading}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Atualizar
              </button>
            </div>

            {!form.id ? (
              <div className="mt-3 text-sm text-gray-700">Salve o contrato para cadastrar itens.</div>
            ) : itensLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando itens…
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-2">
                  <div className="md:col-span-4">
                    <div className="text-[11px] text-gray-600">Título</div>
                    <input
                      value={itemForm.titulo}
                      onChange={(e) => setItemForm((s) => ({ ...s, titulo: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={itensActionLoading}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <div className="text-[11px] text-gray-600">Descrição (opcional)</div>
                    <input
                      value={itemForm.descricao}
                      onChange={(e) => setItemForm((s) => ({ ...s, descricao: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={itensActionLoading}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <div className="text-[11px] text-gray-600">Qtd</div>
                    <input
                      inputMode="decimal"
                      value={itemForm.quantidade}
                      onChange={(e) => setItemForm((s) => ({ ...s, quantidade: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={itensActionLoading}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <div className="text-[11px] text-gray-600">Unid.</div>
                    <input
                      value={itemForm.unidade}
                      onChange={(e) => setItemForm((s) => ({ ...s, unidade: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={itensActionLoading}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      label="Valor unit."
                      name="item_valor_unitario"
                      size="sm"
                      inputMode="numeric"
                      startAdornment="R$"
                      {...itemValorUnitarioProps}
                      disabled={itensActionLoading}
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={itemForm.recorrente}
                      onChange={(e) => setItemForm((s) => ({ ...s, recorrente: e.target.checked }))}
                      disabled={itensActionLoading}
                    />
                    Recorrente (entra no somatório mensal)
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={saveItem}
                      disabled={!form.id || itensActionLoading}
                      className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {itemForm.id ? 'Salvar alterações' : 'Adicionar item'}
                    </button>
                    {itemForm.id ? (
                      <button
                        type="button"
                        onClick={startAddItem}
                        disabled={itensActionLoading}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={applyRecurringTotalToMensal}
                      disabled={!form.id || itensActionLoading}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Aplicar soma recorrente (R$ {recurringTotal.toFixed(2)})
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Itens cadastrados</div>
                  {itens.length === 0 ? (
                    <div className="text-sm text-gray-600">Nenhum item cadastrado ainda.</div>
                  ) : (
                    <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-gray-600">
                            <th className="px-3 py-2">Título</th>
                            <th className="px-3 py-2">Qtd</th>
                            <th className="px-3 py-2">Unid.</th>
                            <th className="px-3 py-2">Valor unit.</th>
                            <th className="px-3 py-2">Recorrente</th>
                            <th className="px-3 py-2 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {itens.map((it) => (
                            <tr key={it.id}>
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-900">{it.titulo}</div>
                                {it.descricao ? <div className="text-[11px] text-gray-600">{it.descricao}</div> : null}
                              </td>
                              <td className="px-3 py-2">{Number(it.quantidade || 0).toFixed(2)}</td>
                              <td className="px-3 py-2">{it.unidade || '—'}</td>
                              <td className="px-3 py-2">{Number(it.valor_unitario || 0).toFixed(2)}</td>
                              <td className="px-3 py-2">{it.recorrente ? 'sim' : 'não'}</td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditItem(it)}
                                    disabled={itensActionLoading}
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(it)}
                                    disabled={itensActionLoading}
                                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                                  >
                                    Remover
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Documento + Aceite (Portal)</div>
                <div className="text-xs text-gray-600">
                  Gere um link público (token) para o cliente visualizar o contrato e registrar o aceite. O token só é exibido uma vez.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openTemplatesAdmin}
                  disabled={templatesAdminLoading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Templates
                </button>
                <button
                  type="button"
                  onClick={() => (form.id ? loadDocsAndTemplates(form.id) : null)}
                  disabled={!form.id || templatesLoading || documentsLoading || docActionLoading}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Atualizar
                </button>
              </div>
            </div>

            {!form.id ? (
              <div className="mt-3 text-sm text-gray-700">Salve o contrato para gerar o link de aceite.</div>
            ) : templatesLoading || documentsLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div className="md:col-span-4">
                    <label className="text-xs text-gray-600">Template</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={docActionLoading}
                    >
                      {templates.length === 0 ? <option value="">Nenhum template encontrado.</option> : null}
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-600">Validade (dias)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={String(docExpiresDays)}
                      onChange={(e) => setDocExpiresDays(Number(e.target.value || 30))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={docActionLoading}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={generateDocumento}
                    disabled={!selectedTemplateId || docActionLoading}
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Gerar link
                  </button>
                  {lastPortalLink ? (
                    <>
                      <input
                        readOnly
                        value={lastPortalLink}
                        className="flex-1 rounded-lg border border-gray-200 bg-white p-2 text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        onClick={copyLastLink}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Copiar
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Histórico de links (últimos 20)</div>
                  {documents.length === 0 ? (
                    <div className="text-sm text-gray-600">Nenhum link gerado ainda.</div>
                  ) : (
                    <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-gray-600">
                            <th className="px-3 py-2">Criado em</th>
                            <th className="px-3 py-2">Validade</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Aceite</th>
                            <th className="px-3 py-2 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {documents.map((d) => {
                            const status = d.revoked_at
                              ? 'revogado'
                              : d.accepted_at
                                ? 'aceito'
                                : d.expires_at && new Date(d.expires_at) < new Date()
                                  ? 'expirado'
                                  : 'ativo';
                            return (
                              <tr key={d.id}>
                                <td className="px-3 py-2">{new Date(d.created_at).toLocaleString('pt-BR')}</td>
                                <td className="px-3 py-2">
                                  {d.expires_at ? new Date(d.expires_at).toLocaleDateString('pt-BR') : '—'}
                                </td>
                                <td className="px-3 py-2">{status}</td>
                                <td className="px-3 py-2">
                                  {d.accepted_at ? (
                                    <>
                                      {d.accepted_nome || '—'} • {d.accepted_email || '—'} •{' '}
                                      {new Date(d.accepted_at).toLocaleString('pt-BR')}
                                    </>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => revokeDocumento(d.id)}
                                      disabled={docActionLoading || Boolean(d.revoked_at) || Boolean(d.accepted_at)}
                                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                                    >
                                      Revogar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={close} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={templatesAdminOpen}
        onClose={() => setTemplatesAdminOpen(false)}
        title="Templates de contrato"
        size="4xl"
        bodyClassName="p-6 md:p-8"
      >
        <div className="space-y-4">
          <div className="text-xs text-gray-600">
            Variáveis suportadas: <span className="font-mono">{'{{empresa_nome}}'}</span>, <span className="font-mono">{'{{cliente_nome}}'}</span>,{' '}
            <span className="font-mono">{'{{cliente_email}}'}</span>, <span className="font-mono">{'{{contrato_descricao}}'}</span>,{' '}
            <span className="font-mono">{'{{contrato_numero}}'}</span>, <span className="font-mono">{'{{valor_mensal}}'}</span>,{' '}
            <span className="font-mono">{'{{data_inicio}}'}</span>, <span className="font-mono">{'{{data_fim}}'}</span>,{' '}
            <span className="font-mono">{'{{data_hoje}}'}</span>.
          </div>

          {templatesAdminLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900">Lista</div>
                  <button
                    type="button"
                    onClick={newTemplate}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                  >
                    Novo
                  </button>
                </div>
                <div className="mt-3 space-y-2 max-h-[420px] overflow-auto">
                  {templatesAdminRows.length === 0 ? (
                    <div className="text-sm text-gray-600">Nenhum template encontrado.</div>
                  ) : (
                    templatesAdminRows.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => selectTemplateForEdit(t)}
                        className={`w-full text-left rounded-lg border px-3 py-2 ${
                          templateForm.id === t.id ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-sm font-semibold text-gray-900">{t.titulo}</div>
                        <div className="text-[11px] text-gray-600">
                          <span className="font-mono">{t.slug}</span> • {t.active ? 'ativo' : 'inativo'}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="md:col-span-4 rounded-xl border border-gray-200 bg-white p-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div className="md:col-span-3">
                    <div className="text-xs text-gray-600">Título</div>
                    <input
                      value={templateForm.titulo}
                      onChange={(e) => {
                        const nextTitulo = e.target.value;
                        setTemplateForm((s) => ({ ...s, titulo: nextTitulo, slug: s.slug ? s.slug : slugify(nextTitulo) }));
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={templatesAdminLoading}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600">Slug</div>
                    <input
                      value={templateForm.slug}
                      onChange={(e) => setTemplateForm((s) => ({ ...s, slug: slugify(e.target.value) }))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm font-mono"
                      disabled={templatesAdminLoading}
                    />
                  </div>
                  <div className="md:col-span-1 flex items-end">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={templateForm.active}
                        onChange={(e) => setTemplateForm((s) => ({ ...s, active: e.target.checked }))}
                        disabled={templatesAdminLoading}
                      />
                      Ativo
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-gray-600">Corpo</div>
                  <textarea
                    value={templateForm.corpo}
                    onChange={(e) => setTemplateForm((s) => ({ ...s, corpo: e.target.value }))}
                    rows={14}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm font-mono"
                    disabled={templatesAdminLoading}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-gray-500">{templateForm.id ? 'Editando existente' : 'Novo template'}</div>
                  <div className="flex items-center gap-2">
                    {templateForm.id ? (
                      <button
                        type="button"
                        onClick={removeTemplate}
                        disabled={templatesAdminLoading}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={saveTemplate}
                      disabled={templatesAdminLoading}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

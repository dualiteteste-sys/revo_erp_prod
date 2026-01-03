import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useOnboardingGate } from '@/contexts/OnboardingGateContext';
import { useBillingGate } from '@/hooks/useBillingGate';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { traceAction } from '@/lib/tracing';
import { Copy, Eye, FileKey, Loader2, Plus, Receipt, Search, Settings, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ProductAutocomplete from '@/components/common/ProductAutocomplete';

type AmbienteNfe = 'homologacao' | 'producao';

type NfeEmissao = {
  id: string;
  status: string;
  numero: number | null;
  serie: number | null;
  chave_acesso: string | null;
  destinatario_pessoa_id: string | null;
  destinatario_nome: string | null;
  valor_total: number | null;
  total_produtos?: number | null;
  total_descontos?: number | null;
  total_frete?: number | null;
  total_impostos?: number | null;
  total_nfe?: number | null;
  natureza_operacao?: string | null;
  ambiente: AmbienteNfe;
  nfeio_id?: string | null;
  nfeio_status?: string | null;
  nfeio_last_sync_at?: string | null;
  nfeio_xml_path?: string | null;
  nfeio_danfe_path?: string | null;
  nfeio_cce_pdf_path?: string | null;
  nfeio_cce_xml_path?: string | null;
  payload: any;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type NfeItemForm = {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_desconto: number;
  ncm: string;
  cfop: string;
  cst: string;
  csosn: string;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  erro: 'Erro',
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

export default function NfeEmissoesPage() {
  const supabase = useSupabase() as any;
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const { ensure } = useOnboardingGate();
  const billing = useBillingGate();
  const features = useEmpresaFeatures();

  const empresaId = activeEmpresa?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<NfeEmissao[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewXml, setPreviewXml] = useState<string>('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [docsFetchingId, setDocsFetchingId] = useState<string | null>(null);
  const [cceModalOpen, setCceModalOpen] = useState(false);
  const [cceEmissaoId, setCceEmissaoId] = useState<string | null>(null);
  const [cceText, setCceText] = useState('');
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [auditEmissaoId, setAuditEmissaoId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<NfeEmissao | null>(null);
  const [formAmbiente, setFormAmbiente] = useState<AmbienteNfe>('homologacao');
  const [formFrete, setFormFrete] = useState<string>('');
  const [formNaturezaOperacao, setFormNaturezaOperacao] = useState<string>('');
  const [formDestinatarioId, setFormDestinatarioId] = useState<string | null>(null);
  const [formDestinatarioName, setFormDestinatarioName] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<NfeItemForm[]>([]);
  const [productToAddId, setProductToAddId] = useState<string | null>(null);
  const [productToAddName, setProductToAddName] = useState<string | undefined>(undefined);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);

  const canShow = useMemo(() => !!empresaId, [empresaId]);

  const fetchList = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('fiscal_nfe_emissoes')
        .select(
          'id,status,numero,serie,chave_acesso,destinatario_pessoa_id,ambiente,natureza_operacao,valor_total,total_produtos,total_descontos,total_frete,total_impostos,total_nfe,payload,last_error,created_at,updated_at,destinatario:pessoas(nome),nfeio:fiscal_nfe_nfeio_emissoes(nfeio_id,provider_status,last_sync_at,xml_storage_path,danfe_storage_path,cce_pdf_storage_path,cce_xml_storage_path)'
        )
        .eq('empresa_id', empresaId)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

        const list: NfeEmissao[] = (data || []).map((r: any) => ({
          id: r.id,
          status: r.status,
          numero: r.numero ?? null,
          serie: r.serie ?? null,
          chave_acesso: r.chave_acesso ?? null,
          destinatario_pessoa_id: r.destinatario_pessoa_id ?? null,
          destinatario_nome: r?.destinatario?.nome ?? null,
          valor_total: r.valor_total ?? null,
          total_produtos: typeof r.total_produtos === 'number' ? r.total_produtos : null,
          total_descontos: typeof r.total_descontos === 'number' ? r.total_descontos : null,
          total_frete: typeof r.total_frete === 'number' ? r.total_frete : null,
          total_impostos: typeof r.total_impostos === 'number' ? r.total_impostos : null,
          total_nfe: typeof r.total_nfe === 'number' ? r.total_nfe : null,
          natureza_operacao: r.natureza_operacao ?? null,
          ambiente: (r.ambiente ?? 'homologacao') as AmbienteNfe,
          nfeio_id: r?.nfeio?.nfeio_id ?? null,
          nfeio_status: r?.nfeio?.provider_status ?? null,
          nfeio_last_sync_at: r?.nfeio?.last_sync_at ?? null,
          nfeio_xml_path: r?.nfeio?.xml_storage_path ?? null,
          nfeio_danfe_path: r?.nfeio?.danfe_storage_path ?? null,
          nfeio_cce_pdf_path: r?.nfeio?.cce_pdf_storage_path ?? null,
          nfeio_cce_xml_path: r?.nfeio?.cce_xml_storage_path ?? null,
          payload: r.payload ?? {},
          last_error: r.last_error ?? null,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));

      const filtered = search.trim()
        ? list.filter((row) => {
            const hay = [
              row.chave_acesso || '',
              row.destinatario_nome || '',
              String(row.numero ?? ''),
              String(row.serie ?? ''),
              row.status || '',
            ]
              .join(' ')
              .toLowerCase();
            return hay.includes(search.trim().toLowerCase());
          })
        : list;

      setRows(filtered);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao listar NF-e.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, search, statusFilter, supabase]);

  useEffect(() => {
    if (!empresaId) return;
    void fetchList();
  }, [empresaId, fetchList]);

  const totals = useMemo(() => {
    const total = rows.length;
    const rascunhos = rows.filter((r) => r.status === 'rascunho').length;
    const autorizadas = rows.filter((r) => r.status === 'autorizada').length;
    const pendentes = rows.filter((r) => ['enfileirada', 'processando'].includes(r.status)).length;
    return { total, rascunhos, autorizadas, pendentes };
  }, [rows]);

  const openNew = async () => {
    setEditing(null);
    setFormAmbiente('homologacao');
    setFormFrete('');
    setFormNaturezaOperacao('');
    setFormDestinatarioId(null);
    setFormDestinatarioName(undefined);
    setItems([]);
    setProductToAddId(null);
    setProductToAddName(undefined);
    setIsModalOpen(true);
  };

  const openEdit = async (row: NfeEmissao) => {
    setEditing(row);
    setFormAmbiente(row.ambiente || 'homologacao');
    setFormFrete(row.total_frete != null ? String(row.total_frete) : '');
    setFormNaturezaOperacao((row.natureza_operacao ?? '').toString());
    setFormDestinatarioId(row.destinatario_pessoa_id ?? null);
    setFormDestinatarioName(row.destinatario_nome ?? undefined);
    setProductToAddId(null);
    setProductToAddName(undefined);

    try {
      const { data, error } = await supabase
        .from('fiscal_nfe_emissao_itens')
        .select('id,produto_id,descricao,unidade,quantidade,valor_unitario,valor_desconto,ncm,cfop,cst,csosn')
        .eq('empresa_id', empresaId)
        .eq('emissao_id', row.id)
        .order('ordem', { ascending: true });
      if (error) throw error;

      setItems(
        (data || []).map((it: any) => ({
          id: it.id,
          produto_id: it.produto_id ?? null,
          produto_nome: (it.descricao || 'Item').toString(),
          unidade: (it.unidade || 'un').toString(),
          quantidade: Number(it.quantidade ?? 1) || 1,
          valor_unitario: Number(it.valor_unitario ?? 0) || 0,
          valor_desconto: Number(it.valor_desconto ?? 0) || 0,
          ncm: (it.ncm ?? '').toString(),
          cfop: (it.cfop ?? '').toString(),
          cst: (it.cst ?? '').toString(),
          csosn: (it.csosn ?? '').toString(),
        }))
      );
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar itens do rascunho.', 'error');
      setItems([]);
    }

    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setDraftErrors([]);
  };

  const totalsDraft = useMemo(() => {
    const frete = formFrete.trim() ? Number(String(formFrete).replace(',', '.')) : 0;
    const total_produtos = items.reduce((acc, it) => acc + it.quantidade * it.valor_unitario, 0);
    const total_descontos = items.reduce((acc, it) => acc + (it.valor_desconto || 0), 0);
    const total_nfe = Math.max(0, total_produtos - total_descontos + (Number.isFinite(frete) ? frete : 0));
    return { frete, total_produtos, total_descontos, total_nfe };
  }, [items, formFrete]);

  const validateDraftLocal = useCallback(() => {
    const errors: string[] = [];

    const frete = totalsDraft.frete;
    if (formFrete.trim() && (!Number.isFinite(frete) || frete < 0)) {
      errors.push('Frete inválido.');
    }

    if (!formNaturezaOperacao?.trim()) {
      errors.push('Natureza da operação é obrigatória.');
    }

    if (!formDestinatarioId) {
      errors.push('Selecione um destinatário.');
    }

    if (!items.length) {
      errors.push('Adicione ao menos 1 item ao rascunho.');
    }

    items.forEach((it, idx) => {
      const prefix = `Item ${idx + 1}`;

      if (!it.produto_nome?.trim()) {
        errors.push(`${prefix}: descrição é obrigatória.`);
      }
      if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) {
        errors.push(`${prefix}: quantidade inválida.`);
      }
      if (!Number.isFinite(it.valor_unitario) || it.valor_unitario < 0) {
        errors.push(`${prefix}: valor unitário inválido.`);
      }
      if (!Number.isFinite(it.valor_desconto) || it.valor_desconto < 0) {
        errors.push(`${prefix}: desconto inválido.`);
      } else if (it.valor_desconto > it.quantidade * it.valor_unitario) {
        errors.push(`${prefix}: desconto não pode ser maior que o total do item.`);
      }

      const ncm = (it.ncm || '').replace(/\D/g, '');
      if (ncm.length !== 8) {
        errors.push(`${prefix}: NCM deve ter 8 dígitos.`);
      }

      const cfop = (it.cfop || '').replace(/\D/g, '');
      if (cfop.length !== 4) {
        errors.push(`${prefix}: CFOP deve ter 4 dígitos.`);
      }

      const cst = (it.cst || '').trim();
      const csosn = (it.csosn || '').trim();
      if (!cst && !csosn) {
        errors.push(`${prefix}: informe CST ou CSOSN.`);
      }
    });

    const uniq = Array.from(new Set(errors));
    setDraftErrors(uniq);
    return { ok: uniq.length === 0, errors: uniq };
  }, [formDestinatarioId, formFrete, formNaturezaOperacao, items, totalsDraft.frete]);

  const persistDraft = async (): Promise<string> => {
    if (!empresaId) throw new Error('Selecione uma empresa ativa.');
    if (!items.length) throw new Error('Adicione ao menos 1 item ao rascunho.');

    const frete = totalsDraft.frete;
    if (formFrete.trim() && (!Number.isFinite(frete) || frete < 0)) {
      throw new Error('Frete inválido.');
    }

    const payloadJson = {
      version: 1,
      ambiente: formAmbiente,
      natureza_operacao: formNaturezaOperacao?.trim() || null,
      destinatario_pessoa_id: formDestinatarioId ?? null,
      totais: {
        total_produtos: totalsDraft.total_produtos,
        total_descontos: totalsDraft.total_descontos,
        total_frete: frete,
        total_impostos: 0,
        total_nfe: totalsDraft.total_nfe,
      },
      itens: items.map((it) => ({
        produto_id: it.produto_id,
        descricao: it.produto_nome,
        unidade: it.unidade,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario,
        valor_desconto: it.valor_desconto,
        ncm: it.ncm || null,
        cfop: it.cfop || null,
        cst: it.cst || null,
        csosn: it.csosn || null,
      })),
    };

    let emissaoId = editing?.id ?? null;
    if (emissaoId) {
      const { error } = await supabase
        .from('fiscal_nfe_emissoes')
        .update({
          destinatario_pessoa_id: formDestinatarioId ?? null,
          ambiente: formAmbiente,
          natureza_operacao: formNaturezaOperacao?.trim() || null,
          total_frete: frete,
          payload: payloadJson,
        })
        .eq('id', emissaoId)
        .eq('empresa_id', empresaId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('fiscal_nfe_emissoes')
        .insert({
          empresa_id: empresaId,
          provider_slug: 'NFE_IO',
          ambiente: formAmbiente,
          status: 'rascunho',
          destinatario_pessoa_id: formDestinatarioId ?? null,
          natureza_operacao: formNaturezaOperacao?.trim() || null,
          total_frete: frete,
          payload: payloadJson,
        })
        .select('id')
        .single();
      if (error) throw error;
      emissaoId = data?.id ?? null;
    }

    if (!emissaoId) throw new Error('Falha ao persistir rascunho (sem id).');

    const { error: delErr } = await supabase
      .from('fiscal_nfe_emissao_itens')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('emissao_id', emissaoId);
    if (delErr) throw delErr;

    const rowsToInsert = items.map((it, idx) => ({
      empresa_id: empresaId,
      emissao_id: emissaoId,
      produto_id: it.produto_id,
      ordem: idx + 1,
      descricao: it.produto_nome,
      unidade: it.unidade,
      ncm: it.ncm || null,
      cfop: it.cfop || null,
      cst: it.cst || null,
      csosn: it.csosn || null,
      quantidade: it.quantidade,
      valor_unitario: it.valor_unitario,
      valor_desconto: it.valor_desconto,
      valor_total: Math.max(0, it.quantidade * it.valor_unitario - (it.valor_desconto || 0)),
    }));

    const { error: insErr } = await supabase.from('fiscal_nfe_emissao_itens').insert(rowsToInsert);
    if (insErr) throw insErr;

    await supabase.rpc('fiscal_nfe_recalc_totais', { p_emissao_id: emissaoId });
    return emissaoId;
  };

  const newId = () => {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID() as string;
    return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const addItemFromProduct = async (productId: string, hit?: any) => {
    const nome = (hit?.nome || hit?.label || productToAddName || 'Produto').toString();
    const unidade = (hit?.unidade || 'un').toString();
    const preco = typeof hit?.preco_venda === 'number' ? hit.preco_venda : 0;

    let fiscalDefaults: any = {};
    try {
      const { data } = await supabase
        .from('produtos')
        .select('ncm,cfop_padrao,cst_padrao,csosn_padrao')
        .eq('id', productId)
        .maybeSingle();
      fiscalDefaults = data || {};
    } catch {
      fiscalDefaults = {};
    }

    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        produto_id: productId,
        produto_nome: nome,
        unidade,
        quantidade: 1,
        valor_unitario: Number.isFinite(preco) ? preco : 0,
        valor_desconto: 0,
        ncm: (fiscalDefaults?.ncm ?? '').toString(),
        cfop: (fiscalDefaults?.cfop_padrao ?? '').toString(),
        cst: (fiscalDefaults?.cst_padrao ?? '').toString(),
        csosn: (fiscalDefaults?.csosn_padrao ?? '').toString(),
      },
    ]);
    setProductToAddId(null);
    setProductToAddName(undefined);
  };

  const updateItem = (id: string, patch: Partial<NfeItemForm>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSave = async () => {
    if (!empresaId) return;
    const local = validateDraftLocal();
    if (!local.ok) {
      addToast('Revise o rascunho: há campos obrigatórios pendentes.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await persistDraft();

      addToast(editing?.id ? 'Rascunho atualizado.' : 'Rascunho criado.', 'success');

      closeModal();
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar rascunho.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewXml = async () => {
    if (!empresaId) return;

    const local = validateDraftLocal();
    if (!local.ok) {
      setPreviewOpen(true);
      setPreviewLoading(false);
      setPreviewErrors(local.errors);
      setPreviewWarnings([]);
      setPreviewXml('');
      addToast('Preview não gerado: corrija os erros do rascunho.', 'warning');
      return;
    }

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewErrors([]);
    setPreviewWarnings([]);
    setPreviewXml('');

    try {
      const emissaoId = await persistDraft();
      const { data, error } = await supabase.rpc('fiscal_nfe_preview_xml', { p_emissao_id: emissaoId });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const ok = !!row?.ok;
      const errs = (row?.errors || []) as string[];
      const warns = (row?.warnings || []) as string[];
      setPreviewErrors(errs);
      setPreviewWarnings(warns);
      setPreviewXml((row?.xml || '').toString());

      if (!ok) {
        addToast('Preview não gerado: corrija os erros e tente novamente.', 'error');
      } else {
        addToast('Preview gerado (XML).', 'success');
      }
    } catch (e: any) {
      setPreviewErrors([e?.message || 'Erro ao gerar preview.']);
      addToast(e?.message || 'Erro ao gerar preview.', 'error');
    } finally {
      setPreviewLoading(false);
      await fetchList();
    }
  };

  async function edgeErrorMessage(error: any): Promise<string> {
    let detail: string | undefined = error?.message;
    try {
      const ctx: any = error?.context;
      if (ctx && typeof ctx.text === 'function') {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw);
          detail = parsed?.detail || parsed?.error || raw;
        } catch {
          detail = raw;
        }
      }
    } catch {
      // ignore
    }
    return (detail || 'Falha ao executar.').toString();
  }

  const handleSend = async (emissaoId: string) => {
    if (!billing.ensureCanWrite({ actionLabel: 'Emitir NF-e' })) return;
    if (!features.nfe_emissao_enabled) {
      addToast('Emissão está desativada. Ative em Fiscal → Configurações de NF-e.', 'warning');
      return;
    }

    const gate = await ensure(['fiscal.nfe.emitente', 'fiscal.nfe.numeracao']);
    if (!gate.ok) return;

    setSendingId(emissaoId);
    try {
      await traceAction(
        'nfe.emit',
        async () => {
          const { data, error } = await supabase.functions.invoke('nfeio-emit', { body: { emissao_id: emissaoId } });
          if (error) throw error;
          if (!data?.ok) throw new Error(data?.error || 'Falha ao emitir.');
          return data;
        },
        { emissao_id: emissaoId }
      );
      addToast('Enviado para NFE.io. Status: enfileirada.', 'success');
      await fetchList();
    } catch (e: any) {
      const msg = e?.context ? await edgeErrorMessage(e) : (e?.message || 'Erro ao enviar para NFE.io.');
      addToast(msg, 'error');
      await fetchList();
    } finally {
      setSendingId(null);
    }
  };

  const handleSync = async (emissaoId: string) => {
    if (!billing.ensureCanWrite({ actionLabel: 'Sincronizar NF-e' })) return;
    setSyncingId(emissaoId);
    try {
      await traceAction(
        'nfe.sync',
        async () => {
          const { data, error } = await supabase.functions.invoke('nfeio-sync', { body: { emissao_id: emissaoId } });
          if (error) throw error;
          if (!data?.ok) throw new Error(data?.error || 'Falha ao sincronizar.');
          return data;
        },
        { emissao_id: emissaoId }
      );
      addToast('Status sincronizado (NFE.io).', 'success');
      await fetchList();
    } catch (e: any) {
      const msg = e?.context ? await edgeErrorMessage(e) : (e?.message || 'Erro ao sincronizar status.');
      addToast(msg, 'error');
      await fetchList();
    } finally {
      setSyncingId(null);
    }
  };

  const openDoc = async (path: string, label: string) => {
    setDownloadingPath(path);
    try {
      const { data, error } = await supabase.storage.from('nfe_docs').createSignedUrl(path, 60);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      else throw new Error('URL não gerada.');
    } catch (e: any) {
      addToast(e?.message || `Erro ao abrir ${label}.`, 'error');
    } finally {
      setDownloadingPath(null);
    }
  };

  const fetchDocFromProvider = async (emissaoId: string, docType: 'danfe_pdf' | 'cce_pdf' | 'cce_xml') => {
    if (!billing.ensureCanWrite({ actionLabel: 'Atualizar documentos' })) return;
    const gate = await ensure(['fiscal.nfe.emitente', 'fiscal.nfe.numeracao']);
    if (!gate.ok) return;

    setDocsFetchingId(emissaoId);
    try {
      const { data, error } = await supabase.functions.invoke('nfeio-docs', {
        body: { emissao_id: emissaoId, doc_type: docType },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao gerar documento.');
      addToast('Documento atualizado.', 'success');
      await fetchList();
      const path = (data?.storage_path || '').toString();
      if (path) await openDoc(path, 'Documento');
    } catch (e: any) {
      const msg = e?.context ? await edgeErrorMessage(e) : (e?.message || 'Erro ao obter documento.');
      addToast(msg, 'error');
      await fetchList();
    } finally {
      setDocsFetchingId(null);
    }
  };

  const handleCancel = async (emissaoId: string) => {
    if (!billing.ensureCanWrite({ actionLabel: 'Cancelar NF-e' })) return;
    const ok = window.confirm('Tem certeza que deseja solicitar o cancelamento desta NF-e? (Operação assíncrona)');
    if (!ok) return;

    const gate = await ensure(['fiscal.nfe.emitente', 'fiscal.nfe.numeracao']);
    if (!gate.ok) return;

    setCancelingId(emissaoId);
    try {
      const { data, error } = await supabase.functions.invoke('nfeio-cancel', { body: { emissao_id: emissaoId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao solicitar cancelamento.');
      addToast('Cancelamento enfileirado na NFE.io (aguardando processamento).', 'success');
      await fetchList();
    } catch (e: any) {
      const msg = e?.context ? await edgeErrorMessage(e) : (e?.message || 'Erro ao cancelar.');
      addToast(msg, 'error');
      await fetchList();
    } finally {
      setCancelingId(null);
    }
  };

  const openCceModal = (emissaoId: string) => {
    setCceEmissaoId(emissaoId);
    setCceText('');
    setCceModalOpen(true);
  };

  const openAudit = async (emissaoId: string) => {
    setAuditEmissaoId(emissaoId);
    setAuditOpen(true);
    setAuditLoading(true);
    setAuditItems([]);
    try {
      const { data, error } = await supabase
        .from('fiscal_nfe_audit_timeline')
        .select('kind,occurred_at,message,payload,source')
        .eq('emissao_id', emissaoId)
        .order('occurred_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setAuditItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar auditoria.', 'error');
      setAuditItems([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleSendCce = async () => {
    if (!billing.ensureCanWrite({ actionLabel: 'Enviar CC-e' })) return;
    if (!cceEmissaoId) return;
    if (!cceText.trim()) {
      addToast('Informe o texto da carta de correção.', 'warning');
      return;
    }

    const gate = await ensure(['fiscal.nfe.emitente', 'fiscal.nfe.numeracao']);
    if (!gate.ok) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('nfeio-cce', {
        body: { emissao_id: cceEmissaoId, correction_text: cceText.trim() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao enviar CC-e.');
      addToast('CC-e enfileirada na NFE.io (aguardando processamento).', 'success');
      setCceModalOpen(false);
      await fetchList();
    } catch (e: any) {
      const msg = e?.context ? await edgeErrorMessage(e) : (e?.message || 'Erro ao enviar CC-e.');
      addToast(msg, 'error');
      await fetchList();
    } finally {
      setSaving(false);
    }
  };

  if (!canShow) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para visualizar as NF-e.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="NF-e (Rascunhos e Histórico)"
          description="Crie rascunhos e prepare payloads. O envio/autorizar pode permanecer desativado até o go-live."
          icon={<Receipt size={20} />}
          actions={
            <>
              <Link to="/app/fiscal/nfe/configuracoes">
                <Button variant="secondary">
                  <Settings size={18} />
                  <span className="ml-2">Configurações</span>
                </Button>
              </Link>
              <Button onClick={openNew}>
                <Plus size={18} />
                <span className="ml-2">Novo rascunho</span>
              </Button>
            </>
          }
        />
      </div>

      {!features.nfe_emissao_enabled && (
        <div className="mb-4">
          <GlassCard className="p-4 border border-amber-200 bg-amber-50/60">
            <p className="text-sm text-amber-900">
              Emissão está <span className="font-semibold">desativada</span>. Você pode preparar rascunhos, mas não poderá enviar para autorização.
            </p>
          </GlassCard>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
          <p className="text-xs text-slate-700 font-semibold">Total (últimos 200)</p>
          <p className="text-2xl font-bold text-slate-800">{totals.total}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs text-indigo-700 font-semibold">Rascunhos</p>
          <p className="text-2xl font-bold text-indigo-800">{totals.rascunhos}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-xs text-emerald-700 font-semibold">Autorizadas</p>
          <p className="text-2xl font-bold text-emerald-800">{totals.autorizadas}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs text-amber-700 font-semibold">Pendentes</p>
          <p className="text-2xl font-bold text-amber-800">{totals.pendentes}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-4 items-center">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número, série, chave ou status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[220px]">
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="enfileirada">Enfileirada</option>
          <option value="processando">Processando</option>
          <option value="autorizada">Autorizada</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="cancelada">Cancelada</option>
          <option value="erro">Erro</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="h-56 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-center text-gray-500 p-4">
            <Receipt size={48} className="mb-3" />
            <p className="font-semibold text-lg">Nenhuma NF-e encontrada.</p>
            <p className="text-sm">Crie um rascunho para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número/Série</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ambiente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Atualizado</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ação</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="font-semibold">{STATUS_LABEL[row.status] || row.status}</span>
                      {row.nfeio_status ? (
                        <div className="text-xs text-slate-500 mt-1">
                          NFE.io: <span className="font-semibold">{row.nfeio_status}</span>
                          {row.nfeio_last_sync_at ? <span className="ml-2">({formatDate(row.nfeio_last_sync_at)})</span> : null}
                        </div>
                      ) : null}
                      {row.last_error ? <div className="text-xs text-red-600 mt-1">{row.last_error}</div> : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {row.numero != null ? row.numero : '—'} / {row.serie != null ? row.serie : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {row.ambiente === 'producao' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">Produção</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Homologação</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {formatCurrency(row.total_nfe ?? row.valor_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(row.updated_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <button className="text-blue-600 hover:text-blue-900" onClick={() => void openEdit(row)} title="Abrir rascunho">
                          Abrir
                        </button>
                        <button
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                          onClick={() => void openAudit(row.id)}
                          title="Auditoria da NF-e"
                        >
                          <Search size={16} />
                          Auditoria
                        </button>
                        {row.nfeio_id ? (
                          <button
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                              syncingId === row.id ? 'bg-slate-200 text-slate-600 cursor-wait' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                            }`}
                            disabled={syncingId === row.id}
                            onClick={() => void handleSync(row.id)}
                            title="Sincronizar status (NFE.io)"
                          >
                            {syncingId === row.id ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                            Sync
                          </button>
                        ) : null}
                        {row.nfeio_xml_path ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            disabled={downloadingPath === row.nfeio_xml_path}
                            onClick={() => void openDoc(row.nfeio_xml_path!, 'XML')}
                            title="Abrir XML (assinado)"
                          >
                            <Eye size={16} />
                            XML
                          </button>
                        ) : null}
                        {row.nfeio_danfe_path ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            disabled={downloadingPath === row.nfeio_danfe_path}
                            onClick={() => void openDoc(row.nfeio_danfe_path!, 'DANFE')}
                            title="Abrir DANFE (assinado)"
                          >
                            <Eye size={16} />
                            DANFE
                          </button>
                        ) : row.nfeio_id ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            disabled={docsFetchingId === row.id}
                            onClick={() => void fetchDocFromProvider(row.id, 'danfe_pdf')}
                            title="Buscar DANFE via NFE.io"
                          >
                            {docsFetchingId === row.id ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}
                            DANFE
                          </button>
                        ) : null}

                        {row.nfeio_cce_pdf_path ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            disabled={downloadingPath === row.nfeio_cce_pdf_path}
                            onClick={() => void openDoc(row.nfeio_cce_pdf_path!, 'CC-e PDF')}
                            title="Abrir DANFE da CC-e"
                          >
                            <Eye size={16} />
                            CC-e PDF
                          </button>
                        ) : row.nfeio_id ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            disabled={docsFetchingId === row.id}
                            onClick={() => void fetchDocFromProvider(row.id, 'cce_pdf')}
                            title="Buscar DANFE da CC-e via NFE.io"
                          >
                            {docsFetchingId === row.id ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}
                            CC-e PDF
                          </button>
                        ) : null}

                        {row.nfeio_cce_xml_path ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            disabled={downloadingPath === row.nfeio_cce_xml_path}
                            onClick={() => void openDoc(row.nfeio_cce_xml_path!, 'CC-e XML')}
                            title="Abrir XML da CC-e"
                          >
                            <Eye size={16} />
                            CC-e XML
                          </button>
                        ) : row.nfeio_id ? (
                          <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200"
                            disabled={docsFetchingId === row.id}
                            onClick={() => void fetchDocFromProvider(row.id, 'cce_xml')}
                            title="Buscar XML da CC-e via NFE.io"
                          >
                            {docsFetchingId === row.id ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}
                            CC-e XML
                          </button>
                        ) : null}

                        {row.status === 'autorizada' ? (
                          <>
                            <button
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                                cancelingId === row.id ? 'bg-rose-200 text-rose-800 cursor-wait' : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              }`}
                              disabled={cancelingId === row.id}
                              onClick={() => void handleCancel(row.id)}
                              title="Solicitar cancelamento (NFE.io)"
                            >
                              {cancelingId === row.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                              Cancelar
                            </button>
                            <button
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold bg-amber-100 text-amber-900 hover:bg-amber-200"
                              onClick={() => openCceModal(row.id)}
                              title="Enviar Carta de Correção (CC-e)"
                            >
                              <FileKey size={16} />
                              CC-e
                            </button>
                          </>
                        ) : null}
                        <button
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                            features.nfe_emissao_enabled
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-slate-200 text-slate-600 cursor-not-allowed'
                          }`}
                          disabled={!features.nfe_emissao_enabled}
                          onClick={() => void handleSend(row.id)}
                          title={features.nfe_emissao_enabled ? 'Enviar para NFE.io' : 'Ative a emissão para enviar'}
                        >
                          {sendingId === row.id ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                          {sendingId === row.id ? 'Enviando' : 'Enviar'}
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

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Editar rascunho NF-e' : 'Novo rascunho NF-e'} size="80pct">
        <div className="p-6 space-y-6">
          {draftErrors.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-semibold text-red-800">Revise o rascunho</div>
              <ul className="mt-2 list-disc list-inside text-sm text-red-700 space-y-1">
                {draftErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Ambiente</label>
              <Select value={formAmbiente} onChange={(e) => setFormAmbiente(e.target.value as AmbienteNfe)} className="min-w-[220px]">
                <option value="homologacao">Homologação</option>
                <option value="producao">Produção</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Natureza da operação</label>
              <input
                value={formNaturezaOperacao}
                onChange={(e) => setFormNaturezaOperacao(e.target.value)}
                placeholder="Ex.: Venda de mercadoria"
                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Frete (opcional)</label>
              <input
                value={formFrete}
                onChange={(e) => setFormFrete(e.target.value)}
                placeholder="Ex.: 25,00"
                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="md:col-span-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-600 font-semibold">Totais (prévia)</div>
              <div className="mt-2 space-y-1 text-sm text-slate-800">
                <div className="flex items-center justify-between gap-4">
                  <span>Produtos</span>
                  <span className="font-semibold">{formatCurrency(totalsDraft.total_produtos)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Descontos</span>
                  <span className="font-semibold">{formatCurrency(totalsDraft.total_descontos)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Frete</span>
                  <span className="font-semibold">{formatCurrency(totalsDraft.frete)}</span>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between gap-4">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold">{formatCurrency(totalsDraft.total_nfe)}</span>
                </div>
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Destinatário (cliente)</label>
              <ClientAutocomplete
                value={formDestinatarioId}
                initialName={formDestinatarioName}
                onChange={(id, name) => {
                  setFormDestinatarioId(id);
                  setFormDestinatarioName(name);
                }}
                placeholder="Nome/CPF/CNPJ..."
              />
              <p className="text-xs text-slate-500 mt-2">
                NFE-03: CFOP/CST/CSOSN podem ser preenchidos por item; defaults podem vir do cadastro do produto.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white/70 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Itens</h3>
                <p className="text-xs text-slate-500 mt-1">Adicione produtos e ajuste quantidade/valor. Tributos serão calculados na etapa do motor fiscal.</p>
              </div>
              <div className="text-xs text-slate-500">
                {items.length} {items.length === 1 ? 'item' : 'itens'}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Adicionar produto</label>
                <ProductAutocomplete
                  value={productToAddId}
                  initialName={productToAddName}
                  onChange={(id, hit) => {
                    setProductToAddId(id);
                    setProductToAddName(hit?.nome);
                    if (id) void addItemFromProduct(id, hit);
                  }}
                  placeholder="Buscar produto..."
                />
              </div>
              <div className="text-xs text-slate-500">
                Dica: digite 2+ caracteres.
              </div>
            </div>

            <div className="mt-4 overflow-auto border border-gray-200 rounded-xl bg-white">
              <table className="min-w-[1320px] w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left p-3 min-w-[320px]">Produto</th>
                    <th className="text-left p-3 min-w-[90px]">Un</th>
                    <th className="text-left p-3 min-w-[110px]">NCM</th>
                    <th className="text-left p-3 min-w-[90px]">CFOP</th>
                    <th className="text-left p-3 min-w-[90px]">CST</th>
                    <th className="text-left p-3 min-w-[110px]">CSOSN</th>
                    <th className="text-right p-3 min-w-[110px]">Qtd</th>
                    <th className="text-right p-3 min-w-[140px]">Vlr Unit</th>
                    <th className="text-right p-3 min-w-[140px]">Desconto</th>
                    <th className="text-right p-3 min-w-[140px]">Total</th>
                    <th className="text-right p-3 min-w-[90px]">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 ? (
                    <tr>
                      <td className="p-4 text-gray-500" colSpan={11}>
                        Nenhum item ainda. Use “Adicionar produto”.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const totalLine = Math.max(0, it.quantidade * it.valor_unitario - (it.valor_desconto || 0));
                      return (
                        <tr key={it.id} className="hover:bg-gray-50/40">
                          <td className="p-3">
                            <input
                              value={it.produto_nome}
                              onChange={(e) => updateItem(it.id, { produto_nome: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="Descrição do item"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.unidade}
                              onChange={(e) => updateItem(it.id, { unidade: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.ncm}
                              onChange={(e) => updateItem(it.id, { ncm: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="00000000"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.cfop}
                              onChange={(e) => updateItem(it.id, { cfop: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="0000"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.cst}
                              onChange={(e) => updateItem(it.id, { cst: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="00"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              value={it.csosn}
                              onChange={(e) => updateItem(it.id, { csosn: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2"
                              placeholder="000"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={String(it.quantidade)}
                              onChange={(e) => updateItem(it.id, { quantidade: Number(e.target.value) || 0 })}
                              className="w-full text-right border border-gray-200 rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={String(it.valor_unitario)}
                              onChange={(e) => updateItem(it.id, { valor_unitario: Number(e.target.value) || 0 })}
                              className="w-full text-right border border-gray-200 rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={String(it.valor_desconto)}
                              onChange={(e) => updateItem(it.id, { valor_desconto: Number(e.target.value) || 0 })}
                              className="w-full text-right border border-gray-200 rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3 text-right font-semibold">{formatCurrency(totalLine)}</td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              className="text-sm font-semibold text-red-600 hover:text-red-700"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handlePreviewXml} disabled={saving}>
              <Eye size={18} />
              <span className="ml-2">Preview XML</span>
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={18} /> : null}
              <span className="ml-2">Salvar</span>
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview XML (NFE-02)" size="80pct">
        <div className="p-6 space-y-4">
          {previewLoading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : (
            <>
              {previewErrors.length > 0 ? (
                <GlassCard className="p-4 border border-rose-200 bg-rose-50/60">
                  <div className="text-sm font-semibold text-rose-900">Erros</div>
                  <ul className="mt-2 text-sm text-rose-900 list-disc pl-5 space-y-1">
                    {previewErrors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </GlassCard>
              ) : null}

              {previewWarnings.length > 0 ? (
                <GlassCard className="p-4 border border-amber-200 bg-amber-50/60">
                  <div className="text-sm font-semibold text-amber-900">Avisos</div>
                  <ul className="mt-2 text-sm text-amber-900 list-disc pl-5 space-y-1">
                    {previewWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </GlassCard>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800">XML (preview)</div>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(previewXml || '');
                      addToast('XML copiado.', 'success');
                    } catch {
                      addToast('Não foi possível copiar.', 'error');
                    }
                  }}
                  disabled={!previewXml}
                >
                  <Copy size={18} />
                  <span className="ml-2">Copiar</span>
                </Button>
              </div>

              <pre className="text-xs whitespace-pre-wrap break-words p-4 rounded-xl border border-slate-200 bg-slate-50 max-h-[60vh] overflow-auto">
                {previewXml || '—'}
              </pre>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={cceModalOpen} onClose={() => setCceModalOpen(false)} title="Carta de Correção (CC-e) — NFE-05" size="60pct">
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700">
            Observação: a NFE.io processa de forma <span className="font-semibold">assíncrona</span>. O status final será refletido via webhook/worker.
          </p>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Texto da correção</label>
            <textarea
              value={cceText}
              onChange={(e) => setCceText(e.target.value)}
              placeholder="Descreva a correção (ex.: ajuste de descrição, endereço, etc.)"
              className="w-full min-h-[160px] p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-2">
              Se a API da NFE.io exigir campos adicionais, podemos evoluir para um payload avançado.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setCceModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSendCce} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={18} /> : <FileKey size={18} />}
              <span className="ml-2">Enviar CC-e</span>
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={auditOpen} onClose={() => setAuditOpen(false)} title="Observabilidade da NF-e (NFE-06)" size="80pct">
        <div className="p-6 space-y-4">
          {auditLoading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : auditItems.length === 0 ? (
            <GlassCard className="p-4">
              <p className="text-sm text-slate-700">Sem eventos de auditoria para esta emissão.</p>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {auditItems.map((it, idx) => (
                <GlassCard key={idx} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{it?.message || it?.kind || 'Evento'}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {formatDate(it?.occurred_at)} • {it?.source || '—'}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(JSON.stringify(it?.payload ?? {}, null, 2));
                          addToast('Payload copiado.', 'success');
                        } catch {
                          addToast('Não foi possível copiar.', 'error');
                        }
                      }}
                    >
                      <Copy size={18} />
                      <span className="ml-2">Copiar</span>
                    </Button>
                  </div>
                  <pre className="mt-3 text-xs whitespace-pre-wrap break-words p-3 rounded-xl border border-slate-200 bg-slate-50 max-h-[40vh] overflow-auto">
                    {JSON.stringify(it?.payload ?? {}, null, 2)}
                  </pre>
                </GlassCard>
              ))}
            </div>
          )}
          {auditEmissaoId ? (
            <div className="flex items-center justify-end">
              <Button variant="secondary" onClick={() => void openAudit(auditEmissaoId!)}>
                <Search size={18} />
                <span className="ml-2">Recarregar</span>
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

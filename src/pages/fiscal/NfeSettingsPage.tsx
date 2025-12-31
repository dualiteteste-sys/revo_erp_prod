import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { Loader2, Receipt, Save, ShieldCheck, Upload, FileKey, Trash2 } from 'lucide-react';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';

type AmbienteNfe = 'homologacao' | 'producao';

type NfeConfig = {
  id?: string;
  empresa_id: string;
  provider_slug: string;
  ambiente: AmbienteNfe;
  nfeio_company_id: string | null;
  webhook_secret_hint: string | null;
  observacoes: string | null;
};

type NfeEmitente = {
  empresa_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  ie: string | null;
  im: string | null;
  cnae: string | null;
  crt: number | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_municipio: string | null;
  endereco_municipio_codigo: string | null;
  endereco_uf: string | null;
  endereco_cep: string | null;
  telefone: string | null;
  email: string | null;
  certificado_storage_path: string | null;
};

type NfeNumeracao = {
  id?: string;
  empresa_id: string;
  serie: number;
  proximo_numero: number;
  ativo: boolean;
};

export default function NfeSettingsPage() {
  const supabase = useSupabase() as any;
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const features = useEmpresaFeatures();
  const empresaRoleQuery = useEmpresaRole();
  const canAdmin = empresaRoleQuery.isFetched && roleAtLeast(empresaRoleQuery.data, 'admin');

  const empresaId = activeEmpresa?.id;
  const webhookUrl = `${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/nfeio-webhook`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [savingEmitente, setSavingEmitente] = useState(false);
  const [savingNumeracao, setSavingNumeracao] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [deletingCert, setDeletingCert] = useState(false);

  const [nfeEnabled, setNfeEnabled] = useState(false);
  const [config, setConfig] = useState<NfeConfig | null>(null);
  const [emitente, setEmitente] = useState<NfeEmitente | null>(null);
  const [numeracoes, setNumeracoes] = useState<NfeNumeracao[]>([]);
  const [numeracao, setNumeracao] = useState<NfeNumeracao | null>(null);
  const [newSerie, setNewSerie] = useState<string>('');
  const [disablementSerie, setDisablementSerie] = useState<string>('1');
  const [disablementStart, setDisablementStart] = useState<string>('');
  const [disablementEnd, setDisablementEnd] = useState<string>('');
  const [disablementJust, setDisablementJust] = useState<string>('');
  const [runningDisablement, setRunningDisablement] = useState(false);

  const canShow = useMemo(() => !!empresaId, [empresaId]);

  const digitsOnly = (v: string | null | undefined) => (v || '').toString().replace(/\D/g, '');

  const fetchData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [
        { data: flagRow, error: flagError },
        { data: cfgRow, error: cfgError },
        { data: emitRow, error: emitErr },
        { data: numsRows, error: numErr },
      ] = await Promise.all([
        supabase.from('empresa_feature_flags').select('nfe_emissao_enabled').eq('empresa_id', empresaId).maybeSingle(),
        supabase
          .from('fiscal_nfe_emissao_configs')
          .select('id, empresa_id, provider_slug, ambiente, nfeio_company_id, webhook_secret_hint, observacoes')
          .eq('empresa_id', empresaId)
          .eq('provider_slug', 'NFE_IO')
          .maybeSingle(),
        supabase
          .from('fiscal_nfe_emitente')
          .select(
            'empresa_id,razao_social,nome_fantasia,cnpj,ie,im,cnae,crt,endereco_logradouro,endereco_numero,endereco_complemento,endereco_bairro,endereco_municipio,endereco_municipio_codigo,endereco_uf,endereco_cep,telefone,email,certificado_storage_path'
          )
          .eq('empresa_id', empresaId)
          .maybeSingle(),
        supabase
          .from('fiscal_nfe_numeracao')
          .select('id,empresa_id,serie,proximo_numero,ativo')
          .eq('empresa_id', empresaId)
          .order('serie', { ascending: true }),
      ]);

      if (flagError) throw flagError;
      if (cfgError) throw cfgError;
      if (emitErr) throw emitErr;
      if (numErr) throw numErr;

      setNfeEnabled(!!flagRow?.nfe_emissao_enabled);
      setConfig(
        cfgRow
          ? {
              id: cfgRow.id,
              empresa_id: cfgRow.empresa_id,
              provider_slug: cfgRow.provider_slug ?? 'NFE_IO',
              ambiente: (cfgRow.ambiente ?? 'homologacao') as AmbienteNfe,
              nfeio_company_id: cfgRow.nfeio_company_id ?? null,
              webhook_secret_hint: cfgRow.webhook_secret_hint ?? null,
              observacoes: cfgRow.observacoes ?? null,
            }
          : {
              empresa_id: empresaId,
              provider_slug: 'NFE_IO',
              ambiente: 'homologacao',
              nfeio_company_id: null,
              webhook_secret_hint: null,
              observacoes: null,
            }
      );

      setEmitente(
        emitRow
          ? {
              empresa_id: emitRow.empresa_id,
              razao_social: (emitRow.razao_social ?? '').toString(),
              nome_fantasia: emitRow.nome_fantasia ?? null,
              cnpj: (emitRow.cnpj ?? '').toString(),
              ie: emitRow.ie ?? null,
              im: emitRow.im ?? null,
              cnae: emitRow.cnae ?? null,
              crt: typeof emitRow.crt === 'number' ? emitRow.crt : null,
              endereco_logradouro: emitRow.endereco_logradouro ?? null,
              endereco_numero: emitRow.endereco_numero ?? null,
              endereco_complemento: emitRow.endereco_complemento ?? null,
              endereco_bairro: emitRow.endereco_bairro ?? null,
              endereco_municipio: emitRow.endereco_municipio ?? null,
              endereco_municipio_codigo: emitRow.endereco_municipio_codigo ?? null,
              endereco_uf: emitRow.endereco_uf ?? null,
              endereco_cep: emitRow.endereco_cep ?? null,
              telefone: emitRow.telefone ?? null,
              email: emitRow.email ?? null,
              certificado_storage_path: emitRow.certificado_storage_path ?? null,
            }
          : {
              empresa_id: empresaId,
              razao_social: '',
              nome_fantasia: null,
              cnpj: '',
              ie: null,
              im: null,
              cnae: null,
              crt: 1,
              endereco_logradouro: null,
              endereco_numero: null,
              endereco_complemento: null,
              endereco_bairro: null,
              endereco_municipio: null,
              endereco_municipio_codigo: null,
              endereco_uf: null,
              endereco_cep: null,
              telefone: null,
              email: null,
              certificado_storage_path: null,
            }
      );

      const mappedNums: NfeNumeracao[] = (Array.isArray(numsRows) ? numsRows : []).map((n: any) => ({
        id: n.id,
        empresa_id: n.empresa_id,
        serie: Number(n.serie),
        proximo_numero: Number(n.proximo_numero),
        ativo: !!n.ativo,
      }));
      setNumeracoes(mappedNums);

      const active = mappedNums.find((n) => n.ativo) || mappedNums.find((n) => n.serie === 1) || mappedNums[0] || null;
      setNumeracao(
        active || {
          empresa_id: empresaId,
          serie: 1,
          proximo_numero: 1,
          ativo: true,
        }
      );
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar configurações da NF-e.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, supabase]);

  useEffect(() => {
    if (!empresaId) return;
    void fetchData();
  }, [empresaId, fetchData]);

  const handleSaveFlag = async () => {
    if (!empresaId) return;
    if (!canAdmin) {
      addToast('Sem permissão para alterar a emissão. Apenas admin/owner.', 'error');
      return;
    }
    setSavingFlag(true);
    try {
      const { error } = await supabase
        .from('empresa_feature_flags')
        .upsert({ empresa_id: empresaId, nfe_emissao_enabled: nfeEnabled }, { onConflict: 'empresa_id' });
      if (error) throw error;
      addToast('Configuração da emissão atualizada.', 'success');
      await features.refetch();
      window.dispatchEvent(new Event('empresa-features-refresh'));
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar a configuração da emissão.', 'error');
    } finally {
      setSavingFlag(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!empresaId || !config) return;
    if (!canAdmin) {
      addToast('Sem permissão para salvar configurações. Apenas admin/owner.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: config.id,
        empresa_id: empresaId,
        provider_slug: 'NFE_IO',
        ambiente: config.ambiente,
        nfeio_company_id: config.nfeio_company_id || null,
        webhook_secret_hint: config.webhook_secret_hint || null,
        observacoes: config.observacoes || null,
      };
      const { error } = await supabase
        .from('fiscal_nfe_emissao_configs')
        .upsert(payload, { onConflict: 'empresa_id,provider_slug' });
      if (error) throw error;
      addToast('Configurações do provedor salvas.', 'success');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar configurações do provedor.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const edgeErrorMessage = async (error: any): Promise<string> => {
    let detail: string | undefined = (error as any)?.message;
    try {
      const ctx: any = (error as any)?.context;
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
  };

  const handleDisableNumbers = async () => {
    if (!canAdmin) {
      addToast('Sem permissão. Apenas admin/owner.', 'error');
      return;
    }
    const serie = Math.max(1, Math.trunc(Number(disablementSerie) || 1));
    const start = Math.max(1, Math.trunc(Number(disablementStart) || 0));
    const end = Math.max(start, Math.trunc(Number(disablementEnd) || start));
    const justificativa = disablementJust.trim();
    if (!justificativa) {
      addToast('Informe a justificativa.', 'warning');
      return;
    }
    const ok = window.confirm(`Inutilizar números ${start} até ${end} (série ${serie})?`);
    if (!ok) return;

    setRunningDisablement(true);
    try {
      const { data, error } = await supabase.functions.invoke('nfeio-disablement', {
        body: { mode: 'numbers', serie, numero_inicial: start, numero_final: end, justificativa },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao solicitar inutilização.');
      addToast('Inutilização enfileirada na NFE.io (aguardando processamento).', 'success');
      setDisablementStart('');
      setDisablementEnd('');
      setDisablementJust('');
    } catch (e: any) {
      const msg = e?.context ? await edgeErrorMessage(e) : (e?.message || 'Erro ao inutilizar números.');
      addToast(msg, 'error');
    } finally {
      setRunningDisablement(false);
    }
  };

  const handleSaveEmitente = async () => {
    if (!empresaId || !emitente) return;
    if (!canAdmin) {
      addToast('Sem permissão para salvar emitente. Apenas admin/owner.', 'error');
      return;
    }

    const cnpj = digitsOnly(emitente.cnpj);
    if (cnpj.length !== 14) {
      addToast('CNPJ inválido (precisa ter 14 dígitos).', 'error');
      return;
    }
    if (!emitente.razao_social.trim()) {
      addToast('Razão social é obrigatória.', 'error');
      return;
    }

    setSavingEmitente(true);
    try {
      const payload = {
        ...emitente,
        empresa_id: empresaId,
        cnpj,
        endereco_cep: digitsOnly(emitente.endereco_cep || '') || null,
        endereco_municipio_codigo: digitsOnly(emitente.endereco_municipio_codigo || '') || null,
      };
      const { error } = await supabase.from('fiscal_nfe_emitente').upsert(payload, { onConflict: 'empresa_id' });
      if (error) throw error;
      addToast('Emitente salvo.', 'success');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar emitente.', 'error');
    } finally {
      setSavingEmitente(false);
    }
  };

  const handleSaveNumeracao = async () => {
    if (!empresaId || !numeracao) return;
    if (!canAdmin) {
      addToast('Sem permissão para salvar numeração. Apenas admin/owner.', 'error');
      return;
    }
    const serie = Math.max(1, Math.trunc(Number(numeracao.serie) || 1));
    const proximo_numero = Math.max(1, Math.trunc(Number(numeracao.proximo_numero) || 1));

    setSavingNumeracao(true);
    try {
      const payload = {
        id: numeracao.id,
        empresa_id: empresaId,
        serie,
        proximo_numero,
        ativo: !!numeracao.ativo,
      };
      const { error } = await supabase
        .from('fiscal_nfe_numeracao')
        .upsert(payload, { onConflict: 'empresa_id,serie' });
      if (error) throw error;
      addToast('Numeração salva.', 'success');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar numeração.', 'error');
    } finally {
      setSavingNumeracao(false);
    }
  };

  const handlePickSerie = (serie: number) => {
    const found = numeracoes.find((n) => n.serie === serie) || null;
    setNumeracao(
      found || {
        empresa_id: empresaId!,
        serie,
        proximo_numero: 1,
        ativo: true,
      }
    );
  };

  const handleAddSerie = () => {
    const serie = Number(newSerie);
    if (!serie || serie < 1 || serie > 999) {
      addToast('Série inválida. Use um número entre 1 e 999.', 'warning');
      return;
    }
    setNewSerie('');
    handlePickSerie(serie);
  };

  const handleUploadCert = async (file: File) => {
    if (!empresaId) return;
    if (!canAdmin) {
      addToast('Sem permissão para enviar certificado. Apenas admin/owner.', 'error');
      return;
    }
    if (!file) return;

    const nameSafe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `${empresaId}/${Date.now()}_${nameSafe}`;

    setUploadingCert(true);
    try {
      const { error } = await supabase.storage.from('nfe_certificados').upload(objectName, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
      if (error) throw error;

      // salva referência no emitente
      const { error: upErr } = await supabase
        .from('fiscal_nfe_emitente')
        .upsert({ empresa_id: empresaId, certificado_storage_path: objectName }, { onConflict: 'empresa_id' });
      if (upErr) throw upErr;

      addToast('Certificado enviado (A1).', 'success');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao enviar certificado.', 'error');
    } finally {
      setUploadingCert(false);
    }
  };

  const handleDeleteCert = async () => {
    if (!empresaId || !emitente?.certificado_storage_path) return;
    if (!canAdmin) {
      addToast('Sem permissão para remover certificado. Apenas admin/owner.', 'error');
      return;
    }
    setDeletingCert(true);
    try {
      const path = emitente.certificado_storage_path;
      const { error: rmErr } = await supabase.storage.from('nfe_certificados').remove([path]);
      if (rmErr) throw rmErr;
      const { error: upErr } = await supabase
        .from('fiscal_nfe_emitente')
        .upsert({ empresa_id: empresaId, certificado_storage_path: null }, { onConflict: 'empresa_id' });
      if (upErr) throw upErr;
      addToast('Certificado removido.', 'success');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao remover certificado.', 'error');
    } finally {
      setDeletingCert(false);
    }
  };

  if (!canShow) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para configurar a NF-e.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="Configurações de NF-e"
          description="Base interna preparada para integração (NFE.io). Emissão pode permanecer desativada até o momento do go-live."
          icon={<Receipt size={20} />}
        />
      </div>

      {loading ? (
        <div className="h-56 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : (
        <div className="space-y-6">
          <GlassCard className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <FileKey size={18} className="text-slate-700" />
                  <h2 className="text-lg font-bold text-slate-900">Emitente (Empresa)</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Preencha os dados fiscais do emitente. O certificado A1 fica em Storage privado (sem senha no banco).
                </p>
              </div>
              <Button onClick={handleSaveEmitente} disabled={savingEmitente || !emitente || !canAdmin}>
                {savingEmitente ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span className="ml-2">Salvar</span>
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Razão social</label>
                <input
                  value={emitente?.razao_social ?? ''}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, razao_social: e.target.value } : prev))}
                  disabled={!canAdmin}
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ex.: Minha Empresa LTDA"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome fantasia</label>
                <input
                  value={emitente?.nome_fantasia ?? ''}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, nome_fantasia: e.target.value || null } : prev))}
                  disabled={!canAdmin}
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ex.: Minha Marca"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">CNPJ</label>
                <input
                  value={emitente?.cnpj ?? ''}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, cnpj: e.target.value } : prev))}
                  disabled={!canAdmin}
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Somente números"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">IE</label>
                <input
                  value={emitente?.ie ?? ''}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, ie: e.target.value || null } : prev))}
                  disabled={!canAdmin}
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">CRT</label>
                <Select
                  value={String(emitente?.crt ?? 1)}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, crt: Number(e.target.value) || 1 } : prev))}
                  disabled={!canAdmin}
                  className="min-w-[220px]"
                >
                  <option value="1">1 — Simples Nacional</option>
                  <option value="2">2 — Simples (excesso sublimite)</option>
                  <option value="3">3 — Regime Normal</option>
                </Select>
              </div>

              <div className="md:col-span-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Certificado A1 (PFX/P12)</div>
                      <div className="text-xs text-slate-600 mt-1">
                        {emitente?.certificado_storage_path ? (
                          <span className="font-mono">{emitente.certificado_storage_path}</span>
                        ) : (
                          <span>Nenhum certificado enviado.</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold border transition-colors ${!canAdmin || uploadingCert ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-white'}`}>
                        <Upload size={16} />
                        <span>{uploadingCert ? 'Enviando…' : 'Enviar'}</span>
                        <input
                          type="file"
                          accept=".pfx,.p12,application/x-pkcs12"
                          disabled={!canAdmin || uploadingCert}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUploadCert(file);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      <Button
                        variant="secondary"
                        onClick={() => void handleDeleteCert()}
                        disabled={!canAdmin || deletingCert || !emitente?.certificado_storage_path}
                        title="Remover certificado"
                      >
                        {deletingCert ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                        <span className="ml-2">Remover</span>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    A senha do certificado <span className="font-semibold">não</span> é salva no banco. Ela será usada somente na etapa de emissão (NFE-05).
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Numeração (NF-e)</h2>
                <p className="text-sm text-slate-600 mt-1">Configure série(s) e o próximo número a emitir.</p>
              </div>
              <Button onClick={handleSaveNumeracao} disabled={savingNumeracao || !numeracao || !canAdmin}>
                {savingNumeracao ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span className="ml-2">Salvar</span>
              </Button>
            </div>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Série</label>
                <div className="flex gap-2">
                  <Select
                    value={String(numeracao?.serie ?? 1)}
                    onChange={(e) => handlePickSerie(Number(e.target.value))}
                    disabled={!canAdmin}
                    className="min-w-[160px]"
                  >
                    {(numeracoes.length ? numeracoes : [{ serie: 1, ativo: true } as any]).map((n) => (
                      <option key={String(n.serie)} value={String(n.serie)}>
                        Série {n.serie}{n.ativo ? ' (ativa)' : ''}
                      </option>
                    ))}
                  </Select>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    value={newSerie}
                    onChange={(e) => setNewSerie(e.target.value)}
                    disabled={!canAdmin}
                    className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Nova série"
                  />
                  <Button type="button" variant="secondary" onClick={handleAddSerie} disabled={!canAdmin || !newSerie}>
                    Adicionar
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Dica: use séries diferentes para fluxos/filiais. Marque apenas uma como <b>ativa</b> para emissão padrão.
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Próximo número</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={String(numeracao?.proximo_numero ?? 1)}
                  onChange={(e) => setNumeracao((prev) => (prev ? { ...prev, proximo_numero: Number(e.target.value) || 1 } : prev))}
                  disabled={!canAdmin}
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 select-none text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!numeracao?.ativo}
                    onChange={(e) => setNumeracao((prev) => (prev ? { ...prev, ativo: e.target.checked } : prev))}
                    disabled={!canAdmin}
                    className="h-5 w-5 accent-blue-600"
                  />
                  Ativo
                </label>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-slate-700" />
                  <h2 className="text-lg font-bold text-slate-900">Controle de emissão</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Quando desativado, você ainda pode criar rascunhos e preparar payloads, mas não poderá enviar para autorização.
                </p>
              </div>

              <Button onClick={handleSaveFlag} disabled={savingFlag || !canAdmin}>
                {savingFlag ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span className="ml-2">Salvar</span>
              </Button>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Emissão de NF-e: <span className={nfeEnabled ? 'text-emerald-700' : 'text-amber-700'}>{nfeEnabled ? 'Ativada' : 'Desativada'}</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Status atual (feature flag): <span className="font-semibold">{features.nfe_emissao_enabled ? 'Ativada' : 'Desativada'}</span>
                </p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span className="text-sm text-slate-700">Ativar</span>
                <input
                  type="checkbox"
                  checked={nfeEnabled}
                  onChange={(e) => setNfeEnabled(e.target.checked)}
                  disabled={!canAdmin}
                  className="h-5 w-5 accent-blue-600"
                />
              </label>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Provedor (NFE.io)</h2>
                <p className="text-sm text-slate-600 mt-1">Sem segredos aqui. Tokens e certificados ficarão em vault/edge function quando ativarmos a emissão.</p>
              </div>
              <Button onClick={handleSaveConfig} disabled={saving || !config || !canAdmin}>
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span className="ml-2">Salvar</span>
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Webhook NFE.io (NFE-06)</p>
                <p className="text-xs text-slate-600 mt-1">
                  Use este endpoint no painel da NFE.io. Configure o HMAC com o mesmo valor do secret <span className="font-mono">NFEIO_WEBHOOK_SECRET</span> (Supabase secrets).
                </p>
                <div className="mt-2 text-xs text-slate-700 font-mono break-all">{webhookUrl}</div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">NFE.io Company ID (obrigatório para NFE-07)</label>
                <input
                  type="text"
                  value={config?.nfeio_company_id ?? ''}
                  onChange={(e) =>
                    setConfig((prev) => (prev ? { ...prev, nfeio_company_id: e.target.value || null } : prev))
                  }
                  placeholder="Ex.: 0f2c... (id da empresa no painel/API da NFE.io)"
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Esse ID é exigido pelos endpoints de <span className="font-semibold">cancelamento</span>, <span className="font-semibold">CC-e</span>, <span className="font-semibold">inutilização</span> e <span className="font-semibold">DANFE</span>.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Ambiente</label>
                <Select
                  value={config?.ambiente || 'homologacao'}
                  onChange={(e) => setConfig((prev) => (prev ? { ...prev, ambiente: e.target.value as AmbienteNfe } : prev))}
                  className="min-w-[220px]"
                >
                  <option value="homologacao">Homologação</option>
                  <option value="producao">Produção</option>
                </Select>
                <p className="text-xs text-slate-500 mt-2">Recomendado manter em homologação até o go-live.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Webhook (dica / identificador)</label>
                <input
                  type="text"
                  value={config?.webhook_secret_hint ?? ''}
                  onChange={(e) => setConfig((prev) => (prev ? { ...prev, webhook_secret_hint: e.target.value || null } : prev))}
                  placeholder="Ex.: nfeio-webhook-empresa-01"
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-slate-500 mt-2">Apenas referência. O segredo real não deve ser salvo no banco.</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Observações</label>
                <textarea
                  value={config?.observacoes ?? ''}
                  onChange={(e) => setConfig((prev) => (prev ? { ...prev, observacoes: e.target.value || null } : prev))}
                  placeholder="Anotações internas sobre homologação, certificado, responsável, etc."
                  className="w-full min-h-[120px] p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Inutilização de números (NFE-07)</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Use quando a numeração ficou com “buraco” e você precisa inutilizar uma faixa (operação assíncrona).
                    </p>
                  </div>
                  <Button onClick={handleDisableNumbers} disabled={!canAdmin || runningDisablement}>
                    {runningDisablement ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                    <span className="ml-2">Inutilizar</span>
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Série</label>
                    <input
                      value={disablementSerie}
                      onChange={(e) => setDisablementSerie(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-xl shadow-sm"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Número inicial</label>
                    <input
                      value={disablementStart}
                      onChange={(e) => setDisablementStart(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-xl shadow-sm"
                      placeholder="Ex.: 10"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Número final</label>
                    <input
                      value={disablementEnd}
                      onChange={(e) => setDisablementEnd(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-xl shadow-sm"
                      placeholder="Ex.: 15"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Justificativa</label>
                    <input
                      value={disablementJust}
                      onChange={(e) => setDisablementJust(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-xl shadow-sm"
                      placeholder="Ex.: falha técnica, número não utilizado, etc."
                    />
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

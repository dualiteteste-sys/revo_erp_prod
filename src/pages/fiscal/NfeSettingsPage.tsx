import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { Loader2, Receipt, Save, ShieldCheck, Upload, FileKey, Trash2, ShieldAlert, CheckCircle2, Eye, EyeOff, Smartphone, ExternalLink, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';
import { cnpjMask } from '@/lib/masks';
import RoadmapButton from '@/components/roadmap/RoadmapButton';
import {
  getFiscalFeatureFlags,
  getFiscalNfeEmissaoConfig,
  getFiscalNfeEmitente,
  getFocusNfeEmpresaStatus,
  listFiscalNfeNumeracoes,
  registerFocusNfeEmpresa,
  setFiscalNfeEmissaoEnabled,
  upsertFiscalNfeEmissaoConfig,
  upsertFiscalNfeEmitente,
  upsertFiscalNfeNumeracao,
} from '@/services/fiscalNfeSettings';
import type { FocusNfeEmpresaStatus } from '@/services/fiscalNfeSettings';
import { uploadCertToFocusNfe } from '@/services/nfeDestinadasService';
import { callRpc } from '@/lib/api';

type AmbienteNfe = 'homologacao' | 'producao';

type NfeConfig = {
  id?: string;
  empresa_id: string;
  provider_slug: string;
  ambiente: AmbienteNfe;
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
  certificado_validade: string | null;
  certificado_cnpj: string | null;
  certificado_senha_encrypted: string | null;
  // NFC-e
  csc: string | null;
  id_csc: string | null;
  nfce_serie: number | null;
  nfce_proximo_numero: number | null;
};

type NfeNumeracao = {
  id?: string;
  empresa_id: string;
  serie: number;
  proximo_numero: number;
  ativo: boolean;
};

type Props = {
  onEmitenteSaved?: () => void | Promise<void>;
  onNumeracaoSaved?: () => void | Promise<void>;
};

export default function NfeSettingsPage({ onEmitenteSaved, onNumeracaoSaved }: Props) {
  const supabase = useSupabase() as any;
  const { activeEmpresa } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const features = useEmpresaFeatures();
  const empresaRoleQuery = useEmpresaRole();
  const canAdmin = empresaRoleQuery.isFetched && roleAtLeast(empresaRoleQuery.data, 'admin');

  const empresaId = activeEmpresa?.id;
  const webhookUrl = `${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/focusnfe-webhook`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [savingEmitente, setSavingEmitente] = useState(false);
  const [savingNumeracao, setSavingNumeracao] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [deletingCert, setDeletingCert] = useState(false);
  const [certPassword, setCertPassword] = useState('');
  const [showCertPassword, setShowCertPassword] = useState(false);
  const [showCsc, setShowCsc] = useState(false);
  const [savingNfce, setSavingNfce] = useState(false);
  const [validatingCert, setValidatingCert] = useState(false);

  const [nfeEnabled, setNfeEnabled] = useState(false);
  const [ibsCbsEnabled, setIbsCbsEnabled] = useState(false);
  const [savingIbsCbs, setSavingIbsCbs] = useState(false);
  const [config, setConfig] = useState<NfeConfig | null>(null);
  const [emitente, setEmitente] = useState<NfeEmitente | null>(null);
  const [numeracoes, setNumeracoes] = useState<NfeNumeracao[]>([]);
  const [numeracao, setNumeracao] = useState<NfeNumeracao | null>(null);
  const [newSerie, setNewSerie] = useState<string>('');
  const [focusStatus, setFocusStatus] = useState<FocusNfeEmpresaStatus | null>(null);
  const [registering, setRegistering] = useState(false);

  const canShow = useMemo(() => !!empresaId, [empresaId]);

  const digitsOnly = (v: string | null | undefined) => (v || '').toString().replace(/\D/g, '');

  const fetchData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [flags, cfgFocusRow, emitRow, numsRows, focusSt] = await Promise.all([
        getFiscalFeatureFlags(),
        getFiscalNfeEmissaoConfig('FOCUSNFE'),
        getFiscalNfeEmitente(),
        listFiscalNfeNumeracoes(),
        getFocusNfeEmpresaStatus().catch(() => null),
      ]);

      setFocusStatus(focusSt ?? null);

      setNfeEnabled(!!flags?.nfe_emissao_enabled);

      // Load IBS/CBS status
      try {
        const ibsStatus = await callRpc<{ ok: boolean; fiscal_ibs_cbs_enabled: boolean }>('fiscal_ibs_cbs_status', {});
        setIbsCbsEnabled(!!ibsStatus?.fiscal_ibs_cbs_enabled);
      } catch { /* ignore if RPC not yet deployed */ }

      setConfig(
        cfgFocusRow
          ? {
              id: cfgFocusRow.id,
              empresa_id: cfgFocusRow.empresa_id,
              provider_slug: 'FOCUSNFE',
              ambiente: (cfgFocusRow.ambiente ?? 'homologacao') as AmbienteNfe,
              webhook_secret_hint: cfgFocusRow.webhook_secret_hint ?? null,
              observacoes: cfgFocusRow.observacoes ?? null,
            }
          : { empresa_id: empresaId, provider_slug: 'FOCUSNFE', ambiente: 'homologacao', webhook_secret_hint: null, observacoes: null }
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
              certificado_validade: emitRow.certificado_validade ?? null,
              certificado_cnpj: emitRow.certificado_cnpj ?? null,
              certificado_senha_encrypted: emitRow.certificado_senha_encrypted ?? null,
              csc: (emitRow as any).csc ?? null,
              id_csc: (emitRow as any).id_csc ?? null,
              nfce_serie: typeof (emitRow as any).nfce_serie === 'number' ? (emitRow as any).nfce_serie : 1,
              nfce_proximo_numero: typeof (emitRow as any).nfce_proximo_numero === 'number' ? (emitRow as any).nfce_proximo_numero : 1,
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
              certificado_validade: null,
              certificado_cnpj: null,
              certificado_senha_encrypted: null,
              csc: null,
              id_csc: null,
              nfce_serie: 1,
              nfce_proximo_numero: 1,
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
      await setFiscalNfeEmissaoEnabled(nfeEnabled);
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
      await upsertFiscalNfeEmissaoConfig({
        provider_slug: 'FOCUSNFE',
        ambiente: config.ambiente,
        webhook_secret_hint: config.webhook_secret_hint || null,
        observacoes: config.observacoes || null,
      });
      addToast('Configurações do provedor salvas.', 'success');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar configurações do provedor.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // handleSaveEmitente removed — identity is now managed via Super Cadastro (CompanySettingsForm).
  // Certificate and NFC-e saves use upsertFiscalNfeEmitente directly.

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
      await upsertFiscalNfeNumeracao({ serie, proximo_numero, ativo: !!numeracao.ativo });
      addToast('Numeração salva.', 'success');
      await fetchData();
      await onNumeracaoSaved?.();
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
      await upsertFiscalNfeEmitente({ empresa_id: empresaId, certificado_storage_path: objectName });

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
      await upsertFiscalNfeEmitente({ empresa_id: empresaId, certificado_storage_path: null });
      addToast('Certificado removido.', 'success');
      await fetchData();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao remover certificado.', 'error');
    } finally {
      setDeletingCert(false);
    }
  };

  const handleValidateCert = async () => {
    if (!empresaId || !emitente?.certificado_storage_path || !certPassword.trim()) return;
    if (!canAdmin) {
      addToast('Sem permissão. Apenas admin/owner.', 'error');
      return;
    }
    setValidatingCert(true);
    try {
      const result = await uploadCertToFocusNfe(certPassword.trim());
      if (result.ok) {
        const certMsg = result.cert_info?.valid_until
          ? `CNPJ: ${result.cert_info.cnpj || '—'}, válido até ${new Date(result.cert_info.valid_until).toLocaleDateString('pt-BR')}.`
          : '';
        addToast(
          result.message || `Certificado salvo com sucesso. ${certMsg}`.trim(),
          'success',
        );
        setCertPassword('');
        await fetchData();
      } else {
        const msg = result.error === 'WRONG_PASSWORD'
          ? 'Senha incorreta para o certificado digital.'
          : result.error === 'CERTIFICATE_EXPIRED'
          ? 'Certificado digital expirado. Renove junto à certificadora.'
          : result.detail || result.error || 'Falha ao enviar certificado para Focus NFe.';
        addToast(msg, 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao enviar certificado para Focus NFe.', 'error');
    } finally {
      setValidatingCert(false);
    }
  };

  const handleRegisterFocusNfe = async () => {
    if (!canAdmin) {
      addToast('Sem permissão. Apenas admin/owner.', 'error');
      return;
    }
    setRegistering(true);
    try {
      const res = await registerFocusNfeEmpresa();
      if (res.ok) {
        addToast(res.message || 'Empresa registrada na Focus NFe!', 'success');
        await fetchData();
      } else {
        addToast(res.detail || res.error || 'Erro ao registrar empresa na Focus NFe.', 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao registrar empresa na Focus NFe.', 'error');
    } finally {
      setRegistering(false);
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
          description="Base interna preparada para integração (Focus NF-e). Emissão pode permanecer desativada até o momento do go-live."
          icon={<Receipt size={20} />}
          actions={<RoadmapButton contextKey="fiscal" label="Assistente" title="Abrir assistente da NF-e" />}
        />
      </div>

      {loading ? (
        <div className="h-56 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Focus NFe Status Card */}
          <GlassCard className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-900">Status Focus NFe</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Registro da empresa e certificado na plataforma Focus NFe.
                </p>
              </div>
              <Button onClick={handleRegisterFocusNfe} disabled={registering || !canAdmin}>
                {registering ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                <span className="ml-2">{focusStatus?.focusnfe_registrada ? 'Atualizar registro' : 'Registrar empresa'}</span>
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`rounded-xl border p-4 ${focusStatus?.focusnfe_registrada ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="text-xs font-semibold text-slate-600">Registro</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {focusStatus?.focusnfe_registrada ? (
                    <><CheckCircle2 size={16} className="text-emerald-600" /><span className="text-sm font-semibold text-emerald-800">Registrada</span></>
                  ) : (
                    <><ShieldAlert size={16} className="text-amber-600" /><span className="text-sm font-semibold text-amber-800">Não registrada</span></>
                  )}
                </div>
                {focusStatus?.focusnfe_registrada_em && (
                  <p className="text-xs text-slate-500 mt-1">
                    em {new Date(focusStatus.focusnfe_registrada_em).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
              <div className={`rounded-xl border p-4 ${focusStatus?.certificado_validade ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-xs font-semibold text-slate-600">Certificado A1</p>
                {focusStatus?.certificado_validade ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-800 mt-1">
                      Válido até {new Date(focusStatus.certificado_validade).toLocaleDateString('pt-BR')}
                    </p>
                    {focusStatus.certificado_cnpj && (
                      <p className="text-xs text-slate-500 mt-0.5">CNPJ: {focusStatus.certificado_cnpj}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">Não configurado</p>
                )}
              </div>
              <div className="rounded-xl border bg-gray-50 border-gray-200 p-4">
                <p className="text-xs font-semibold text-slate-600">Ambiente</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">
                  {config?.ambiente === 'producao' ? 'Produção' : 'Homologação'}
                </p>
              </div>
            </div>
            {focusStatus?.focusnfe_ultimo_erro && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                Último erro: {focusStatus.focusnfe_ultimo_erro}
              </div>
            )}
          </GlassCard>

          {/* ── Dados da Empresa (read-only summary) ── */}
          <GlassCard className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-slate-700" />
                  <h2 className="text-lg font-bold text-slate-900">Dados da Empresa</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Estes dados são gerenciados no cadastro central da empresa e sincronizados automaticamente com a NF-e.
                </p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/app/configuracoes/geral/empresa')}>
                <ExternalLink size={16} />
                <span className="ml-2">Editar cadastro</span>
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: 'Razão Social', value: activeEmpresa?.nome_razao_social || emitente?.razao_social },
                { label: 'CNPJ', value: cnpjMask(activeEmpresa?.cnpj || emitente?.cnpj || '') },
                { label: 'Regime Tributário', value: (() => { const c = (activeEmpresa as any)?.crt ?? emitente?.crt; return c === 1 ? '1 — Simples Nacional' : c === 2 ? '2 — Simples (excesso)' : c === 3 ? '3 — Regime Normal' : '—'; })() },
                { label: 'IE', value: (activeEmpresa as any)?.inscr_estadual || emitente?.ie },
                { label: 'IM', value: (activeEmpresa as any)?.inscr_municipal || emitente?.im },
                { label: 'CNAE', value: (activeEmpresa as any)?.cnae || emitente?.cnae },
                { label: 'Cidade/UF', value: [activeEmpresa?.endereco_cidade || emitente?.endereco_municipio, activeEmpresa?.endereco_uf || emitente?.endereco_uf].filter(Boolean).join('/') },
                { label: 'Cód. IBGE', value: (activeEmpresa as any)?.endereco_municipio_codigo || emitente?.endereco_municipio_codigo },
                { label: 'CEP', value: activeEmpresa?.endereco_cep || emitente?.endereco_cep },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white/60 px-3 py-2.5 opacity-90">
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-medium text-slate-700 truncate mt-0.5">{value || '—'}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 mt-3">
              Para alterar, acesse Configurações → Empresa. As mudanças refletem automaticamente na emissão de NF-e.
            </p>
          </GlassCard>

          {/* ── Certificado Digital A1 ── */}
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileKey size={18} className="text-slate-700" />
              <h2 className="text-lg font-bold text-slate-900">Certificado Digital A1</h2>
            </div>

            <div className="mt-2">
              <div className="md:col-span-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Certificado A1 (PFX/P12)</div>
                      <div className="text-xs text-slate-600 mt-1">
                        {emitente?.certificado_storage_path ? (
                          <span className="font-mono">{emitente.certificado_storage_path.split('/').pop()}</span>
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

                  {/* Certificate metadata (shown after validation) */}
                  {emitente?.certificado_validade && (
                    <div className="flex items-center gap-4 text-xs bg-white rounded-lg border border-slate-200 p-3">
                      <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <span><strong>CNPJ:</strong> {emitente.certificado_cnpj || '—'}</span>
                        <span>
                          <strong>Validade:</strong>{' '}
                          {new Date(emitente.certificado_validade).toLocaleDateString('pt-BR')}
                          {new Date(emitente.certificado_validade) < new Date() && (
                            <span className="ml-1 text-red-600 font-semibold">(Expirado)</span>
                          )}
                        </span>
                        <span>
                          <strong>Senha:</strong>{' '}
                          {emitente.certificado_senha_encrypted
                            ? <span className="text-emerald-700">Salva (criptografada)</span>
                            : <span className="text-amber-600">Não configurada</span>}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Password input + validate button (shown when cert is uploaded but not validated, or to re-validate) */}
                  {emitente?.certificado_storage_path && (
                    <div className="flex items-end gap-3">
                      <div className="flex-1 max-w-xs">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Senha do certificado
                        </label>
                        <div className="relative">
                          <input
                            type={showCertPassword ? 'text' : 'password'}
                            value={certPassword}
                            onChange={(e) => setCertPassword(e.target.value)}
                            disabled={!canAdmin || validatingCert}
                            className="w-full p-2.5 pr-10 text-sm border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Digite a senha do PFX"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCertPassword((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                            tabIndex={-1}
                          >
                            {showCertPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <Button
                        onClick={() => void handleValidateCert()}
                        disabled={!canAdmin || validatingCert || !certPassword.trim()}
                      >
                        {validatingCert ? <Loader2 className="animate-spin" size={16} /> : <ShieldAlert size={16} />}
                        <span className="ml-2">{emitente.certificado_senha_encrypted ? 'Reenviar para Focus NFe' : 'Enviar para Focus NFe'}</span>
                      </Button>
                    </div>
                  )}

                  <div className="text-xs text-slate-600">
                    O certificado e a senha são enviados para a Focus NFe, que gerencia a comunicação com a SEFAZ. A senha também é criptografada (AES-GCM) localmente como backup.
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* NFC-e Configuration */}
          <GlassCard className="p-6 border border-emerald-200 bg-emerald-50/20">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone size={18} className="text-emerald-600" />
                  <h2 className="text-lg font-bold text-slate-900">NFC-e — Modelo 65</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Configure o CSC para emissão automática de NFC-e (cupom fiscal eletrônico) pelo PDV. O CSC é obtido no portal da SEFAZ do seu estado.
                </p>
              </div>
              <Button
                onClick={async () => {
                  if (!empresaId || !emitente || !canAdmin) return;
                  setSavingNfce(true);
                  try {
                    await upsertFiscalNfeEmitente({
                      empresa_id: empresaId,
                      csc: emitente.csc || null,
                      id_csc: emitente.id_csc || null,
                      nfce_serie: emitente.nfce_serie ?? 1,
                      nfce_proximo_numero: emitente.nfce_proximo_numero ?? 1,
                    } as any);
                    addToast('Configuração NFC-e salva.', 'success');
                    await fetchData();
                  } catch (e: any) {
                    addToast(e?.message || 'Erro ao salvar configuração NFC-e.', 'error');
                  } finally {
                    setSavingNfce(false);
                  }
                }}
                disabled={savingNfce || !canAdmin}
              >
                {savingNfce ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span className="ml-2">Salvar</span>
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">CSC (Código de Segurança do Contribuinte)</label>
                <div className="relative">
                  <input
                    type={showCsc ? 'text' : 'password'}
                    value={emitente?.csc ?? ''}
                    onChange={(e) => setEmitente((prev) => (prev ? { ...prev, csc: e.target.value || null } : prev))}
                    disabled={!canAdmin}
                    placeholder="Cole o CSC da SEFAZ aqui"
                    className="w-full p-3 pr-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCsc((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showCsc ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Obrigatório para NFC-e. Obtenha no portal da SEFAZ (Contribuinte → CSC).
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ID do CSC</label>
                <input
                  type="text"
                  value={emitente?.id_csc ?? ''}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, id_csc: e.target.value || null } : prev))}
                  disabled={!canAdmin}
                  placeholder="Ex.: 1"
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Identificador numérico do CSC (geralmente "1" para produção).
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Série NFC-e</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={String(emitente?.nfce_serie ?? 1)}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, nfce_serie: Number(e.target.value) || 1 } : prev))}
                  disabled={!canAdmin}
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Próximo Número NFC-e</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={String(emitente?.nfce_proximo_numero ?? 1)}
                  onChange={(e) => setEmitente((prev) => (prev ? { ...prev, nfce_proximo_numero: Number(e.target.value) || 1 } : prev))}
                  disabled={!canAdmin}
                  className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            {emitente?.csc ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 size={16} />
                <span>CSC configurado — NFC-e habilitada no PDV.</span>
              </div>
            ) : (
              <div className="mt-4 text-sm text-amber-600">
                Sem CSC configurado — NFC-e desabilitada. O PDV funciona normalmente, mas sem emissão de cupom fiscal.
              </div>
            )}
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
	                <h2 className="text-lg font-bold text-slate-900">Provedor (Focus NF-e)</h2>
	                <p className="text-sm text-slate-600 mt-1">
	                  Sem segredos aqui. Tokens ficam na Focus; a Ultria recebe atualizações via webhook (Edge Function).
	                </p>
	              </div>
	              <Button onClick={handleSaveConfig} disabled={saving || !config || !canAdmin}>
	                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
	                <span className="ml-2">Salvar</span>
	              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
	              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
	                <p className="text-sm font-semibold text-slate-800">Webhook Focus NF-e</p>
	                <p className="text-xs text-slate-600 mt-1">
	                  Configure no painel da Focus (Webhooks → NF-e) com o header <span className="font-mono">Authorization</span> e valor{' '}
	                  <span className="font-mono">Bearer {'<SEU_SEGREDO>'}</span>. O segredo deve existir nos Edge Secrets como{' '}
	                  <span className="font-mono">FOCUSNFE_WEBHOOK_SECRET_HML</span> (homologação) e/ou{' '}
	                  <span className="font-mono">FOCUSNFE_WEBHOOK_SECRET_PROD</span> (produção).
	                </p>
	                <div className="mt-2 text-xs text-slate-700 font-mono break-all">{webhookUrl}</div>
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
	                  placeholder="Ex.: focusnfe-webhook-empresa-01"
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
            </div>
          </GlassCard>

          {/* IBS/CBS 2026 Toggle */}
          <GlassCard className="p-6 mt-6 border border-violet-200 bg-violet-50/20">
            <h2 className="text-lg font-bold text-violet-800 mb-1">IBS / CBS — Reforma Tributária 2026</h2>
            <p className="text-sm text-violet-600 mb-4">
              Ativa os campos IBS/CBS nas naturezas de operação, regras fiscais e itens de NF-e. Quando ativo, o motor fiscal calcula IBS e CBS automaticamente.
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ibsCbsEnabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setSavingIbsCbs(true);
                    try {
                      await callRpc('fiscal_ibs_cbs_toggle', { p_enabled: enabled });
                      setIbsCbsEnabled(enabled);
                      addToast(enabled ? 'IBS/CBS ativado.' : 'IBS/CBS desativado.', 'success');
                    } catch (err: any) {
                      addToast(err?.message || 'Erro ao alterar flag IBS/CBS.', 'error');
                    } finally {
                      setSavingIbsCbs(false);
                    }
                  }}
                  disabled={!canAdmin || savingIbsCbs}
                  className="h-5 w-5 accent-violet-600"
                />
                <span className="text-sm font-medium text-slate-700">
                  {ibsCbsEnabled ? 'IBS/CBS Ativado' : 'IBS/CBS Desativado'}
                </span>
                {savingIbsCbs && <Loader2 size={14} className="animate-spin text-violet-600" />}
              </label>
            </div>
            <p className="text-xs text-violet-500 mt-3">
              Quando ativado, os campos IBS/CBS aparecem em Naturezas de Operação e Regras Fiscais, e o motor fiscal calcula IBS e CBS automaticamente. Ao desativar, os campos ficam ocultos e o cálculo é ignorado. Nenhum dado é perdido ao desativar.
            </p>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

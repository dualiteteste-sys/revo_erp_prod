import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { Loader2, Receipt, Save, ShieldCheck } from 'lucide-react';

type AmbienteNfe = 'homologacao' | 'producao';

type NfeConfig = {
  id?: string;
  empresa_id: string;
  provider_slug: string;
  ambiente: AmbienteNfe;
  webhook_secret_hint: string | null;
  observacoes: string | null;
};

export default function NfeSettingsPage() {
  const supabase = useSupabase() as any;
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const features = useEmpresaFeatures();

  const empresaId = activeEmpresa?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);

  const [nfeEnabled, setNfeEnabled] = useState(false);
  const [config, setConfig] = useState<NfeConfig | null>(null);

  const canShow = useMemo(() => !!empresaId, [empresaId]);

  const fetchData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [{ data: flagRow, error: flagError }, { data: cfgRow, error: cfgError }] = await Promise.all([
        supabase.from('empresa_feature_flags').select('nfe_emissao_enabled').eq('empresa_id', empresaId).maybeSingle(),
        supabase
          .from('fiscal_nfe_emissao_configs')
          .select('id, empresa_id, provider_slug, ambiente, webhook_secret_hint, observacoes')
          .eq('empresa_id', empresaId)
          .eq('provider_slug', 'NFE_IO')
          .maybeSingle(),
      ]);

      if (flagError) throw flagError;
      if (cfgError) throw cfgError;

      setNfeEnabled(!!flagRow?.nfe_emissao_enabled);
      setConfig(
        cfgRow
          ? {
              id: cfgRow.id,
              empresa_id: cfgRow.empresa_id,
              provider_slug: cfgRow.provider_slug ?? 'NFE_IO',
              ambiente: (cfgRow.ambiente ?? 'homologacao') as AmbienteNfe,
              webhook_secret_hint: cfgRow.webhook_secret_hint ?? null,
              observacoes: cfgRow.observacoes ?? null,
            }
          : {
              empresa_id: empresaId,
              provider_slug: 'NFE_IO',
              ambiente: 'homologacao',
              webhook_secret_hint: null,
              observacoes: null,
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
    setSaving(true);
    try {
      const payload = {
        id: config.id,
        empresa_id: empresaId,
        provider_slug: 'NFE_IO',
        ambiente: config.ambiente,
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
                  <ShieldCheck size={18} className="text-slate-700" />
                  <h2 className="text-lg font-bold text-slate-900">Controle de emissão</h2>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Quando desativado, você ainda pode criar rascunhos e preparar payloads, mas não poderá enviar para autorização.
                </p>
              </div>

              <Button onClick={handleSaveFlag} disabled={savingFlag}>
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
              <Button onClick={handleSaveConfig} disabled={saving || !config}>
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span className="ml-2">Salvar</span>
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
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
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}


import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Lock, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';
import { getFiscalNfeEmissaoConfig, setFiscalNfeEmissaoEnabled, upsertFiscalNfeEmissaoConfig } from '@/services/fiscalNfeSettings';

type AmbienteNfe = 'homologacao' | 'producao';

type NfeConfigForm = {
  ambiente: AmbienteNfe;
  webhook_secret_hint: string;
  observacoes: string;
};

const DEFAULT_FORM: NfeConfigForm = {
  ambiente: 'homologacao',
  webhook_secret_hint: '',
  observacoes: '',
};

const NfeEmissaoSettings: React.FC = () => {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const features = useEmpresaFeatures();
  const empresaRoleQuery = useEmpresaRole();
  const canAdmin = empresaRoleQuery.isFetched && roleAtLeast(empresaRoleQuery.data, 'admin');
  const webhookUrl = `${(import.meta as any).env?.VITE_SUPABASE_URL}/functions/v1/focusnfe-webhook`;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFeatureFlag, setSavingFeatureFlag] = useState(false);
  const [initial, setInitial] = useState<NfeConfigForm>(DEFAULT_FORM);
  const [form, setForm] = useState<NfeConfigForm>(DEFAULT_FORM);

  const isDirty = useMemo(() => JSON.stringify(initial) !== JSON.stringify(form), [initial, form]);
  const nfeEnabled = !!features.nfe_emissao_enabled;

  useEffect(() => {
    const load = async () => {
      if (!activeEmpresa?.id) return;
      setLoading(true);
      try {
        const data = await getFiscalNfeEmissaoConfig('FOCUSNFE');

        const next: NfeConfigForm = {
          ambiente: (data?.ambiente as AmbienteNfe) || 'homologacao',
          webhook_secret_hint: (data?.webhook_secret_hint || '').toString(),
          observacoes: (data?.observacoes || '').toString(),
        };
        setInitial(next);
        setForm(next);
      } catch (err: any) {
        addToast(err?.message || 'Falha ao carregar configurações de NF-e.', 'error');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [activeEmpresa?.id, addToast]);

  const handleToggleNfeEnabled = async (next: boolean) => {
    if (!activeEmpresa?.id) return;
    if (!canAdmin) {
      addToast('Sem permissão para alterar a emissão. Apenas admin/owner.', 'error');
      return;
    }
    setSavingFeatureFlag(true);
    try {
      await setFiscalNfeEmissaoEnabled(next);
      addToast(next ? 'Emissão de NF-e habilitada.' : 'Emissão de NF-e desativada.', 'success');
      window.dispatchEvent(new Event('empresa-features-refresh'));
      await features.refetch();
    } catch (err: any) {
      addToast(err?.message || 'Falha ao atualizar o status de emissão.', 'error');
    } finally {
      setSavingFeatureFlag(false);
    }
  };

  const handleSave = async () => {
    if (!activeEmpresa?.id) return;
    if (!canAdmin) {
      addToast('Sem permissão para salvar configurações. Apenas admin/owner.', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertFiscalNfeEmissaoConfig({
        provider_slug: 'FOCUSNFE',
        ambiente: form.ambiente,
        webhook_secret_hint: form.webhook_secret_hint.trim() || null,
        observacoes: form.observacoes.trim() || null,
      });

      setInitial(form);
      addToast('Configurações de NF-e salvas com sucesso.', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Falha ao salvar configurações de NF-e.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">NF-e (Emissão)</h1>
          <p className="mt-2 text-gray-600">
            Base interna para emissão de NF-e (modelo 55). A integração é feita via Focus NF-e.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {nfeEnabled ? (
            <span className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700">
              <BadgeCheck size={16} />
              Habilitado
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-1 rounded-full bg-yellow-100 text-yellow-800">
              <Lock size={16} />
              Desativado
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white/70 p-5">
        <div className="mb-6 rounded-xl border border-gray-200 bg-white/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-800">Ativação da emissão</div>
              <div className="text-xs text-gray-500 mt-1">
                Controle de feature-flag: deixe desativado até decidir assinar/usar a emissão em produção.
              </div>
            </div>

            <label className="inline-flex items-center gap-3 select-none">
              <span className="text-sm text-gray-700">{nfeEnabled ? 'Habilitado' : 'Desativado'}</span>
              <button
                type="button"
                onClick={() => void handleToggleNfeEnabled(!nfeEnabled)}
                disabled={savingFeatureFlag || features.loading || !canAdmin}
                className={[
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                  nfeEnabled ? 'bg-blue-600' : 'bg-gray-300',
                  (savingFeatureFlag || features.loading || !canAdmin) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
                aria-pressed={nfeEnabled}
                aria-label="Alternar emissão de NF-e"
              >
                <span
                  className={[
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                    nfeEnabled ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')}
                />
              </button>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provedor</label>
            <input
              value="Focus NF-e"
              disabled
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
            />
            <p className="mt-2 text-xs text-gray-500">
              Configure o webhook no painel da Focus para que a Ultria receba os eventos de processamento.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="ambiente">
              Ambiente padrão
            </label>
            <select
              id="ambiente"
              value={form.ambiente}
              onChange={(e) => setForm((prev) => ({ ...prev, ambiente: e.target.value as AmbienteNfe }))}
              disabled={loading}
              className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
            >
              <option value="homologacao">Homologação</option>
              <option value="producao">Produção</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="webhook_secret_hint">
              Webhook (dica / identificador)
            </label>
            <input
              id="webhook_secret_hint"
              value={form.webhook_secret_hint}
              onChange={(e) => setForm((prev) => ({ ...prev, webhook_secret_hint: e.target.value }))}
              disabled={loading}
              placeholder="Ex.: focusnfe-webhook-empresa-01"
              className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              Apenas referência. O segredo real não deve ser salvo no banco. Endpoint: <span className="font-mono">{webhookUrl}</span>
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="observacoes">
              Observações
            </label>
            <textarea
              id="observacoes"
              value={form.observacoes}
              onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
              disabled={loading}
              rows={4}
              className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
              placeholder="Anotações internas sobre operação fiscal, clientes piloto, etc."
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-600">
            {nfeEnabled ? (
              <span>Emissão habilitada: as autorizações dependem do fluxo configurado na Focus.</span>
            ) : (
              <span>Emissão desativada por padrão. Ative quando estiver pronto para iniciar os testes fiscais.</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !isDirty || !canAdmin}
            className="inline-flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NfeEmissaoSettings;

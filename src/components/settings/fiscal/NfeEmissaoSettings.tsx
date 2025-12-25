import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Lock, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

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
  const supabase = useSupabase();
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const flags = useFeatureFlags();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState<NfeConfigForm>(DEFAULT_FORM);
  const [form, setForm] = useState<NfeConfigForm>(DEFAULT_FORM);

  const isDirty = useMemo(() => JSON.stringify(initial) !== JSON.stringify(form), [initial, form]);
  const nfeEnabled = !!flags.nfe_emissao_enabled;

  useEffect(() => {
    const load = async () => {
      if (!activeEmpresa?.id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('fiscal_nfe_emissao_configs')
          .select('ambiente, webhook_secret_hint, observacoes')
          .eq('empresa_id', activeEmpresa.id)
          .eq('provider_slug', 'NFE_IO')
          .maybeSingle();

        if (error) throw error;

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
  }, [activeEmpresa?.id, addToast, supabase]);

  const handleSave = async () => {
    if (!activeEmpresa?.id) return;
    setSaving(true);
    try {
      const payload = {
        empresa_id: activeEmpresa.id,
        provider_slug: 'NFE_IO',
        ambiente: form.ambiente,
        webhook_secret_hint: form.webhook_secret_hint.trim() || null,
        observacoes: form.observacoes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('fiscal_nfe_emissao_configs')
        .upsert(payload, { onConflict: 'empresa_id,provider_slug' });

      if (error) throw error;

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
            Base interna para emissão de NF-e (modelo 55). A integração com a NFE.io ficará disponível quando você decidir ativar a emissão.
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provedor</label>
            <input
              value="NFE.io"
              disabled
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
            />
            <p className="mt-2 text-xs text-gray-500">
              A emissão ficará desativada até você concluir o roadmap e habilitar o recurso.
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
              Dica da chave de assinatura de webhook (opcional)
            </label>
            <input
              id="webhook_secret_hint"
              value={form.webhook_secret_hint}
              onChange={(e) => setForm((prev) => ({ ...prev, webhook_secret_hint: e.target.value }))}
              disabled={loading}
              placeholder="Ex.: WEBHOOK-V1 (não cole o segredo aqui)"
              className="w-full p-3 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              Segurança: o segredo (32–64 chars) será configurado quando ativarmos a emissão. Aqui salvamos apenas uma dica/identificador.
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
              <span>Emissão habilitada: integração e credenciais ainda serão configuradas.</span>
            ) : (
              <span>Emissão desativada por padrão. Quando for a hora, eu te aviso para assinar a NFE.io.</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !isDirty}
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


import React, { useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Loader2, Lock, RefreshCw, ToggleLeft } from 'lucide-react';

import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { Button } from '@/components/ui/button';
import { setFiscalNfeEmissaoEnabled } from '@/services/fiscalNfeSettings';

export default function FeatureFlagsPage() {
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const empresaRoleQuery = useEmpresaRole();
  const features = useEmpresaFeatures();

  const canAdmin = empresaRoleQuery.isFetched && roleAtLeast(empresaRoleQuery.data, 'admin');
  const empresaId = activeEmpresa?.id ?? null;

  const [saving, setSaving] = useState(false);
  const [localNfeEnabled, setLocalNfeEnabled] = useState<boolean | null>(null);

  const nfeEnabled = localNfeEnabled ?? features.nfe_emissao_enabled;

  const isDirty = useMemo(() => {
    if (localNfeEnabled === null) return false;
    return localNfeEnabled !== features.nfe_emissao_enabled;
  }, [features.nfe_emissao_enabled, localNfeEnabled]);

  const handleSave = async () => {
    if (!empresaId) return;
    if (!canAdmin) {
      addToast('Sem permissão para alterar flags. Apenas admin/owner.', 'error');
      return;
    }
    setSaving(true);
    try {
      await setFiscalNfeEmissaoEnabled(!!nfeEnabled);
      addToast('Feature flags salvas.', 'success');
      setLocalNfeEnabled(null);
      window.dispatchEvent(new Event('empresa-features-refresh'));
      await features.refetch();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar feature flags.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Feature Flags</h1>
          <p className="mt-2 text-gray-600">
            Chaves por empresa para ativar/desativar recursos (com trilha em auditoria).
          </p>
          {empresaId ? (
            <div className="mt-2 text-xs text-gray-500">
              Empresa ativa: <span className="font-medium">{activeEmpresa?.fantasia || activeEmpresa?.razao_social || empresaId}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => void features.refetch()}
            variant="outline"
            className="gap-2"
            disabled={features.loading || !empresaId}
          >
            {features.loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Recarregar
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || saving || !empresaId} className="gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <ToggleLeft size={16} />}
            Salvar
          </Button>
        </div>
      </div>

      {features.error ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5" />
            <div>
              <div className="font-semibold">Não foi possível carregar empresa_features</div>
              <div className="mt-1 text-xs">
                Enquanto isso, o sistema tende a bloquear módulos por segurança. Tente recarregar.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-800">NF-e (Emissão)</div>
            <div className="text-xs text-gray-500 mt-1">
              Controla se o módulo de emissão está disponível no app. Requer configuração em <b>Fiscal → NF-e</b>.
            </div>
          </div>

          <div className="flex items-center gap-3">
            {nfeEnabled ? (
              <span className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700">
                <BadgeCheck size={16} />
                Habilitado
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                <Lock size={16} />
                Desativado
              </span>
            )}

            <button
              type="button"
              onClick={() => setLocalNfeEnabled(!nfeEnabled)}
              disabled={saving || !empresaId || !canAdmin}
              className={[
                'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                nfeEnabled ? 'bg-blue-600' : 'bg-gray-300',
                (saving || !empresaId || !canAdmin) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
              aria-pressed={nfeEnabled}
              aria-label="Alternar emissão de NF-e"
              title={!canAdmin ? 'Apenas admin/owner pode alterar.' : 'Alternar'}
            >
              <span
                className={[
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  nfeEnabled ? 'translate-x-6' : 'translate-x-1',
                ].join(' ')}
              />
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-800">Observação</div>
          <div className="mt-1 text-xs text-gray-600">
            <ul className="list-disc ml-5 space-y-1">
              <li><b>revo_send_enabled</b> é calculado por assinatura/add-on (não é flag manual).</li>
              <li>Todas as mudanças em <b>empresa_feature_flags</b> ficam registradas na auditoria.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

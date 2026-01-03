import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthProvider';
import { useSubscription } from '../../../contexts/SubscriptionProvider';
import { Loader2, Sparkles, AlertTriangle, CheckCircle, RefreshCw, ServerOff, CreditCard, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '../../../contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Database } from '../../../types/database.types';
import { roleAtLeast, useEmpresaRole } from '@/hooks/useEmpresaRole';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';

type EmpresaAddon = Database['public']['Tables']['empresa_addons']['Row'];
type PlanoMvp = 'ambos' | 'servicos' | 'industria';

interface SubscriptionSettingsProps {
  onSwitchToPlans: () => void;
}

const SubscriptionSkeleton = () => (
  <div className="bg-white/80 rounded-2xl p-6 border border-gray-200 shadow-sm animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-1/3 mb-8"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
        <div className="h-8 bg-gray-300 rounded w-1/2 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
      </div>
      <div>
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
        <div className="h-8 bg-gray-300 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-full"></div>
      </div>
    </div>
    <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
      <div className="h-10 bg-gray-300 rounded-lg w-36"></div>
    </div>
  </div>
);

const EmptyState = ({ onRefresh }: { onRefresh: () => void }) => (
  <div className="text-center p-10 bg-white/80 rounded-2xl border border-gray-200 shadow-sm">
    <ServerOff className="mx-auto h-12 w-12 text-gray-400" />
    <h3 className="mt-4 text-lg font-medium text-gray-800">Nenhuma assinatura encontrada</h3>
    <p className="mt-1 text-sm text-gray-500">Não foi possível encontrar uma assinatura para esta empresa.</p>
    <button
      onClick={onRefresh}
      className="mt-6 inline-flex items-center gap-2 bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 transition-colors"
    >
      <RefreshCw size={16} />
      Tentar Novamente
    </button>
  </div>
);

const getStatusDetails = (status: string) => {
    switch (status) {
      case 'trialing': return { text: 'Em Teste', icon: Sparkles, color: 'blue' };
      case 'active': return { text: 'Ativo', icon: CheckCircle, color: 'green' };
      case 'past_due':
      case 'unpaid': return { text: 'Pagamento Pendente', icon: AlertTriangle, color: 'orange' };
      default: return { text: 'Cancelado', icon: AlertTriangle, color: 'red' };
    }
};

const badgeColors: { [key: string]: string } = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
};

const SubscriptionSettings: React.FC<SubscriptionSettingsProps> = ({ onSwitchToPlans }) => {
  const supabase = useSupabase();
  const { session, activeEmpresa } = useAuth();
  const { subscription, loadingSubscription, refetchSubscription } = useSubscription();
  const { addToast } = useToast();
  const empresaFeatures = useEmpresaFeatures();
  const empresaRoleQuery = useEmpresaRole();
  const canAdmin = empresaRoleQuery.isFetched && roleAtLeast(empresaRoleQuery.data, 'admin');
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [addons, setAddons] = useState<EmpresaAddon[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(true);
  const [loadingEntitlements, setLoadingEntitlements] = useState(true);
  const [savingEntitlements, setSavingEntitlements] = useState(false);
  const [planoMvp, setPlanoMvp] = useState<PlanoMvp>('ambos');
  const [maxUsers, setMaxUsers] = useState<number>(999);
  const [currentUsersCount, setCurrentUsersCount] = useState<number | null>(null);

  const fetchAddons = useCallback(async () => {
    if (!activeEmpresa?.id) return;
    setLoadingAddons(true);
    const { data, error } = await supabase
        .from('empresa_addons')
        .select('*')
        .eq('empresa_id', activeEmpresa.id);
    
    if (error) {
        addToast('Erro ao buscar add-ons.', 'error');
    } else {
        setAddons(data);
    }
    setLoadingAddons(false);
  }, [activeEmpresa, addToast, supabase]);

  const fetchEntitlements = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) return;
    setLoadingEntitlements(true);

    try {
      const { data, error } = await (supabase as any)
        .from('empresa_entitlements')
        .select('plano_mvp, max_users')
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) throw error;

      setPlanoMvp((data?.plano_mvp ?? 'ambos') as PlanoMvp);
      setMaxUsers(typeof data?.max_users === 'number' ? data.max_users : 999);
    } catch (error: any) {
      addToast('Não foi possível carregar o Plano MVP (usando padrão).', 'warning');
      setPlanoMvp('ambos');
      setMaxUsers(999);
    } finally {
      setLoadingEntitlements(false);
    }
  }, [activeEmpresa?.id, addToast, supabase]);

  const fetchCurrentUsersCount = useCallback(async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      setCurrentUsersCount(null);
      return;
    }

    try {
      const { count, error } = await (supabase as any)
        .from('empresa_usuarios')
        .select('user_id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId);

      if (error) throw error;
      setCurrentUsersCount(typeof count === 'number' ? count : null);
    } catch {
      setCurrentUsersCount(null);
    }
  }, [activeEmpresa?.id, supabase]);

  useEffect(() => {
    fetchAddons();
    fetchEntitlements();
    fetchCurrentUsersCount();
  }, [fetchAddons, fetchEntitlements, fetchCurrentUsersCount]);

  const handleManageBilling = async () => {
    if (!activeEmpresa) {
      addToast('Nenhuma empresa ativa selecionada.', 'error');
      return;
    }
    setIsPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-portal', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { empresa_id: activeEmpresa.id },
      });

      if (error) throw error;
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "URL do portal de faturamento não recebida.");
      }
    } catch (error: any) {
      addToast(error.message || "Erro ao acessar o portal de faturamento.", "error");
    } finally {
      setIsPortalLoading(false);
    }
  };

  const renderMainSubscription = () => {
    if (loadingSubscription) {
      return <SubscriptionSkeleton />;
    }
    if (!subscription) {
      return <EmptyState onRefresh={refetchSubscription} />;
    }

    const statusDetails = getStatusDetails(subscription.status);
    const now = new Date();
    const startDate = new Date(subscription.created_at || now);
    const endDate = subscription.current_period_end ? new Date(subscription.current_period_end) : now;
    const totalDuration = Math.max(1, endDate.getTime() - startDate.getTime());
    const elapsedDuration = Math.max(0, now.getTime() - startDate.getTime());
    const progress = Math.min(100, (elapsedDuration / totalDuration) * 100);
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return (
      <div className="bg-white/80 rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Plano Principal</p>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-xl font-bold text-gray-800 capitalize">
                  {subscription.plan?.name || subscription.plan_slug || 'N/A'}
                  <span className="text-base font-normal text-gray-600 ml-2">
                    ({subscription.billing_cycle === 'monthly' ? 'Mensal' : 'Anual'})
                  </span>
                </p>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${badgeColors[statusDetails.color]}`}>
                  {statusDetails.text}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Detalhes do Período</p>
              <p className="text-sm text-gray-700 mt-1">Início em: {startDate.toLocaleDateString('pt-BR')}</p>
              <p className="text-sm text-gray-700">{subscription.status === 'active' ? 'Próxima renovação:' : 'Termina em:'} {endDate.toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex justify-between items-baseline mb-2">
                <p className="text-sm text-gray-500">Tempo Restante</p>
                <p className="text-2xl font-bold text-gray-800">{daysRemaining} <span className="text-base font-normal text-gray-600">dias</span></p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <motion.div className="bg-blue-600 h-2.5 rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-right">{Math.floor(progress)}% do período utilizado</p>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <button onClick={handleManageBilling} disabled={isPortalLoading} className="w-full md:w-auto flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            {isPortalLoading ? <Loader2 className="animate-spin" size={20}/> : <CreditCard size={20} />}
            <span>Gerenciar Pagamento</span>
          </button>
          <button onClick={onSwitchToPlans} className="w-full md:w-auto bg-blue-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-700 transition-colors">
            Alterar Plano Principal
          </button>
        </div>
      </div>
    );
  };

  const renderAddons = () => {
    if (loadingAddons) {
        return <div className="h-24 bg-gray-200 rounded-2xl animate-pulse"></div>
    }
    return (
        <div className="bg-white/80 rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Add-ons Ativos</h2>
            {addons.length > 0 ? (
                <div className="space-y-4">
                    {addons.map(addon => {
                        const statusDetails = getStatusDetails(addon.status);
                        return (
                            <div key={addon.addon_slug} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <p className="font-semibold text-gray-800 capitalize">{addon.addon_slug.replace('_', ' ')}</p>
                                    <p className="text-sm text-gray-500">
                                        Renova em: {addon.current_period_end ? new Date(addon.current_period_end).toLocaleDateString('pt-BR') : 'N/A'}
                                    </p>
                                </div>
                                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${badgeColors[statusDetails.color]}`}>
                                    {statusDetails.text}
                                </span>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="text-center py-6">
                    <p className="text-gray-500">Nenhum add-on ativo para esta empresa.</p>
                    <a href="/revo-send" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-blue-600 font-semibold hover:underline">
                        <PlusCircle size={16} />
                        Conheça o REVO Send
                    </a>
                </div>
            )}
        </div>
    )
  }

  const handleSaveEntitlements = async () => {
    const empresaId = activeEmpresa?.id;
    if (!empresaId) {
      addToast('Nenhuma empresa ativa selecionada.', 'error');
      return;
    }
    if (!canAdmin) {
      addToast('Sem permissão para alterar Plano MVP/Limites. Apenas admin/owner.', 'error');
      return;
    }

    const nextMaxUsers = Number.isFinite(maxUsers) ? Math.max(1, Math.trunc(maxUsers)) : 999;

    setSavingEntitlements(true);
    try {
      const { error } = await (supabase as any)
        .from('empresa_entitlements')
        .upsert(
          {
            empresa_id: empresaId,
            plano_mvp: planoMvp,
            max_users: nextMaxUsers,
          },
          { onConflict: 'empresa_id' }
        );

      if (error) throw error;
      addToast('Plano MVP salvo com sucesso.', 'success');
      await fetchEntitlements();
      window.dispatchEvent(new Event('empresa-features-refresh'));
    } catch (error: any) {
      addToast(error?.message || 'Erro ao salvar Plano MVP.', 'error');
    } finally {
      setSavingEntitlements(false);
    }
  };

  const renderEntitlements = () => {
    const nextServicosEnabled = planoMvp === 'servicos' || planoMvp === 'ambos';
    const nextIndustriaEnabled = planoMvp === 'industria' || planoMvp === 'ambos';
    const normalizedMaxUsers = Number.isFinite(maxUsers) ? Math.max(1, Math.trunc(maxUsers)) : 999;
    const currentUsers = currentUsersCount ?? 0;
    const isOverLimit = currentUsersCount !== null && currentUsers > normalizedMaxUsers;
    const isAtLimit = currentUsersCount !== null && currentUsers >= normalizedMaxUsers;
    const isSyncedFromBilling = !!subscription;
    const canEditEntitlements = canAdmin && !isSyncedFromBilling;

    return (
      <div className="bg-white/80 rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Plano MVP e Limites</h2>
          <p className="text-sm text-gray-500 mt-1">
            Quando existe assinatura ativa/trial, estes valores são sincronizados automaticamente a partir do plano contratado (Stripe).
          </p>
          {isSyncedFromBilling ? (
            <p className="mt-2 text-xs text-slate-600">
              Para alterar, use <span className="font-semibold">Alterar Plano Principal</span> acima ou acesse{' '}
              <span className="font-semibold">Gerenciar Pagamento</span>.
            </p>
          ) : null}
          {!canAdmin && !isSyncedFromBilling && (
            <p className="mt-2 text-xs text-amber-700">
              Apenas <span className="font-semibold">admin/owner</span> podem alterar estas configurações.
            </p>
          )}
        </div>
        <button
          onClick={handleSaveEntitlements}
          disabled={savingEntitlements || loadingEntitlements || !canEditEntitlements}
          className="bg-blue-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {savingEntitlements ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Plano MVP</label>
          <select
            value={planoMvp}
            onChange={(e) => setPlanoMvp(e.target.value as PlanoMvp)}
            disabled={loadingEntitlements || !canEditEntitlements}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ambos">Ambos (sem bloqueios)</option>
            <option value="servicos">Serviços (Essencial)</option>
            <option value="industria">Indústria (Essencial)</option>
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Esta configuração afeta menus e rotas (guards) e serve como base para a política de planos/limites.
          </p>

          <div className="mt-4 rounded-lg border border-gray-200 bg-white/60 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Módulos habilitados (efeito do plano)</p>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${nextServicosEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Serviços {nextServicosEnabled ? 'ON' : 'OFF'}
              </span>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${nextIndustriaEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Indústria {nextIndustriaEnabled ? 'ON' : 'OFF'}
              </span>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${empresaFeatures.nfe_emissao_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                NF-e (emissão) {empresaFeatures.nfe_emissao_enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            {!!empresaFeatures.error && (
              <p className="mt-2 text-[11px] text-amber-700">
                Não foi possível validar o estado atual em <span className="font-semibold">empresa_features</span>. O sistema pode bloquear acesso até normalizar.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Limite de usuários</label>
          <input
            type="number"
            min={1}
            step={1}
            value={Number.isFinite(maxUsers) ? String(maxUsers) : ''}
            onChange={(e) => setMaxUsers(Number(e.target.value))}
            disabled={loadingEntitlements || !canEditEntitlements}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ex.: 3"
          />
          <p className="text-xs text-gray-500 mt-2">
            O banco bloqueia novos vínculos em <span className="font-semibold">empresa_usuarios</span> quando o limite é atingido.
          </p>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-white/60 px-3 py-2">
            <div className="text-xs text-gray-700">
              Usuários na empresa: <span className="font-semibold">{currentUsersCount === null ? '—' : currentUsers}</span>
            </div>
            <div className={`text-xs font-semibold ${isOverLimit ? 'text-red-700' : isAtLimit ? 'text-amber-700' : 'text-gray-600'}`}>
              {currentUsersCount === null ? 'Sem leitura' : `${currentUsers} / ${normalizedMaxUsers}`}
            </div>
          </div>
          {isOverLimit && (
            <p className="mt-2 text-xs text-red-700">
              A empresa está acima do limite configurado. Ajuste o limite ou remova vínculos em <span className="font-semibold">Usuários</span>.
            </p>
          )}
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Minha Assinatura</h1>
        <button
          onClick={() => { refetchSubscription(); fetchAddons(); }}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors px-3 py-1 rounded-md hover:bg-blue-50"
          aria-label="Atualizar dados da assinatura"
        >
          <RefreshCw size={16} />
          <span>Atualizar</span>
        </button>
      </div>
      {renderMainSubscription()}
      {renderAddons()}
      {renderEntitlements()}
    </div>
  );
};

export default SubscriptionSettings;

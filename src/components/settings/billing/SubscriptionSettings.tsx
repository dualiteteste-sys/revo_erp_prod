import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthProvider';
import { useSubscription } from '../../../contexts/SubscriptionProvider';
import { Loader2, Sparkles, AlertTriangle, CheckCircle, RefreshCw, ServerOff, CreditCard, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '../../../contexts/ToastProvider';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Database } from '../../../types/database.types';

type EmpresaAddon = Database['public']['Tables']['empresa_addons']['Row'];

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
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [addons, setAddons] = useState<EmpresaAddon[]>([]);
  const [loadingAddons, setLoadingAddons] = useState(true);

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

  useEffect(() => {
    fetchAddons();
  }, [fetchAddons]);

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
    </div>
  );
};

export default SubscriptionSettings;

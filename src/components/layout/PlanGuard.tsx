import React from 'react';
import GlassCard from '@/components/ui/GlassCard';
import { AlertTriangle } from 'lucide-react';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContextProvider';

type GuardFeature = 'industria' | 'servicos';

interface PlanGuardProps {
  feature: GuardFeature;
  children: React.ReactNode;
}

const featureLabel: Record<GuardFeature, string> = {
  industria: 'Indústria',
  servicos: 'Serviços',
};

export default function PlanGuard({ feature, children }: PlanGuardProps) {
  const { subscription } = useAppContext();
  const { loading, industria_enabled, servicos_enabled, error, isFallback, refetch } = useEmpresaFeatures();
  const isScale = String(subscription?.plan_slug ?? '').toUpperCase() === 'SCALE';

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent py-10">
        <div className="w-12 h-12 border-4 border-blue-500 border-dashed rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    // O plano SCALE deve ser "tudo liberado" e não deve degradar UX com aviso por falha transiente
    // de leitura de flags. Ainda assim, o enforcement real ocorre no banco.
    if (isFallback && isScale) {
      return <>{children}</>;
    }
    return (
      <div className="p-6 space-y-4">
        <GlassCard className="p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <h1 className="text-lg font-semibold text-slate-900">Não foi possível validar o plano/limites</h1>
                <p className="text-sm text-slate-600">
                  O sistema não conseguiu verificar se o módulo{' '}
                  <span className="font-semibold">{featureLabel[feature]}</span> está habilitado para esta empresa.
                  Isso pode acontecer por instabilidade ou permissões no banco.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void refetch()}>
                  Tentar novamente
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  const allowed = feature === 'industria' ? industria_enabled : servicos_enabled;
  if (allowed) return <>{children}</>;

  return (
    <div className="p-6">
      <GlassCard className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-semibold text-slate-900">
              Recurso indisponível no plano atual
            </h1>
            <p className="text-sm text-slate-600">
              O módulo <span className="font-semibold">{featureLabel[feature]}</span> não está habilitado para esta empresa.
              Para liberar, ajuste seu plano em <span className="font-semibold">Configurações → Minha Assinatura</span>.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

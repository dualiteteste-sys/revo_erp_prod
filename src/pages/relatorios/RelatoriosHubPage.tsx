import React from 'react';
import { BarChart2, Factory, TrendingUp, Truck, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';

type HubItem = {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
};

export default function RelatoriosHubPage() {
  const navigate = useNavigate();

  const items: HubItem[] = [
    {
      title: 'Relatórios de Serviços (OS)',
      description: 'KPIs, faturamento, recebido x a receber e detalhamento por cliente/status.',
      icon: Wrench,
      href: '/app/servicos/relatorios',
    },
    {
      title: 'Relatórios Financeiros',
      description: 'Resumo financeiro, indicadores e análises rápidas.',
      icon: TrendingUp,
      href: '/app/financeiro/relatorios',
    },
    {
      title: 'Relatórios de Suprimentos',
      description: 'Estoque, recebimentos e visão de abastecimento.',
      icon: Truck,
      href: '/app/suprimentos/relatorios',
    },
    {
      title: 'Dashboard de Produção (Indústria)',
      description: 'Visão do gerente de produção, status e trabalho em andamento.',
      icon: Factory,
      href: '/app/industria/dashboard',
    },
  ];

  return (
    <div className="p-1 space-y-6">
      <PageHeader
        title="Relatórios"
        description="Central de relatórios e dashboards do sistema."
        icon={<BarChart2 className="w-5 h-5" />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((item) => (
          <GlassCard key={item.href} className="p-6 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
                <item.icon size={20} />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-slate-900">{item.title}</div>
                <div className="text-sm text-slate-600">{item.description}</div>
              </div>
            </div>
            <Button type="button" onClick={() => navigate(item.href)} className="whitespace-nowrap">
              Abrir
            </Button>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}


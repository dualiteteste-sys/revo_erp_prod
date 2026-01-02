import React from 'react';
import { CalendarClock, FileText, HandCoins, Wrench } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

const ServicesSection: React.FC = () => {
  const items = [
    {
      icon: Wrench,
      title: 'OS do jeito certo',
      desc: 'Status e etapas claros, histórico, anexos e custos — sem perder o controle do atendimento.',
    },
    {
      icon: CalendarClock,
      title: 'Agenda e operação',
      desc: 'Organize a execução com visão de agenda e prazos, mantendo tudo rastreável.',
    },
    {
      icon: HandCoins,
      title: 'OS → Financeiro',
      desc: 'Gere cobranças/parcelas com auditoria e estornos seguros quando precisar.',
    },
    {
      icon: FileText,
      title: 'Relatórios que ajudam',
      desc: 'Resumo e indicadores por período/cliente/status — para decidir sem “achismo”.',
    },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white/70 backdrop-blur">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-blue-200/25 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-emerald-200/18 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/35 to-transparent" />
          </div>

          <div className="relative p-8 md:p-12">
            <div className="max-w-3xl">
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-slate-900">
                Serviços completos, sem burocracia.
              </h2>
              <p className="mt-3 text-slate-600 text-base md:text-lg leading-relaxed">
                Do atendimento ao recebimento — com fluxo simples, auditoria e relatórios que realmente ajudam.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <GlassCard key={item.title} className="p-5 rounded-2xl bg-glass-100 border border-slate-200">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                        <Icon size={18} className="text-blue-700" />
                      </div>
                      <div>
                        <div className="text-slate-900 font-semibold">{item.title}</div>
                        <div className="mt-1 text-sm text-slate-600 leading-relaxed">{item.desc}</div>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;


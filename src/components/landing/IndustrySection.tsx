import React from 'react';
import { motion } from 'framer-motion';
import { Factory, ListChecks, ShieldCheck, TabletSmartphone } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

const IndustrySection: React.FC = () => {
  const items = [
    {
      icon: Factory,
      title: 'PCP sem fricção',
      desc: 'Ficha Técnica (BOM), Roteiros e OP/OB com estados claros, travas e consistência no fluxo.',
    },
    {
      icon: TabletSmartphone,
      title: 'Chão de fábrica real',
      desc: 'Tela do operador para tablet e celular, apontamentos rápidos e rastreáveis — sem planilha paralela.',
    },
    {
      icon: ShieldCheck,
      title: 'Qualidade e rastreabilidade',
      desc: 'Planos, motivos, lotes e bloqueios com auditoria — confiança para crescer sem virar consultoria.',
    },
    {
      icon: ListChecks,
      title: 'Visão de controle',
      desc: 'WIP, filas, eficiência, estoque e qualidade em relatórios objetivos — o “tá no controle” de verdade.',
    },
  ];

  return (
    <motion.section
      className="pt-16 md:pt-24 pb-5"
      initial={{ opacity: 0, scale: 0.985 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 1 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white/70 backdrop-blur">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-blue-200/35 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-indigo-200/30 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
          </div>

          <div className="relative p-8 md:p-12">
            <div className="max-w-3xl">
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-slate-900">
                Indústria forte e controlada.
              </h2>
              <p className="mt-3 text-slate-600 text-base md:text-lg leading-relaxed">
                Você não precisa pagar mais caro por recursos robustos e avançados.
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
    </motion.section>
  );
};

export default IndustrySection;

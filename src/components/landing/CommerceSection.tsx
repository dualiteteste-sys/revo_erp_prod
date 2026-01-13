import React from 'react';
import { motion } from 'framer-motion';
import { Boxes, Receipt, ShoppingCart, Truck } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

const CommerceSection: React.FC = () => {
  const items = [
    {
      icon: ShoppingCart,
      title: 'Pedidos e PDV',
      desc: 'Fluxo simples e rápido, com estados claros e segurança contra “clique duplo”.',
    },
    {
      icon: Truck,
      title: 'Expedição e relatórios',
      desc: 'Acompanhe o ciclo do pedido com histórico e visão de execução para escalar sem bagunça.',
    },
    {
      icon: Boxes,
      title: 'Estoque integrado',
      desc: 'Compras, recebimentos e saldo confiável — sem planilhas paralelas e sem surpresas.',
    },
    {
      icon: Receipt,
      title: 'Financeiro forte',
      desc: 'A receber e a pagar com conciliação e extrato — vendendo rápido sem quebrar o caixa.',
    },
  ];

  return (
    <motion.section
      className="pt-0 pb-16 md:pb-24"
      initial={{ opacity: 0, scale: 0.985 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 1 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white/70 backdrop-blur">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-200/22 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-blue-200/25 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/35 to-transparent" />
          </div>

          <div className="relative p-8 md:p-12">
            <div className="max-w-3xl">
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-slate-900">
                Comércio simples, pronto para crescer.
              </h2>
              <p className="mt-3 text-slate-600 text-base md:text-lg leading-relaxed">
                Venda com velocidade e mantenha o financeiro forte — com estoque e expedição integrados.
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

export default CommerceSection;

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

const Hero: React.FC = () => {
  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  };

  const headline = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  };

  const word = {
    hidden: { opacity: 0, y: 18, filter: 'blur(10px)', textShadow: '0 0 0 rgba(37, 99, 235, 0)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      textShadow: '0 0 28px rgba(37, 99, 235, 0.18)',
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <section className="pt-28 pb-16 md:pt-32 md:pb-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <motion.div
            className="absolute -top-28 -left-28 h-80 w-80 rounded-full bg-blue-200/35 blur-3xl"
            initial={{ opacity: 0.5, scale: 0.95 }}
            animate={{ opacity: [0.35, 0.55, 0.35], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-200/35 blur-3xl"
            initial={{ opacity: 0.45, scale: 0.98 }}
            animate={{ opacity: [0.3, 0.5, 0.3], scale: [0.98, 1.08, 0.98] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="text-center lg:text-left">
            <motion.h1
              variants={headline}
              initial="hidden"
              animate="show"
              className="text-4xl md:text-6xl font-semibold tracking-tight text-slate-900"
            >
              <motion.span variants={word} className="inline-block mr-3">
                Um
              </motion.span>
              <motion.span variants={word} className="inline-block mr-3">
                ERP
              </motion.span>
              <motion.span variants={word} className="inline-block mr-3">
                <span className="bg-gradient-to-r from-blue-700 via-sky-500 to-indigo-600 bg-clip-text text-transparent">
                  Simples
                </span>
              </motion.span>
              <motion.span variants={word} className="inline-block mr-3">
                de
              </motion.span>
              <motion.span variants={word} className="inline-block mr-3">
                usar.
              </motion.span>
              <motion.span variants={word} className="inline-block mr-3">
                Mas
              </motion.span>
              <motion.span variants={word} className="inline-block mr-3">
                poderoso
              </motion.span>
              <motion.span variants={word} className="inline-block mr-3">
                no
              </motion.span>
              <motion.span variants={word} className="inline-block">
                CORE.
              </motion.span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-5 max-w-xl mx-auto lg:mx-0 text-base md:text-lg text-slate-600 leading-relaxed"
            >
              Comece a operar em 3 minutos. Cadastros, vendas, financeiro, serviços e indústria — primeiro uso guiado, UX moderna e
              upgrades por necessidade.
            </motion.p>
            <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-8 flex justify-center lg:justify-start gap-3 flex-wrap"
            >
              <button
                onClick={scrollToPricing}
                className="px-6 py-3 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors"
              >
                Começar teste grátis
              </button>
              <a
                href="#pricing"
                className="px-6 py-3 rounded-full bg-slate-100 text-slate-900 font-semibold hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200 transition-colors"
              >
                Ver planos
              </a>
            </motion.div>
            <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
              className="mt-8 flex justify-center lg:justify-start items-center gap-4 text-slate-500 flex-wrap"
            >
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-emerald-600" /> Sem cartão</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-emerald-600" /> Onboarding guiado</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-emerald-600" /> Cresce por módulos</span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <div className="absolute -inset-6 bg-gradient-to-tr from-slate-100 via-white to-slate-100 rounded-[36px] blur-2xl opacity-70" />
            <GlassCard className="relative rounded-[28px] overflow-hidden bg-glass-200">
              <div className="h-10 px-4 flex items-center gap-2 border-b border-slate-200 bg-white/60">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <div className="ml-3 h-6 flex-1 rounded-full bg-slate-100" />
              </div>
              <div className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <div className="h-3 w-24 bg-slate-200 rounded" />
                    <div className="mt-4 space-y-2">
                      <div className="h-2.5 w-full bg-slate-200/80 rounded" />
                      <div className="h-2.5 w-10/12 bg-slate-200/70 rounded" />
                      <div className="h-2.5 w-9/12 bg-slate-200/60 rounded" />
                      <div className="h-2.5 w-11/12 bg-slate-200/70 rounded" />
                    </div>
                  </div>
                  <div className="col-span-8 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="h-3 w-40 bg-slate-200 rounded" />
                        <div className="h-8 w-24 rounded-full bg-blue-600" />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="h-20 rounded-2xl bg-slate-50 border border-slate-200" />
                        <div className="h-20 rounded-2xl bg-slate-50 border border-slate-200" />
                        <div className="h-20 rounded-2xl bg-slate-50 border border-slate-200" />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="h-3 w-36 bg-slate-200 rounded" />
                      <div className="mt-4 space-y-3">
                        <div className="h-3 w-full bg-slate-200/70 rounded" />
                        <div className="h-3 w-11/12 bg-slate-200/60 rounded" />
                        <div className="h-3 w-10/12 bg-slate-200/50 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-500">
                  Prévia ilustrativa — o app real segue o mesmo padrão de clareza e controle.
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

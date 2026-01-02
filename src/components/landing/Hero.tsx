import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

const Hero: React.FC = () => {
  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  };

  const line = {
    hidden: {
      opacity: 0,
      y: 32,
      scale: 0.92,
      rotateX: 18,
      z: -140,
      filter: 'blur(18px)',
      textShadow: '0 0 0 rgba(37, 99, 235, 0)',
    },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      z: 0,
      filter: 'blur(0px)',
      textShadow: '0 0 42px rgba(37, 99, 235, 0.22)',
      transition: { type: 'spring', stiffness: 140, damping: 18, mass: 0.8 },
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
            <motion.h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-slate-900 [perspective:1000px]">
              <motion.div
                variants={line}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.05 }}
                className="inline-block [transform-style:preserve-3d]"
              >
                Um ERP{' '}
                <span className="bg-gradient-to-r from-blue-700 via-sky-500 to-indigo-600 bg-clip-text text-transparent">
                  Simples
                </span>{' '}
                de usar.
              </motion.div>
              <br />
              <motion.div
                variants={line}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.22 }}
                className="inline-block [transform-style:preserve-3d]"
              >
                Mas poderoso no CORE.
              </motion.div>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="mt-5 max-w-xl mx-auto lg:mx-0 text-base md:text-lg text-slate-600 leading-relaxed"
            >
              Comece a operar em 3 minutos. Cadastros, vendas, financeiro, serviços e indústria — primeiro uso guiado, UX moderna e
              upgrades por necessidade.
            </motion.p>
            <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
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
          transition={{ duration: 0.6, delay: 0.85 }}
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
              <div className="p-5 bg-gradient-to-br from-slate-50 via-white to-slate-50">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between">
                      <div className="h-4 w-20 bg-slate-200 rounded" />
                      <div className="h-4 w-10 bg-slate-200 rounded" />
                    </div>
                    <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
                      <div className="h-2.5 w-24 bg-slate-200 rounded" />
                      <div className="mt-3 h-8 w-full rounded-xl bg-blue-600" />
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" />
                        <div className="h-3 w-24 bg-slate-200 rounded" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" />
                        <div className="h-3 w-28 bg-slate-200 rounded" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" />
                        <div className="h-3 w-20 bg-slate-200 rounded" />
                      </div>
                      <div className="pt-2 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-slate-100 border border-slate-200" />
                          <div className="h-3 w-24 bg-slate-200 rounded" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-full h-7 bg-slate-100 border border-slate-200 flex items-center px-3 gap-2">
                      <div className="h-3 w-3 rounded-full bg-blue-600" />
                      <div className="h-2.5 w-24 bg-slate-200 rounded" />
                    </div>
                  </div>

                  <div className="col-span-8 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="h-3 w-36 bg-slate-200 rounded" />
                          <div className="mt-2 h-2.5 w-44 bg-slate-200/70 rounded" />
                        </div>
                        <div className="h-8 w-40 rounded-xl bg-blue-600" />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'faturamento', bg: 'bg-blue-100' },
                        { key: 'clientes', bg: 'bg-green-100' },
                        { key: 'pedidos', bg: 'bg-orange-100' },
                        { key: 'conversao', bg: 'bg-purple-100' },
                      ].map((item) => (
                        <div key={item.key} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
                          <div className="flex items-start justify-between">
                            <div className="h-2.5 w-24 bg-slate-200 rounded" />
                            <div className={`h-8 w-8 rounded-full ${item.bg} flex items-center justify-center`}>
                              <div className="h-3 w-3 rounded-sm bg-slate-400/80" />
                            </div>
                          </div>
                          <div className="mt-3 h-5 w-20 bg-slate-200 rounded" />
                          <div className="mt-2 h-2.5 w-12 bg-emerald-200 rounded" />
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-8 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                        <div className="h-3 w-40 bg-slate-200 rounded" />
                        <div className="mt-4 h-32 rounded-2xl bg-gradient-to-b from-blue-50 to-white border border-slate-200 relative overflow-hidden">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_60%)]" />
                          <div className="absolute left-3 right-3 top-8 h-1.5 rounded-full bg-blue-200/60" />
                          <div className="absolute left-6 right-10 top-14 h-1.5 rounded-full bg-blue-300/60" />
                          <div className="absolute left-10 right-6 top-20 h-1.5 rounded-full bg-blue-400/50" />
                        </div>
                      </div>
                      <div className="col-span-4 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                        <div className="h-3 w-32 bg-slate-200 rounded" />
                        <div className="mt-4 space-y-3">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-full bg-blue-100 border border-blue-200" />
                              <div className="flex-1">
                                <div className="h-2.5 w-10/12 bg-slate-200 rounded" />
                                <div className="mt-1 h-2 w-6/12 bg-slate-200/60 rounded" />
                              </div>
                              <div className="h-2 w-8 bg-slate-200/60 rounded" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-5 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                        <div className="h-3 w-28 bg-slate-200 rounded" />
                        <div className="mt-4 flex items-center justify-center">
                          <div className="h-28 w-28 rounded-full bg-white border-8 border-blue-500/70 shadow-inner relative">
                            <div className="absolute inset-0 rounded-full border-8 border-emerald-500/60 rotate-[-40deg]" />
                            <div className="absolute inset-0 rounded-full border-8 border-orange-500/50 rotate-[80deg]" />
                            <div className="absolute inset-0 rounded-full border-8 border-purple-500/40 rotate-[150deg]" />
                          </div>
                        </div>
                      </div>
                      <div className="col-span-7 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                        <div className="h-3 w-36 bg-slate-200 rounded" />
                        <div className="mt-4 space-y-3">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-xl bg-slate-100 border border-slate-200" />
                              <div className="flex-1">
                                <div className="h-2.5 w-24 bg-slate-200 rounded" />
                                <div className="mt-1 h-2 w-16 bg-slate-200/60 rounded" />
                              </div>
                              <div className="h-2.5 w-12 bg-slate-200/70 rounded" />
                            </div>
                          ))}
                        </div>
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

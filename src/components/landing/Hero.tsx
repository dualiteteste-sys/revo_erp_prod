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
      y: 48,
      scale: 0.86,
      rotateX: 22,
      z: -260,
      filter: 'blur(22px)',
      textShadow: '0 0 0 rgba(37, 99, 235, 0)',
    },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      z: 0,
      filter: 'blur(0px)',
      textShadow: '0 0 52px rgba(37, 99, 235, 0.26)',
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
                transition={{ delay: 0.05, duration: 2, ease: [0.16, 1, 0.3, 1] }}
                className="inline-block [transform-style:preserve-3d]"
              >
                O ERP para empresários{' '}
                <span className="bg-gradient-to-r from-blue-700 via-sky-500 to-indigo-600 bg-clip-text text-transparent">
                  Diferentes.
                </span>
              </motion.div>
              <br />
              <motion.div
                variants={line}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.32, duration: 2, ease: [0.16, 1, 0.3, 1] }}
                className="inline-block [transform-style:preserve-3d]"
              >
                E empresas{' '}
                <span className="bg-gradient-to-r from-indigo-700 via-sky-500 to-blue-700 bg-clip-text text-transparent">
                  DIFERENCIADAS.
                </span>
              </motion.div>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="mt-5 max-w-xl mx-auto lg:mx-0 text-base md:text-lg text-slate-700 leading-relaxed"
            >
              Comece a operar em 3 minutos. Cadastros, Vendas, Financeiro, Indústria Forte, Serviços completos e Comércio Simples —
              Primeiro uso guiado, UX moderna e upgrades por necessidade.
            </motion.p>
            <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
              className="mt-8 flex justify-center lg:justify-start gap-3 flex-wrap"
            >
              <button
                onClick={scrollToPricing}
                className="px-6 py-3 rounded-full bg-blue-700 text-white font-semibold hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-700 transition-colors"
              >
                Experimente nossa versão beta por 2 meses grátis.
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
              className="mt-8 flex justify-center lg:justify-start items-center gap-4 text-slate-600 flex-wrap"
            >
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-emerald-600" /> Primeiro uso rápido</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-emerald-600" /> Assistente guiado.</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-emerald-600" /> Cresce por demanda.</span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.0, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="absolute -inset-8 bg-gradient-to-tr from-blue-200/35 via-white to-indigo-200/35 rounded-[40px] blur-3xl opacity-80" />
            <GlassCard className="relative rounded-[28px] overflow-hidden bg-glass-200">
              <img
                src="/landing/hero-dashboard.png"
                alt="Prévia do dashboard do Ultria ERP"
                className="block w-full h-auto"
                loading="lazy"
              />
            </GlassCard>
            <div className="mt-3 text-xs text-slate-500 text-center lg:text-left">
              Prévia ilustrativa — o app real segue o mesmo padrão de clareza e controle.
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

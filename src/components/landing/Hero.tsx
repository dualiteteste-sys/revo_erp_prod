import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

const Hero: React.FC = () => {
  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="bg-gray-50 pt-32 pb-24 md:pt-40 md:pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl md:text-6xl font-extrabold text-gray-900 tracking-tight"
        >
          <span className="text-blue-600">Seu ERP completo, pronto para crescer com você.</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-3xl mx-auto text-lg md:text-xl text-gray-600"
        >
          Implante em minutos um ERP multiempresa e multi-usuário com API aberta e segurança de ponta.
        </motion.p>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-10 flex justify-center gap-4 flex-wrap"
        >
          <a
            href="#pricing"
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105"
          >
            Teste grátis por 30 dias
          </a>
          <button
            onClick={scrollToPricing}
            className="px-8 py-3 bg-white text-blue-600 font-semibold rounded-lg shadow-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-transform transform hover:scale-105"
          >
            Ver planos
          </button>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-8 flex justify-center items-center gap-4 text-gray-500"
        >
          <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-green-500" /> Multiempresa</span>
          <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-green-500" /> Multi-usuário</span>
          <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-green-500" /> API Aberta</span>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    question: 'Como funciona o período de teste grátis de 30 dias?',
    answer: 'Você pode usar todos os recursos do plano escolhido por 30 dias, sem compromisso. Nenhum cartão de crédito é necessário para iniciar. Ao final do período, você pode escolher assinar um plano para continuar usando o REVO ERP.',
  },
  {
    question: 'Posso cancelar minha assinatura a qualquer momento?',
    answer: 'Sim. Você pode cancelar sua assinatura a qualquer momento diretamente no painel de controle. Se cancelar durante o período de teste, não haverá nenhuma cobrança. Se cancelar um plano pago, você terá acesso até o final do período já faturado.',
  },
  {
    question: 'Como funciona o suporte técnico?',
    answer: 'Todos os planos incluem suporte via ticket e acesso à nossa central de ajuda. Planos superiores oferecem canais de suporte adicionais como chat, telefone e um gerente de contas dedicado para garantir que você tenha a melhor experiência possível.',
  },
  {
    question: 'Vocês ajudam na migração dos meus dados atuais?',
    answer: 'Sim! Oferecemos ferramentas de importação via planilhas para cadastros de clientes, fornecedores e produtos. Para operações mais complexas, nossos planos Max e Ultra incluem suporte para uma implementação guiada ou personalizada.',
  },
];

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-white py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-extrabold text-gray-900 mb-8">
          Perguntas Frequentes
        </h2>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex justify-between items-center p-6 text-left"
              >
                <span className="font-medium text-gray-900">{faq.question}</span>
                <ChevronDown
                  className={`transform transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 text-gray-600">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;

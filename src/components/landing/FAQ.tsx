import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    question: 'Como funciona o período de teste de 180 dias?',
    answer: 'Se trata de uma oportunidade única. Você pode usar todos os recursos do plano escolhido por 180 dias, sem compromisso. Por se tratar de uma versão beta, o sistema ainda pode conter erros, mas nosso suporte está pronto para resolvê-los em até 1 dia útil. Ao final do período, você pode escolher continuar com o plano ou continuar usando o REVO ERP. Para clientes que já possuem planos de outros sistemas com a REVO nosso compromisso é manter o mesmo valor que já vem sendo pago atualmente por 6 meses para qualquer plano escolhido.',
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
  {
    question: 'Já tenho um plano assinado com a Revo, como funciona nesse caso?',
    answer: 'Todas as nossas assinaturas anteriores foram fechadas com parâmetros específicos com base em nossos custos, além do suporte prioritário. Sendo assim, não haverá redução de valores, mas nos comprometemos a manter o mesmo valor pago atualmente pelo plano escolhido durante os próximos 6 meses.',
  },
  {
    question: 'Como funciona o suporte em tempo real?',
    answer: 'O suporte prioritário (em tempo real, via WhatsApp) pode ser contratado separadamente por R$98,00 / mês. Ao cancelar, você terá acesso ao suporte até o final do período já faturado.',
  },
];

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-white py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 mb-10">
          Perguntas Frequentes
        </h2>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-slate-200 rounded-2xl bg-white shadow-sm">
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex justify-between items-center p-6 text-left"
              >
                <span className="font-semibold text-slate-900">{faq.question}</span>
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
                    <div className="px-6 pb-6 text-slate-600 leading-relaxed">
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

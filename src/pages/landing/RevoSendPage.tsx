import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, Truck, Printer, Package, MapPin, Loader2 } from 'lucide-react';
import Header from '../../components/landing/Header';
import Footer from '../../components/landing/Footer';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '../../contexts/AuthProvider';
import { useToast } from '../../contexts/ToastProvider';
import { callRpc } from '@/lib/api';

type AddonPublic = {
  id: string;
  slug: string;
  name: string;
  billing_cycle: 'monthly' | 'yearly';
  currency: string;
  amount_cents: number;
  trial_days: number | null;
  active: boolean;
  created_at: string;
};

const RevoSendPage: React.FC = () => {
  const supabase = useSupabase();
  const navigate = useNavigate();
  const [addons, setAddons] = useState<AddonPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { session, activeEmpresa } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    const fetchAddons = async () => {
      setLoading(true);
      try {
        const data = await callRpc<AddonPublic[]>('addons_public_list_active_by_slug', { p_slug: 'REVO_SEND' });
        setAddons((data || []).filter((a) => a?.active));
      } catch (e: any) {
        addToast('Não foi possível carregar os planos do REVO Send.', 'error');
        setAddons([]);
      }
      setLoading(false);
    };
    fetchAddons();
  }, [addToast]);

  const handleCheckout = async (addon: AddonPublic) => {
    if (!session) {
      addToast("Você precisa estar logado para ativar um módulo.", "info");
      navigate('/auth/login');
      return;
    }
    if (!activeEmpresa) {
      addToast("Você precisa selecionar uma empresa ativa para ativar um módulo.", "info");
      // Idealmente, aqui abriríamos o seletor de empresa ou o modal de criação
      return;
    }

    setCheckoutLoading(addon.id);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          empresa_id: activeEmpresa.id,
          kind: 'addon',
          addon_slug: addon.slug,
          billing_cycle: addon.billing_cycle,
        },
      });

      if (error) throw error;
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "URL de checkout não recebida.");
      }
    } catch (error: any) {
      console.error("Erro ao criar sessão de checkout:", error);
      addToast(error.message || "Erro ao iniciar o checkout.", "error");
      setCheckoutLoading(null);
    }
  };

  const steps = [
    { title: 'Cálculo de Frete', description: 'Compare preços e prazos das melhores transportadoras em tempo real.', icon: Truck },
    { title: 'Impressão de Etiquetas', description: 'Gere e imprima etiquetas de envio padronizadas com um clique.', icon: Printer },
    { title: 'Coleta e Rastreamento', description: 'Agende coletas e acompanhe o status de cada entrega em um só lugar.', icon: Package },
    { title: 'Logística Reversa', description: 'Gerencie devoluções de forma simples e automatizada.', icon: MapPin },
  ];

  const faqs = [
    { question: 'O REVO Send funciona sem o REVO ERP?', answer: 'Não, o REVO Send é um módulo adicional e requer uma assinatura ativa do REVO ERP para funcionar, pois está totalmente integrado com a gestão de pedidos e estoque.' },
    { question: 'Quais transportadoras estão integradas?', answer: 'Atualmente, temos integração com Correios, Jadlog, Azul Cargo Express, e estamos constantemente adicionando novas transportadoras à plataforma.' },
    { question: 'Como funciona a cobrança?', answer: 'A cobrança do REVO Send é adicionada à sua fatura mensal do REVO ERP. Os valores dos fretes são pagos diretamente às transportadoras ou através da sua conta de integração.' },
  ];

  const monthlyPlan = addons.find(a => a.billing_cycle === 'monthly');

  return (
    <div className="bg-gray-50">
      <Header onLoginClick={() => navigate('/auth/login')} />

      {/* Hero Section */}
      <section className="pt-32 pb-24 text-center bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-6xl font-extrabold text-gray-900"
          >
            REVO Send: Automação de Entregas para seu E-commerce
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg md:text-xl text-gray-600"
          >
            Calcule fretes, imprima etiquetas em lote e gerencie suas entregas de forma inteligente. Tudo integrado ao seu REVO ERP.
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10"
          >
            <button
              onClick={() => monthlyPlan ? handleCheckout(monthlyPlan) : navigate('/auth/signup')}
              disabled={loading || !!checkoutLoading}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-transform transform hover:scale-105 disabled:opacity-50"
            >
              {checkoutLoading ? <Loader2 className="animate-spin"/> : 'Ativar Módulo no meu ERP'}
            </button>
          </motion.div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-12">Como Funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4">
                  <step.icon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-12">Planos e Preços</h2>
          <p className="text-center text-lg text-gray-600 -mt-8 mb-12">Um módulo adicional para potencializar seu REVO ERP.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {loading ? (
                Array.from({length: 2}).map((_, i) => <div key={i} className="rounded-2xl p-8 shadow-lg bg-gray-100 animate-pulse h-80"></div>)
            ) : (
                addons.map(addon => (
                    <div key={addon.id} className="rounded-2xl p-8 shadow-lg border bg-white">
                        <h3 className="text-xl font-semibold capitalize">{addon.billing_cycle === 'monthly' ? 'Mensal' : 'Anual'}</h3>
                        <p className="mt-2 text-sm text-gray-500">
                            {addon.billing_cycle === 'monthly' ? 'Ideal para começar' : 'Economize com o plano anual'}
                        </p>
                        <p className="mt-6 text-4xl font-bold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(addon.amount_cents / 100)}
                        </p>
                        <ul className="mt-6 space-y-3">
                            <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Envios Ilimitados</li>
                            <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Todas as funcionalidades</li>
                            {addon.trial_days && <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Teste grátis por {addon.trial_days} dias</li>}
                        </ul>
                        <button 
                            onClick={() => handleCheckout(addon)}
                            disabled={!!checkoutLoading}
                            className="w-full mt-8 py-3 rounded-lg font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                        >
                            {checkoutLoading === addon.id ? <Loader2 className="animate-spin mx-auto"/> : 'Ativar REVO Send'}
                        </button>
                    </div>
                ))
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-center text-3xl font-extrabold text-gray-900 mb-8">Dúvidas Frequentes</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-6 bg-white">
                <h3 className="font-medium text-gray-900">{faq.question}</h3>
                <p className="mt-2 text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default RevoSendPage;

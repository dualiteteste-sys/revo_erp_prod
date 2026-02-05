import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Sparkles, BrainCircuit, AreaChart, Check } from 'lucide-react';

import Header from '../../components/landing/Header';
import Footer from '../../components/landing/Footer';
import RevoFluxoLogo from '../../components/landing/RevoFluxoLogo';

const RevoFluxoPage: React.FC = () => {
    const navigate = useNavigate();

    const featureItems = [
        {
            icon: Sparkles,
            title: 'Conciliação Mágica',
            description: 'Conecte suas contas bancárias e deixe que nossa IA concilie suas transações automaticamente.',
        },
        {
            icon: BrainCircuit,
            title: 'Inteligência Artificial',
            description: 'Classifique suas receitas e despesas com sugestões inteligentes, aprendendo com seus hábitos.',
        },
        {
            icon: AreaChart,
            title: 'Visão 360°',
            description: 'Dashboards e relatórios completos para você tomar as melhores decisões.',
        },
    ];

    return (
        <div className="bg-white">
            <Header onLoginClick={() => navigate('/auth/login')} />
            <main>
                {/* Hero Section */}
                <section className="bg-gray-50 pt-32 pb-24 md:pt-40 md:pb-32">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="flex justify-center mb-6"
                        >
                            <RevoFluxoLogo className="h-12 w-auto text-gray-900" />
                        </motion.div>
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight"
                        >
                            Automatize seu contas a pagar e a receber com o <span className="text-blue-600">Ultria Fluxo.</span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="mt-6 max-w-3xl mx-auto text-lg md:text-xl text-gray-600"
                        >
                            Conecte seus bancos, classifique despesas e tenha uma visão clara do seu fluxo de caixa em tempo real.
                        </motion.p>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="mt-10 flex justify-center"
                        >
                            <a
                                href="/#pricing"
                                className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105"
                            >
                                Experimente o Ultria Fluxo
                            </a>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.5 }}
                            className="mt-8 flex justify-center items-center gap-4 text-gray-500 flex-wrap"
                        >
                            <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-green-500" /> Conciliação bancária</span>
                            <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-green-500" /> Classificação com IA</span>
                            <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-green-500" /> Relatórios inteligentes</span>
                        </motion.div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center">
                            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
                                Tudo que você precisa para uma gestão financeira eficiente
                            </h2>
                        </div>
                        <div className="mt-16 grid md:grid-cols-3 gap-8">
                            {featureItems.map((feature, index) => (
                                <motion.div
                                    key={feature.title}
                                    initial={{ opacity: 0, y: 40 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.5 }}
                                    transition={{ duration: 0.5, delay: index * 0.15 }}
                                    className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100"
                                >
                                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 text-blue-600 mb-6">
                                        <feature.icon size={28} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                                    <p className="mt-2 text-gray-600">{feature.description}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Pricing Section */}
                <section className="bg-gray-50 py-20 md:py-28">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center">
                            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
                                Um preço simples e justo.
                            </h2>
                        </div>
                        <div className="mt-16 flex justify-center">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true, amount: 0.5 }}
                                transition={{ duration: 0.6 }}
                                className="bg-white rounded-2xl shadow-xl border-2 border-blue-500 p-8 w-full max-w-sm"
                            >
                                <h3 className="text-2xl font-bold text-gray-900">Ultria Fluxo</h3>
                                <p className="mt-4">
                                    <span className="text-5xl font-extrabold text-gray-900">R$ 49</span>
                                    <span className="text-gray-500"> /mês</span>
                                </p>
                                <p className="mt-1 text-sm text-gray-500">Cobrado por empresa, por mês.</p>
                                <ul className="mt-8 space-y-4 text-gray-600">
                                    <li className="flex items-center"><Check className="h-6 w-6 text-green-500 mr-3" />Transações ilimitadas</li>
                                    <li className="flex items-center"><Check className="h-6 w-6 text-green-500 mr-3" />Contas bancárias ilimitadas</li>
                                    <li className="flex items-center"><Check className="h-6 w-6 text-green-500 mr-3" />Usuários ilimitados</li>
                                    <li className="flex items-center"><Check className="h-6 w-6 text-green-500 mr-3" />Suporte via chat</li>
                                </ul>
                                <a
                                    href="/#pricing"
                                    className="w-full mt-10 px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105 block"
                                >
                                    Ativar o Ultria Fluxo
                                </a>
                            </motion.div>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
};

export default RevoFluxoPage;

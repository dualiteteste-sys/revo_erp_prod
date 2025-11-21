import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Users, ShoppingCart, TrendingUp, Package, UserPlus, FileText, Clock } from 'lucide-react';
import KPICard from '../components/dashboard/KPICard';
import GraficoFaturamento from '../components/dashboard/GraficoFaturamento';
import AtividadesRecentes from '../components/dashboard/AtividadesRecentes';
import GraficoVendas from '../components/dashboard/GraficoVendas';
import RankingCategorias from '../components/dashboard/RankingCategorias';

const kpiData = [
  {
    title: "Faturamento do Mês",
    value: "R$ 123.456,78",
    trend: "+5.2%",
    isPositive: true,
    icon: DollarSign,
    iconBg: "from-blue-100 to-blue-200",
    iconColor: "text-blue-600",
  },
  {
    title: "Novos Clientes",
    value: "84",
    trend: "+12.5%",
    isPositive: true,
    icon: Users,
    iconBg: "from-green-100 to-green-200",
    iconColor: "text-green-600",
  },
  {
    title: "Pedidos Realizados",
    value: "321",
    trend: "-1.8%",
    isPositive: false,
    icon: ShoppingCart,
    iconBg: "from-orange-100 to-orange-200",
    iconColor: "text-orange-600",
  },
  {
    title: "Taxa de Conversão",
    value: "15.7%",
    trend: "+0.5%",
    isPositive: true,
    icon: TrendingUp,
    iconBg: "from-purple-100 to-purple-200",
    iconColor: "text-purple-600",
  },
];

const Dashboard: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
      {kpiData.map((kpi, index) => (
        <div key={index} className="lg:col-span-3 sm:col-span-6">
          <KPICard {...kpi} index={index} />
        </div>
      ))}

      <div className="lg:col-span-8">
        <GraficoFaturamento />
      </div>

      <div className="lg:col-span-4">
        <AtividadesRecentes />
      </div>
      
      <div className="lg:col-span-5">
        <GraficoVendas />
      </div>

      <div className="lg:col-span-7">
        <RankingCategorias />
      </div>
    </div>
  );
};

export default Dashboard;

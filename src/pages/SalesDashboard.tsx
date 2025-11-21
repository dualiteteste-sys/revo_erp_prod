import React from 'react';
import { DollarSign, BarChart, ShoppingCart, Users } from 'lucide-react';
import { faker } from '@faker-js/faker';
import KPICard from '../components/dashboard/KPICard';
import SalesLineChart from '../components/sales-dashboard/SalesLineChart';
import TopSellersChart from '../components/sales-dashboard/TopSellersChart';
import TopProductsChart from '../components/sales-dashboard/TopProductsChart';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
};
  
const kpiData = [
  {
    title: "Faturamento Total",
    value: formatCurrency(faker.number.float({ min: 100000, max: 500000 })),
    trend: `+${faker.number.float({ min: 1, max: 10, precision: 0.1 })}%`,
    isPositive: true,
    icon: DollarSign,
    iconBg: "from-blue-100 to-blue-200",
    iconColor: "text-blue-600",
  },
  {
    title: "Ticket Médio",
    value: formatCurrency(faker.number.float({ min: 150, max: 500 })),
    trend: `-${faker.number.float({ min: 0.1, max: 5, precision: 0.1 })}%`,
    isPositive: false,
    icon: BarChart,
    iconBg: "from-green-100 to-green-200",
    iconColor: "text-green-600",
  },
  {
    title: "Pedidos Faturados",
    value: faker.number.int({ min: 500, max: 2000 }).toString(),
    trend: `+${faker.number.int({ min: 10, max: 50 })}`,
    isPositive: true,
    icon: ShoppingCart,
    iconBg: "from-orange-100 to-orange-200",
    iconColor: "text-orange-600",
  },
  {
    title: "Clientes Ativos",
    value: faker.number.int({ min: 100, max: 800 }).toString(),
    trend: `+${faker.number.int({ min: 5, max: 20 })}`,
    isPositive: true,
    icon: Users,
    iconBg: "from-purple-100 to-purple-200",
    iconColor: "text-purple-600",
  },
];

const SalesDashboard: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
      {kpiData.map((kpi, index) => (
        <div key={index} className="lg:col-span-3 sm:col-span-6">
          <KPICard {...kpi} index={index} />
        </div>
      ))}

      <div className="lg:col-span-12">
        <SalesLineChart />
      </div>
      
      <div className="lg:col-span-7">
        <TopSellersChart />
      </div>

      <div className="lg:col-span-5">
        <TopProductsChart />
      </div>
    </div>
  );
};

export default SalesDashboard;

import {
  Home, Users, Warehouse, ShoppingCart, Wrench, DollarSign,
  Settings, LifeBuoy, FileText, UserPlus, Package, Building2,
  Users2, Plug, UserSquare, Box, BarChart2, FileDown, ClipboardList,
  FileSignature, HeartHandshake, Store, Receipt, Truck, Percent,
  Bot, Undo2, ClipboardCheck, Banknote, Wallet, TrendingUp,
  TrendingDown, Landmark, FileSpreadsheet, LogOut, Search, Building, Code, Database, Target,
  Briefcase, BookOpen, Grid, GraduationCap, PieChart, Factory, Hammer, Layers, FileCog, Route, PlayCircle, HardHat
} from 'lucide-react';

export interface MenuItem {
  name: string;
  icon: React.ElementType;
  href: string;
  children?: {
    name: string;
    icon: React.ElementType;
    href: string;
  }[];
}

export const menuConfig: { name: string; icon: React.ElementType; href: string; gradient: string; children?: { name: string; icon: React.ElementType; href: string; }[]; }[] = [
  {
    name: 'Dashboard',
    icon: Home,
    href: '/app/dashboard',
    gradient: 'from-blue-500 to-blue-600',
  },
  {
    name: 'Cadastros',
    icon: Users,
    href: '#',
    gradient: 'from-green-500 to-green-600',
    children: [
      { name: 'Clientes e Fornecedores', icon: Users2, href: '/app/partners' },
      { name: 'Produtos', icon: Package, href: '/app/products' },
      { name: 'Transportadoras', icon: Truck, href: '/app/carriers' },
      { name: 'Serviços', icon: Wrench, href: '/app/services' },
      { name: 'Vendedores', icon: UserSquare, href: '#' },
      { name: 'Embalagens', icon: Box, href: '#' },
      { name: 'Relatórios', icon: BarChart2, href: '#' },
    ],
  },
  {
    name: 'Indústria',
    icon: Factory,
    href: '#',
    gradient: 'from-zinc-500 to-neutral-600',
    children: [
        { name: 'Dashboard Produção', icon: PieChart, href: '/app/industria/dashboard' },
        { name: 'Ordens de Produção', icon: Hammer, href: '/app/industria/producao' },
        { name: 'Ordens de Beneficiamento', icon: Layers, href: '/app/industria/beneficiamento' },
        { name: 'Execução (Operações)', icon: PlayCircle, href: '/app/industria/execucao' },
        { name: 'Chão de Fábrica', icon: HardHat, href: '/app/industria/chao-de-fabrica' },
        { name: 'Roteiros', icon: Route, href: '/app/industria/roteiros' },
        { name: 'Fichas Técnicas / BOM', icon: FileCog, href: '/app/industria/boms' },
        { name: 'Centros de Trabalho', icon: Settings, href: '/app/industria/centros-trabalho' },
    ]
  },
  {
    name: 'Suprimentos',
    icon: Warehouse,
    href: '#',
    gradient: 'from-orange-500 to-orange-600',
    children: [
      { name: 'Controle de Estoques', icon: Warehouse, href: '/app/suprimentos/estoque' },
      { name: 'Ordens de Compra', icon: ShoppingCart, href: '/app/suprimentos/compras' },
      { name: 'NFe de Entrada', icon: FileDown, href: '/app/nfe-input' },
      { name: 'Relatórios', icon: BarChart2, href: '#' },
    ]
  },
  {
    name: 'Vendas',
    icon: ShoppingCart,
    href: '#',
    gradient: 'from-red-500 to-red-600',
    children: [
        { name: 'Painel de Vendas', icon: BarChart2, href: '/app/sales-dashboard' },
        { name: 'Pedidos de Vendas', icon: ClipboardList, href: '/app/vendas/pedidos' },
        { name: 'Metas de Vendas', icon: Target, href: '/app/vendas/metas' },
        { name: 'Propostas Comerciais', icon: FileSignature, href: '#' },
        { name: 'CRM', icon: HeartHandshake, href: '#' },
        { name: 'PDV', icon: Store, href: '#' },
        { name: 'Notas Fiscais', icon: Receipt, href: '#' },
        { name: 'Expedição', icon: Truck, href: '#' },
        { name: 'Comissões', icon: Percent, href: '#' },
        { name: 'Painel de Automações', icon: Bot, href: '#' },
        { name: 'Devolução de Venda', icon: Undo2, href: '#' },
        { name: 'Relatórios', icon: BarChart2, href: '#' },
    ]
  },
  {
    name: 'Serviços',
    icon: Wrench,
    href: '#',
    gradient: 'from-amber-500 to-amber-600',
    children: [
        { name: 'Ordens de Serviço', icon: ClipboardCheck, href: '/app/ordens-de-servico' },
        { name: 'Contratos', icon: FileText, href: '#' },
        { name: 'Notas de Serviço', icon: Receipt, href: '#' },
        { name: 'Cobranças', icon: Banknote, href: '#' },
        { name: 'Relatórios', icon: BarChart2, href: '#' },
    ]
  },
  {
    name: 'Financeiro',
    icon: DollarSign,
    href: '#',
    gradient: 'from-emerald-500 to-emerald-600',
    children: [
        { name: 'Tesouraria', icon: Wallet, href: '/app/financeiro/tesouraria' },
        { name: 'Contas a Receber', icon: TrendingUp, href: '/app/financeiro/contas-a-receber' },
        { name: 'Contas a Pagar', icon: TrendingDown, href: '/app/financeiro/contas-a-pagar' },
        { name: 'Centro de Custos', icon: Landmark, href: '/app/financeiro/centros-de-custo' },
        { name: 'Cobranças Bancárias', icon: Banknote, href: '/app/financeiro/cobrancas' },
        { name: 'Extrato Bancário', icon: FileSpreadsheet, href: '/app/financeiro/extrato' },
        { name: 'Relatórios', icon: BarChart2, href: '#' },
    ]
  },
  {
    name: 'RH & Qualidade',
    icon: Briefcase,
    href: '#',
    gradient: 'from-pink-500 to-rose-600',
    children: [
      { name: 'Dashboard RH', icon: PieChart, href: '/app/rh/dashboard' },
      { name: 'Colaboradores', icon: Users, href: '/app/rh/colaboradores' },
      { name: 'Cargos e Funções', icon: Briefcase, href: '/app/rh/cargos' },
      { name: 'Competências', icon: BookOpen, href: '/app/rh/competencias' },
      { name: 'Matriz de Competências', icon: Grid, href: '/app/rh/matriz' },
      { name: 'Treinamentos', icon: GraduationCap, href: '/app/rh/treinamentos' },
    ],
  },
  {
    name: 'Ferramentas',
    icon: Wrench,
    href: '#',
    gradient: 'from-cyan-500 to-cyan-600',
    children: [
      { name: 'Consulta CEP', icon: Search, href: '/app/cep-search' },
      { name: 'Consulta CNPJ', icon: Building, href: '/app/cnpj-search' },
    ],
  },
  {
    name: 'Desenvolvedor',
    icon: Code,
    href: '#',
    gradient: 'from-purple-500 to-purple-600',
    children: [
      { name: 'Logs', icon: FileText, href: '/app/desenvolvedor/logs' },
      { name: 'Supabase Demo', icon: Database, href: '/app/desenvolvedor/supabase-demo' },
    ],
  },
  {
    name: 'Configurações',
    icon: Settings,
    href: '#',
    gradient: 'from-gray-500 to-gray-600',
  },
  {
    name: 'Suporte',
    icon: LifeBuoy,
    href: '#',
    gradient: 'from-indigo-500 to-indigo-600',
  },
  {
    name: 'Sair',
    icon: LogOut,
    href: '#',
    gradient: 'from-slate-500 to-slate-600',
  },
];

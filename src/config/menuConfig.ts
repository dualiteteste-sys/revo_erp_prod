import {
  Home, Users, Warehouse, ShoppingCart, Wrench, DollarSign,
  Settings, LifeBuoy, FileText, UserPlus, Package, Building2,
  Users2, Plug, UserSquare, Box, BarChart2, FileDown, ClipboardList,
  FileSignature, HeartHandshake, Store, Receipt, Truck, Percent,
  Bot, Undo2, ClipboardCheck, Banknote, Wallet, TrendingUp,
  TrendingDown, Landmark, FileSpreadsheet, LogOut, Search, Building, Code, Database, Target,
  Briefcase, BookOpen, Grid, GraduationCap, PieChart, Factory, Hammer, Layers, FileCog, Route, PlayCircle, HardHat, FileCode, MonitorUp,
  PackageCheck, FileUp, FolderTree, Ruler, BarChart3, Shield, ShieldCheck, ShieldAlert, Activity
} from 'lucide-react';

export interface MenuItem {
  name: string;
  icon: React.ElementType;
  href: string;
  gradient?: string;
  permission?: { domain: string; action: string };
  children?: {
    name: string;
    icon: React.ElementType;
    href: string;
    permission?: { domain: string; action: string };
  }[];
}

export const menuConfig: MenuItem[] = [
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
      { name: 'Clientes e Fornecedores', icon: Users2, href: '/app/partners', permission: { domain: 'partners', action: 'view' } },
      { name: 'Produtos', icon: Package, href: '/app/products', permission: { domain: 'produtos', action: 'view' } },
      { name: 'Grupos de Produtos', icon: FolderTree, href: '/app/cadastros/grupos-produtos', permission: { domain: 'produtos', action: 'view' } },
      { name: 'Unidades de Medida', icon: Ruler, href: '/app/cadastros/unidades-medida', permission: { domain: 'produtos', action: 'view' } },
      { name: 'Transportadoras', icon: Truck, href: '/app/carriers', permission: { domain: 'logistica', action: 'view' } },
      { name: 'Serviços', icon: Wrench, href: '/app/services', permission: { domain: 'servicos', action: 'view' } },
      { name: 'Vendedores', icon: UserSquare, href: '/app/cadastros/vendedores', permission: { domain: 'vendedores', action: 'view' } },
      { name: 'Embalagens', icon: Box, href: '/app/cadastros/embalagens', permission: { domain: 'produtos', action: 'view' } },
      { name: 'Meios de Pagamento', icon: Banknote, href: '/app/cadastros/meios-pagamento', permission: { domain: 'contas_a_pagar', action: 'view' } },
      { name: 'Relatórios', icon: BarChart2, href: '/app/relatorios' },
    ],
  },
  {
    name: 'Indústria',
    icon: Factory,
    href: '#',
    gradient: 'from-zinc-500 to-neutral-600',
    children: [
      { name: 'Dashboard Produção', icon: PieChart, href: '/app/industria/dashboard', permission: { domain: 'industria', action: 'view' } },
      { name: 'Status de Beneficiamentos', icon: ClipboardList, href: '/app/industria/status-beneficiamentos', permission: { domain: 'industria', action: 'view' } },
      { name: 'Materiais de Clientes', icon: Package, href: '/app/industria/materiais-cliente', permission: { domain: 'industria', action: 'view' } },
      { name: 'Centros de Trabalho', icon: Settings, href: '/app/industria/centros-trabalho', permission: { domain: 'industria', action: 'view' } },
      { name: 'Fichas Técnicas / BOM', icon: FileCog, href: '/app/industria/boms', permission: { domain: 'industria', action: 'view' } },
      { name: 'Roteiros', icon: Route, href: '/app/industria/roteiros', permission: { domain: 'industria', action: 'view' } },
      { name: 'OP / OB', icon: Hammer, href: '/app/industria/ordens', permission: { domain: 'industria', action: 'view' } },
      { name: 'Execução (Operações)', icon: PlayCircle, href: '/app/industria/execucao', permission: { domain: 'industria', action: 'view' } },
      { name: 'Operadores', icon: ShieldCheck, href: '/app/industria/operadores', permission: { domain: 'industria', action: 'view' } },
      { name: 'Tela do Operador', icon: MonitorUp, href: '/app/industria/operador', permission: { domain: 'industria', action: 'view' } },
      { name: 'Chão de Fábrica', icon: HardHat, href: '/app/industria/chao-de-fabrica', permission: { domain: 'industria', action: 'view' } },
      { name: 'PCP e Capacidade', icon: BarChart3, href: '/app/industria/pcp', permission: { domain: 'mrp', action: 'view' } },
      { name: 'Relatórios', icon: BarChart2, href: '/app/industria/relatorios', permission: { domain: 'industria', action: 'view' } },
      { name: 'Planejamento (MRP)', icon: BarChart2, href: '/app/industria/mrp', permission: { domain: 'mrp', action: 'view' } },
      { name: 'Motivos da Qualidade', icon: ClipboardCheck, href: '/app/industria/qualidade/motivos', permission: { domain: 'qualidade', action: 'view' } },
      { name: 'Planos de Inspeção', icon: ClipboardList, href: '/app/industria/qualidade/planos', permission: { domain: 'qualidade', action: 'view' } },
      { name: 'Automação', icon: Bot, href: '/app/industria/automacao', permission: { domain: 'industria', action: 'view' } },
      { name: 'Lotes e Bloqueio', icon: Shield, href: '/app/industria/qualidade/lotes', permission: { domain: 'qualidade', action: 'view' } },
    ]
  },
  {
    name: 'Suprimentos',
    icon: Warehouse,
    href: '#',
    gradient: 'from-orange-500 to-orange-600',
    children: [
      { name: 'Controle de Estoques', icon: Warehouse, href: '/app/suprimentos/estoque', permission: { domain: 'suprimentos', action: 'view' } },
      { name: 'Ordens de Compra', icon: ShoppingCart, href: '/app/suprimentos/compras', permission: { domain: 'suprimentos', action: 'view' } },
      { name: 'Recebimentos', icon: PackageCheck, href: '/app/suprimentos/recebimentos', permission: { domain: 'suprimentos', action: 'view' } },
      { name: 'Relatórios', icon: BarChart2, href: '/app/suprimentos/relatorios', permission: { domain: 'suprimentos', action: 'view' } },
    ]
  },
  {
    name: 'Vendas',
    icon: ShoppingCart,
    href: '#',
    gradient: 'from-red-500 to-red-600',
    children: [
      { name: 'Painel de Vendas', icon: BarChart2, href: '/app/sales-dashboard', permission: { domain: 'vendas', action: 'view' } },
      { name: 'CRM', icon: HeartHandshake, href: '/app/vendas/crm', permission: { domain: 'crm', action: 'view' } },
      { name: 'Pedidos de Vendas', icon: ClipboardList, href: '/app/vendas/pedidos', permission: { domain: 'vendas', action: 'view' } },
      { name: 'Metas de Vendas', icon: Target, href: '/app/vendas/metas', permission: { domain: 'vendas', action: 'view' } },
      { name: 'Propostas Comerciais', icon: FileSignature, href: '/app/vendas/propostas' },
      { name: 'PDV', icon: Store, href: '/app/vendas/pdv' },
      { name: 'Expedição', icon: Truck, href: '/app/vendas/expedicao' },
      { name: 'Comissões', icon: Percent, href: '/app/vendas/comissoes' },
      { name: 'Painel de Automações', icon: Bot, href: '/app/vendas/automacoes' },
      { name: 'Devolução de Venda', icon: Undo2, href: '/app/vendas/devolucoes' },
      { name: 'Relatórios', icon: BarChart2, href: '/app/vendas/relatorios' },
    ]
  },
  {
    name: 'Fiscal',
    icon: Receipt,
    href: '#',
    gradient: 'from-sky-500 to-sky-600',
    children: [
      { name: 'NF-e (Rascunhos)', icon: Receipt, href: '/app/fiscal/nfe' },
      { name: 'Configurações NF-e', icon: Settings, href: '/app/fiscal/nfe/configuracoes' },
    ],
  },
  {
    name: 'Serviços',
    icon: Wrench,
    href: '#',
    gradient: 'from-amber-500 to-amber-600',
    children: [
      { name: 'Ordens de Serviço', icon: ClipboardCheck, href: '/app/ordens-de-servico', permission: { domain: 'os', action: 'view' } },
      { name: 'Contratos', icon: FileText, href: '/app/servicos/contratos', permission: { domain: 'servicos', action: 'view' } },
      { name: 'Notas de Serviço', icon: Receipt, href: '/app/servicos/notas', permission: { domain: 'servicos', action: 'view' } },
      { name: 'Cobranças', icon: Banknote, href: '/app/servicos/cobrancas', permission: { domain: 'servicos', action: 'view' } },
      { name: 'Relatórios', icon: BarChart2, href: '/app/servicos/relatorios', permission: { domain: 'relatorios_servicos', action: 'view' } },
    ]
  },
  {
    name: 'Financeiro',
    icon: DollarSign,
    href: '#',
    gradient: 'from-emerald-500 to-emerald-600',
    children: [
      { name: 'Tesouraria', icon: Wallet, href: '/app/financeiro/tesouraria', permission: { domain: 'tesouraria', action: 'view' } },
      { name: 'Contas a Receber', icon: TrendingUp, href: '/app/financeiro/contas-a-receber', permission: { domain: 'contas_a_receber', action: 'view' } },
      { name: 'Contas a Pagar', icon: TrendingDown, href: '/app/financeiro/contas-a-pagar', permission: { domain: 'contas_a_pagar', action: 'view' } },
      { name: 'Centro de Custos', icon: Landmark, href: '/app/financeiro/centros-de-custo', permission: { domain: 'centros_de_custo', action: 'view' } },
      { name: 'Cobranças Bancárias', icon: Banknote, href: '/app/financeiro/cobrancas' },
      { name: 'Extrato Bancário', icon: FileSpreadsheet, href: '/app/financeiro/extrato', permission: { domain: 'tesouraria', action: 'view' } },
      { name: 'Relatórios', icon: BarChart2, href: '/app/financeiro/relatorios', permission: { domain: 'relatorios_financeiro', action: 'view' } },
    ]
  },
  {
    name: 'RH & Qualidade',
    icon: Briefcase,
    href: '#',
    gradient: 'from-pink-500 to-rose-600',
    children: [
      { name: 'Dashboard RH', icon: PieChart, href: '/app/rh/dashboard', permission: { domain: 'rh', action: 'view' } },
      { name: 'Colaboradores', icon: Users, href: '/app/rh/colaboradores', permission: { domain: 'rh', action: 'view' } },
      { name: 'Cargos e Funções', icon: Briefcase, href: '/app/rh/cargos', permission: { domain: 'rh', action: 'view' } },
      { name: 'Competências', icon: BookOpen, href: '/app/rh/competencias', permission: { domain: 'rh', action: 'view' } },
      { name: 'Matriz de Competências', icon: Grid, href: '/app/rh/matriz', permission: { domain: 'rh', action: 'view' } },
      { name: 'Treinamentos', icon: GraduationCap, href: '/app/rh/treinamentos', permission: { domain: 'rh', action: 'view' } },
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
      { name: 'Importar XML', icon: FileUp, href: '/app/nfe-input' },
      { name: 'Testador XML', icon: FileCode, href: '/app/tools/xml-tester' },
    ],
  },
  {
    name: 'Desenvolvedor',
    icon: Code,
    href: '#',
    gradient: 'from-purple-500 to-purple-600',
    children: [
      { name: 'Saúde', icon: Activity, href: '/app/desenvolvedor/saude', permission: { domain: 'ops', action: 'view' } },
      { name: 'Diagnóstico', icon: FileCode, href: '/app/desenvolvedor/diagnostico', permission: { domain: 'ops', action: 'view' } },
      { name: '403 (Empresa ativa)', icon: ShieldAlert, href: '/app/desenvolvedor/403', permission: { domain: 'ops', action: 'view' } },
      { name: 'Inventário RLS', icon: Database, href: '/app/desenvolvedor/rls', permission: { domain: 'ops', action: 'view' } },
      { name: 'Logs', icon: FileText, href: '/app/desenvolvedor/logs', permission: { domain: 'logs', action: 'view' } },
      { name: 'Supabase Demo', icon: Database, href: '/app/desenvolvedor/supabase-demo' },
    ],
  },
  {
    name: 'Configurações',
    icon: Settings,
    href: '/app/configuracoes',
    gradient: 'from-gray-500 to-gray-600',
  },
  {
    name: 'Suporte',
    icon: LifeBuoy,
    href: '/app/suporte',
    gradient: 'from-indigo-500 to-indigo-600',
  },
  {
    name: 'Sair',
    icon: LogOut,
    href: '#',
    gradient: 'from-slate-500 to-slate-600',
  },
];

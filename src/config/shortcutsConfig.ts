import {
    ShoppingCart, Users, Package, Wallet, ClipboardCheck, Hammer, FileText,
    Receipt, Truck, Target, HeartHandshake, Banknote,
    Factory, Wrench, UserSquare, Box
} from 'lucide-react';

export type ShortcutAction = {
    id: string;
    label: string;
    icon: React.ElementType;
    href: string;
    gradient: string;
    shadow: string;
    /** Feature required: 'industria' | 'servicos' | null (always available) */
    requiredFeature: 'industria' | 'servicos' | null;
};

/**
 * Master catalog of all quick actions available in the system.
 * Each action is tagged with the required feature flag.
 */
export const ALL_SHORTCUTS: ShortcutAction[] = [
    // ============ COMMON (All Plans) ============
    {
        id: 'nova-venda',
        label: 'Nova Venda',
        icon: ShoppingCart,
        href: '/app/vendas/pedidos/novo',
        gradient: 'from-blue-500 to-indigo-600',
        shadow: 'shadow-blue-200',
        requiredFeature: null,
    },
    {
        id: 'novo-cliente',
        label: 'Novo Cliente',
        icon: Users,
        href: '/app/partners?action=new&tipo=cliente',
        gradient: 'from-emerald-500 to-teal-600',
        shadow: 'shadow-emerald-200',
        requiredFeature: null,
    },
    {
        id: 'novo-fornecedor',
        label: 'Novo Fornecedor',
        icon: Truck,
        href: '/app/partners?action=new&tipo=fornecedor',
        gradient: 'from-orange-500 to-amber-600',
        shadow: 'shadow-orange-200',
        requiredFeature: null,
    },
    {
        id: 'novo-produto',
        label: 'Novo Produto',
        icon: Package,
        href: '/app/products?action=new',
        gradient: 'from-violet-500 to-purple-600',
        shadow: 'shadow-violet-200',
        requiredFeature: null,
    },
    {
        id: 'novo-vendedor',
        label: 'Novo Vendedor',
        icon: UserSquare,
        href: '/app/cadastros/vendedores?action=new',
        gradient: 'from-pink-500 to-rose-600',
        shadow: 'shadow-pink-200',
        requiredFeature: null,
    },
    {
        id: 'novo-pagamento',
        label: 'Novo Pagamento',
        icon: Wallet,
        href: '/app/financeiro/contas-a-pagar?action=new',
        gradient: 'from-rose-500 to-pink-600',
        shadow: 'shadow-rose-200',
        requiredFeature: null,
    },
    {
        id: 'novo-recebimento',
        label: 'Novo Recebimento',
        icon: Banknote,
        href: '/app/financeiro/contas-a-receber?action=new',
        gradient: 'from-green-500 to-emerald-600',
        shadow: 'shadow-green-200',
        requiredFeature: null,
    },
    {
        id: 'nova-meta',
        label: 'Nova Meta',
        icon: Target,
        href: '/app/vendas/metas?action=new',
        gradient: 'from-amber-500 to-orange-600',
        shadow: 'shadow-amber-200',
        requiredFeature: null,
    },
    {
        id: 'nova-proposta',
        label: 'Nova Proposta',
        icon: FileText,
        href: '/app/vendas/propostas?action=new',
        gradient: 'from-cyan-500 to-blue-600',
        shadow: 'shadow-cyan-200',
        requiredFeature: null,
    },
    {
        id: 'novo-crm',
        label: 'Novo Lead CRM',
        icon: HeartHandshake,
        href: '/app/vendas/crm?action=new',
        gradient: 'from-fuchsia-500 to-pink-600',
        shadow: 'shadow-fuchsia-200',
        requiredFeature: null,
    },
    {
        id: 'abrir-pdv',
        label: 'PDV',
        icon: Receipt,
        href: '/app/vendas/pdv',
        gradient: 'from-slate-600 to-zinc-700',
        shadow: 'shadow-slate-300',
        requiredFeature: null,
    },

    // ============ SERVIÇOS ============
    {
        id: 'nova-os',
        label: 'Nova OS',
        icon: ClipboardCheck,
        href: '/app/ordens-de-servico?action=new',
        gradient: 'from-amber-500 to-yellow-600',
        shadow: 'shadow-amber-200',
        requiredFeature: 'servicos',
    },
    {
        id: 'novo-contrato',
        label: 'Novo Contrato',
        icon: FileText,
        href: '/app/servicos/contratos?action=new',
        gradient: 'from-teal-500 to-cyan-600',
        shadow: 'shadow-teal-200',
        requiredFeature: 'servicos',
    },
    {
        id: 'novo-servico',
        label: 'Novo Serviço',
        icon: Wrench,
        href: '/app/services?action=new',
        gradient: 'from-indigo-500 to-violet-600',
        shadow: 'shadow-indigo-200',
        requiredFeature: 'servicos',
    },

    // ============ INDÚSTRIA ============
    {
        id: 'nova-op',
        label: 'Nova OP',
        icon: Hammer,
        href: '/app/industria/ordens?action=new',
        gradient: 'from-zinc-600 to-slate-700',
        shadow: 'shadow-zinc-300',
        requiredFeature: 'industria',
    },
    {
        id: 'nova-ficha-tecnica',
        label: 'Nova Ficha Técnica',
        icon: Box,
        href: '/app/industria/boms?action=new',
        gradient: 'from-stone-500 to-neutral-600',
        shadow: 'shadow-stone-200',
        requiredFeature: 'industria',
    },
    {
        id: 'novo-centro-trabalho',
        label: 'Novo Centro Trabalho',
        icon: Factory,
        href: '/app/industria/centros-trabalho?action=new',
        gradient: 'from-gray-500 to-slate-600',
        shadow: 'shadow-gray-200',
        requiredFeature: 'industria',
    },
];

/**
 * Default shortcuts for new users (common actions)
 */
export const DEFAULT_SHORTCUT_IDS = [
    'nova-venda',
    'novo-cliente',
    'novo-produto',
    'novo-pagamento',
];

import { Building, Users, UserCog, CreditCard, Trash2, ShieldCheck, Receipt, ListChecks, ToggleLeft, Plug, FileDown } from 'lucide-react';

export interface SettingsTab {
  name: string;
  menu: SettingsMenuItem[];
}

export interface SettingsMenuItem {
  name: string;
  icon: React.ElementType;
  href?: string;
}

export const settingsMenuConfig: SettingsTab[] = [
  {
    name: 'Geral',
    menu: [
      { name: 'Empresa', icon: Building, href: '/app/configuracoes/geral/empresa' },
      { name: 'Onboarding (Checklist)', icon: ListChecks, href: '/app/configuracoes/geral/onboarding' },
      { name: 'Usuários', icon: Users, href: '/app/configuracoes/geral/users' },
      { name: 'Papéis e Permissões', icon: ShieldCheck, href: '/app/configuracoes/geral/papeis' },
      { name: 'Perfil de Usuário', icon: UserCog, href: '/app/configuracoes/geral/perfil' },
      { name: 'Privacidade (LGPD)', icon: FileDown, href: '/app/configuracoes/geral/privacidade' },
      { name: 'Minha Assinatura', icon: CreditCard, href: '/app/configuracoes/geral/assinatura' },
    ],
  },
  {
    name: 'Avançado',
    menu: [
      { name: 'Limpeza de Dados', icon: Trash2, href: '/app/configuracoes/avancado/limpeza' },
      { name: 'Feature Flags', icon: ToggleLeft, href: '/app/configuracoes/avancado/feature-flags' },
      { name: 'Auditoria', icon: ShieldCheck, href: '/app/configuracoes/avancado/auditoria' },
    ],
  },
  {
    name: 'Cadastros',
    menu: [],
  },
  {
    name: 'Suprimentos',
    menu: [],
  },
  {
    name: 'Vendas',
    menu: [],
  },
  {
    name: 'Serviços',
    menu: [],
  },
  {
    name: 'Notas Fiscais',
    menu: [
      { name: 'NF-e (Emissão)', icon: Receipt },
    ],
  },
  {
    name: 'Financeiro',
    menu: [],
  },
  {
    name: 'E-Commerce',
    menu: [
      { name: 'Integrações (Marketplaces)', icon: Plug, href: '/app/configuracoes/ecommerce/marketplaces' },
    ],
  },
];

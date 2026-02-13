import { Building, Users, UserCog, CreditCard, ShieldCheck, ToggleLeft, Plug } from 'lucide-react';

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
      { name: 'Unidades / Filiais', icon: Building, href: '/app/configuracoes/geral/unidades' },
      { name: 'Usuários', icon: Users, href: '/app/configuracoes/geral/users' },
      { name: 'Papéis e Permissões', icon: ShieldCheck, href: '/app/configuracoes/geral/papeis' },
      { name: 'Perfil de Usuário', icon: UserCog, href: '/app/configuracoes/geral/perfil' },
      { name: 'Minha Assinatura', icon: CreditCard, href: '/app/configuracoes/geral/assinatura' },
    ],
  },
  {
    name: 'Integrações',
    menu: [
      { name: 'Integrações', icon: Plug, href: '/app/configuracoes/ecommerce/marketplaces' },
    ],
  },
  {
    name: 'Avançado',
    menu: [
      { name: 'Feature Flags', icon: ToggleLeft, href: '/app/configuracoes/avancado/feature-flags' },
    ],
  },
];

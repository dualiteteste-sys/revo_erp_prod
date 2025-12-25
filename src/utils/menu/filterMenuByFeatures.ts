import { MenuItem } from '@/config/menuConfig';

type FeatureState = {
  industria_enabled: boolean;
  servicos_enabled: boolean;
};

export function filterMenuByFeatures(menu: MenuItem[], features: FeatureState): MenuItem[] {
  return menu
    .filter((group) => {
      if (group.name === 'Indústria') return features.industria_enabled;
      if (group.name === 'Serviços') return features.servicos_enabled;
      return true;
    })
    .map((group) => {
      if (group.name !== 'Cadastros' || !group.children?.length) return group;

      const nextChildren = group.children.filter((child) => {
        if (child.href === '/app/services') return features.servicos_enabled;
        return true;
      });

      return { ...group, children: nextChildren };
    });
}


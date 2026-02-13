const DEFAULT_SETTINGS_ROUTE = '/app/configuracoes/geral/empresa';

const legacySettingsParamRouteMap: Record<string, string> = {
  empresa: '/app/configuracoes/geral/empresa',
  onboarding: '/app/configuracoes/geral/onboarding',
  billing: '/app/configuracoes/geral/assinatura',
  users: '/app/configuracoes/geral/users',
};

export function resolveSettingsRouteFromLegacyParam(param: string | null | undefined): string {
  if (!param) return DEFAULT_SETTINGS_ROUTE;
  return legacySettingsParamRouteMap[param] ?? DEFAULT_SETTINGS_ROUTE;
}

export function getDefaultSettingsRoute(): string {
  return DEFAULT_SETTINGS_ROUTE;
}

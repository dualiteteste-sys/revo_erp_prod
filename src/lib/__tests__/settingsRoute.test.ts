import { describe, expect, it } from 'vitest';

import { getDefaultSettingsRoute, resolveSettingsRouteFromLegacyParam } from '@/lib/settingsRoute';

describe('settingsRoute', () => {
  it('retorna rota padrão quando parâmetro legado é nulo', () => {
    expect(resolveSettingsRouteFromLegacyParam(null)).toBe('/app/configuracoes/geral/empresa');
  });

  it('mapeia parâmetros legados conhecidos', () => {
    expect(resolveSettingsRouteFromLegacyParam('billing')).toBe('/app/configuracoes/geral/assinatura');
    expect(resolveSettingsRouteFromLegacyParam('users')).toBe('/app/configuracoes/geral/users');
    expect(resolveSettingsRouteFromLegacyParam('onboarding')).toBe('/app/configuracoes/geral/onboarding');
  });

  it('usa rota padrão para parâmetros desconhecidos', () => {
    expect(resolveSettingsRouteFromLegacyParam('qualquer-coisa')).toBe('/app/configuracoes/geral/empresa');
  });

  it('expõe rota padrão para abrir Configurações pelo menu', () => {
    expect(getDefaultSettingsRoute()).toBe('/app/configuracoes/geral/empresa');
  });
});

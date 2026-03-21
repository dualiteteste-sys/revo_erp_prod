import type { AssistantContext } from '@/lib/assistant/assistantTypes';
import { resolveAssistantRouteCapability } from '@/components/assistant/assistantCapabilities';

type Params = {
  pathname: string;
  activeEmpresaId: string | null;
  activeEmpresaNome: string | null;
  isAdminLike: boolean;
};

export function buildAssistantContext(params: Params): AssistantContext {
  const capability = resolveAssistantRouteCapability(params.pathname);

  return {
    pathname: params.pathname,
    routeLabel: capability.routeLabel,
    module: capability.module,
    capabilityLevel: capability.capabilityLevel,
    scopeText: capability.scopeText,
    enabledActions: capability.enabledActions,
    suggestedPrompts: capability.suggestedPrompts,
    activeEmpresaId: params.activeEmpresaId,
    activeEmpresaNome: params.activeEmpresaNome,
    canWrite: capability.capabilityLevel === 'acao_assistida',
    isAdminLike: params.isAdminLike,
  };
}

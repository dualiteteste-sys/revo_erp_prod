export type AssistantModule =
  | 'geral'
  | 'dashboard'
  | 'financeiro'
  | 'suprimentos'
  | 'vendas'
  | 'fiscal'
  | 'industria'
  | 'servicos'
  | 'cadastros'
  | 'configuracoes'
  | 'suporte'
  | 'desenvolvedor';

export type AssistantCapabilityLevel =
  | 'sem_integracao'
  | 'consulta'
  | 'preparacao'
  | 'acao_assistida';

export type AssistantAvatarState = 'neutral' | 'analyzing' | 'explaining' | 'success';

export type AssistantMessageRole = 'assistant' | 'user';

export interface AssistantRouteCapability {
  match: string;
  module: AssistantModule;
  routeLabel: string;
  capabilityLevel: AssistantCapabilityLevel;
  scopeText: string;
  enabledActions: string[];
  suggestedPrompts: string[];
}

export interface AssistantContext {
  pathname: string;
  routeLabel: string;
  module: AssistantModule;
  capabilityLevel: AssistantCapabilityLevel;
  scopeText: string;
  enabledActions: string[];
  suggestedPrompts: string[];
  activeEmpresaId: string | null;
  activeEmpresaNome: string | null;
  canWrite: boolean;
  isAdminLike: boolean;
}

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  state?: AssistantAvatarState;
  suggestions?: string[];
  createdAt: string;
}

export interface AssistantReply {
  text: string;
  state: AssistantAvatarState;
  suggestions?: string[];
}

export interface AssistantIntent {
  kind:
    | 'scope'
    | 'help_current_page'
    | 'integrated_modules'
    | 'prepare_action'
    | 'data_request'
    | 'capabilities'
    | 'unknown';
}

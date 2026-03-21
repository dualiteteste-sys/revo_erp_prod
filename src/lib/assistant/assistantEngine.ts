import { findHelpEntry } from '@/components/support/helpCatalog';
import type { AssistantContext, AssistantIntent, AssistantMessage, AssistantReply } from '@/lib/assistant/assistantTypes';
import type { AssistantModelAdapter } from '@/lib/assistant/assistantModelAdapter';
import { capabilityLevelLabel } from '@/components/assistant/assistantCapabilities';

function makeId(): string {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function classifyMessage(message: string): AssistantIntent {
  const normalized = normalizeText(message);

  if (
    normalized.includes('o que voce consegue') ||
    normalized.includes('o que pode fazer') ||
    normalized.includes('escopo') ||
    normalized.includes('integrado')
  ) {
    return { kind: 'scope' };
  }

  if (
    normalized.includes('explique esta tela') ||
    normalized.includes('explique este modulo') ||
    normalized.includes('como funciona') ||
    normalized.includes('o que e esta area')
  ) {
    return { kind: 'help_current_page' };
  }

  if (
    normalized.includes('quais modulos') ||
    normalized.includes('modulos integrados') ||
    normalized.includes('onde voce atua')
  ) {
    return { kind: 'integrated_modules' };
  }

  if (
    normalized.includes('prepare') ||
    normalized.includes('organize') ||
    normalized.includes('roteiro') ||
    normalized.includes('checklist')
  ) {
    return { kind: 'prepare_action' };
  }

  if (
    normalized.includes('saldo') ||
    normalized.includes('titulo') ||
    normalized.includes('pedido') ||
    normalized.includes('extrato') ||
    normalized.includes('nota') ||
    normalized.includes('estoque')
  ) {
    return { kind: 'data_request' };
  }

  if (normalized.includes('o que perguntar') || normalized.includes('ajuda')) {
    return { kind: 'capabilities' };
  }

  return { kind: 'unknown' };
}

function buildPageGuidance(context: AssistantContext): AssistantReply {
  const helpEntry = findHelpEntry(context.pathname);
  const steps = helpEntry?.steps.slice(0, 3).map((item, index) => `${index + 1}. ${item}`).join('\n');

  return {
    state: 'explaining',
    text: [
      `Você está em ${context.routeLabel}. ${helpEntry?.whatIs ?? context.scopeText}`,
      steps ? `Fluxo recomendado:\n${steps}` : null,
      `Escopo atual da Isa neste módulo: ${context.scopeText}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    suggestions: context.suggestedPrompts.slice(0, 3),
  };
}

function buildScopeReply(context: AssistantContext): AssistantReply {
  const levelLabel = capabilityLevelLabel(context.capabilityLevel);

  return {
    state: 'explaining',
    text: [
      `Estou em ${context.routeLabel}, no módulo ${context.module}.`,
      `Nível atual: ${levelLabel}.`,
      context.scopeText,
      'Regra fixa: eu não vou fingir leitura de dados, execução concluída ou certeza técnica quando isso não estiver realmente conectado.',
    ].join('\n\n'),
    suggestions: context.suggestedPrompts.slice(0, 3),
  };
}

function buildIntegratedModulesReply(): AssistantReply {
  return {
    state: 'explaining',
    text: [
      'Integração inicial da Isa nesta entrega local:',
      '1. Financeiro: consulta + preparação orientada.',
      '2. Suprimentos: consulta.',
      '3. Cadastros, Configurações, Dashboard, Suporte e Desenvolvedor: orientação contextual.',
      '4. Vendas, Fiscal, Indústria e Serviços: apoio consultivo sem operação nesta fase.',
    ].join('\n'),
    suggestions: ['O que você consegue fazer aqui?', 'Explique esta tela'],
  };
}

function buildPreparationReply(context: AssistantContext): AssistantReply {
  if (context.capabilityLevel === 'sem_integracao') {
    return {
      state: 'explaining',
      text:
        'Ainda não consigo preparar essa ação operacional neste módulo. Posso, no máximo, te ajudar a estruturar o passo a passo e o checklist de validação com base na tela atual.',
      suggestions: ['Explique esta tela', 'Quais verificações devo fazer aqui?'],
    };
  }

  return {
    state: 'success',
    text: [
      'Consigo te ajudar a preparar a análise, mas ainda sem consultar dados reais neste MVP.',
      `Posso estruturar com base no contexto de ${context.routeLabel}:`,
      `- ${context.enabledActions.join('\n- ')}`,
    ].join('\n'),
    suggestions: context.suggestedPrompts.slice(0, 3),
  };
}

function buildDataLimitReply(context: AssistantContext): AssistantReply {
  return {
    state: 'explaining',
    text: [
      'Ainda não estou conectada a dados operacionais em tempo real nesta primeira implementação.',
      `Então eu não vou afirmar valores, saldos, contagens, status ou pendências reais em ${context.routeLabel} sem uma integração explícita.`,
      'Posso, porém, explicar como você deve analisar essa informação e quais verificações são mais importantes nesta tela.',
    ].join('\n\n'),
    suggestions: ['Explique esta tela', 'Quais verificações devo fazer aqui?'],
  };
}

function buildFallbackReply(context: AssistantContext): AssistantReply {
  return {
    state: 'neutral',
    text: [
      'Ainda estou em uma fase inicial de integração.',
      `Posso te ajudar com o escopo da Isa, explicar a área atual (${context.routeLabel}) e orientar o próximo passo com honestidade sobre o que já está conectado.`,
    ].join('\n\n'),
    suggestions: context.suggestedPrompts.slice(0, 3),
  };
}

export class RuleBasedAssistantAdapter implements AssistantModelAdapter {
  async classifyIntent(input: { message: string }): Promise<AssistantIntent> {
    return classifyMessage(input.message);
  }

  async generateReply(input: { context: AssistantContext; intent: AssistantIntent }): Promise<AssistantReply> {
    switch (input.intent.kind) {
      case 'scope':
      case 'capabilities':
        return buildScopeReply(input.context);
      case 'help_current_page':
        return buildPageGuidance(input.context);
      case 'integrated_modules':
        return buildIntegratedModulesReply();
      case 'prepare_action':
        return buildPreparationReply(input.context);
      case 'data_request':
        return buildDataLimitReply(input.context);
      default:
        return buildFallbackReply(input.context);
    }
  }
}

const adapter = new RuleBasedAssistantAdapter();

export function createAssistantWelcomeMessage(context: AssistantContext): AssistantMessage {
  return {
    id: makeId(),
    role: 'assistant',
    state: 'neutral',
    createdAt: new Date().toISOString(),
    suggestions: context.suggestedPrompts.slice(0, 3),
    content: [
      `Sou a Isa, sua assistente operacional do ERP.`,
      `Você está em ${context.routeLabel}${context.activeEmpresaNome ? ` na empresa ${context.activeEmpresaNome}` : ''}.`,
      context.scopeText,
      'Regra não negociável: eu nunca vou fingir certeza, inventar dado ou dizer que executei algo que não executei.',
    ].join('\n\n'),
  };
}

export async function generateAssistantReply(params: {
  message: string;
  context: AssistantContext;
}): Promise<AssistantMessage> {
  const intent = await adapter.classifyIntent({ message: params.message, context: params.context });
  const reply = await adapter.generateReply({ message: params.message, context: params.context, intent });

  return {
    id: makeId(),
    role: 'assistant',
    content: reply.text,
    state: reply.state,
    suggestions: reply.suggestions,
    createdAt: new Date().toISOString(),
  };
}

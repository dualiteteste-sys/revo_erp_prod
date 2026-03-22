import { findHelpEntry, searchHelpCatalog, type HelpEntry } from '@/components/support/helpCatalog';
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

/* ------------------------------------------------------------------ */
/*  Help guide keywords — maps common terms to search queries          */
/* ------------------------------------------------------------------ */
const GUIDE_TRIGGERS = [
  'como funciona',
  'o que e',
  'o que sao',
  'como usar',
  'como faco',
  'como fazer',
  'como cadastrar',
  'como emitir',
  'como criar',
  'como lancar',
  'como abrir',
  'como fechar',
  'como pagar',
  'como receber',
  'como configurar',
  'como importar',
  'como exportar',
  'como excluir',
  'como estornar',
  'como parcelar',
  'me explica',
  'me explique',
  'explica pra mim',
  'explique pra mim',
  'guia',
  'tutorial',
  'passo a passo',
  'como comecar',
  'para que serve',
  'qual a funcao',
  'o que faz',
  'como funciona o',
  'como funciona a',
  'duvida sobre',
  'preciso de ajuda com',
  'ajuda com',
  'me ajuda com',
  'ensina',
  'como lancar',
  'como baixar',
  'como imprimir',
  'como gerar',
  'onde fica',
  'onde encontro',
  'como acessar',
  'como chegar',
];

/* Terms that strongly indicate a current-page (deictic) question */
const CURRENT_PAGE_TRIGGERS = [
  'esta tela',
  'este modulo',
  'esta pagina',
  'esta area',
  'tela atual',
  'pagina atual',
  'aqui',
  'essa tela',
  'esse modulo',
  'essa pagina',
];

function classifyMessage(message: string): AssistantIntent {
  const normalized = normalizeText(message);

  // Scope / capabilities
  if (
    normalized.includes('o que voce consegue') ||
    normalized.includes('o que pode fazer') ||
    normalized.includes('escopo') ||
    /\bintegrad[oa]\b/.test(normalized)
  ) {
    return { kind: 'scope' };
  }

  // Integrated modules
  if (
    normalized.includes('quais modulos') ||
    normalized.includes('modulos integrados') ||
    normalized.includes('onde voce atua')
  ) {
    return { kind: 'integrated_modules' };
  }

  // Prepare action
  if (
    normalized.includes('prepare') ||
    normalized.includes('organize') ||
    normalized.includes('roteiro') ||
    normalized.includes('checklist')
  ) {
    return { kind: 'prepare_action' };
  }

  // Current page (deictic reference — "esta tela", "aqui")
  const hasDeictic = CURRENT_PAGE_TRIGGERS.some((t) => normalized.includes(t));
  if (hasDeictic) {
    return { kind: 'help_current_page' };
  }

  // Guide search — "como funciona o PDV?", "guia de estoque", "o que é tesouraria?"
  for (const trigger of GUIDE_TRIGGERS) {
    if (normalized.includes(trigger)) {
      const idx = normalized.indexOf(trigger);
      const afterTrigger = normalized.slice(idx + trigger.length).trim();
      const guideQuery = afterTrigger.length > 1 ? afterTrigger : normalized;
      return { kind: 'help_guide', guideQuery };
    }
  }

  // Simple topic mention (short messages — just a module name)
  if (normalized.length < 40) {
    const results = searchHelpCatalog(normalized, 1);
    if (results.length > 0) {
      return { kind: 'help_guide', guideQuery: normalized };
    }
  }

  // Data request
  if (
    /\b(saldo|titulo|pedido|extrato|nota|fatura)\b/.test(normalized) &&
    /\b(qual|quanto|quantos|meu|minha|ver|mostrar|listar)\b/.test(normalized)
  ) {
    return { kind: 'data_request' };
  }

  // Capabilities / help
  if (normalized.includes('o que perguntar') || normalized === 'ajuda' || normalized === 'help') {
    return { kind: 'capabilities' };
  }

  return { kind: 'unknown' };
}

/* ------------------------------------------------------------------ */
/*  Reply builders                                                     */
/* ------------------------------------------------------------------ */

function formatHelpEntry(entry: HelpEntry): string {
  const parts: string[] = [];

  parts.push(`📘 ${entry.title}\n\n${entry.whatIs}`);

  if (entry.steps.length > 0) {
    const stepsText = entry.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    parts.push(`Passo a passo:\n${stepsText}`);
  }

  if (entry.dependsOn && entry.dependsOn.length > 0) {
    parts.push(`Pré-requisitos: ${entry.dependsOn.join(', ')}`);
  }

  if (entry.connectsWith && entry.connectsWith.length > 0) {
    parts.push(`Conecta com: ${entry.connectsWith.join(', ')}`);
  }

  if (entry.fillPerfectly && entry.fillPerfectly.length > 0) {
    parts.push(`Dicas para usar bem:\n${entry.fillPerfectly.map((t) => `• ${t}`).join('\n')}`);
  }

  if (entry.commonMistakes && entry.commonMistakes.length > 0) {
    parts.push(`Erros comuns a evitar:\n${entry.commonMistakes.map((m) => `• ${m}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

function buildGuideReply(guideQuery: string, context: AssistantContext): AssistantReply {
  const results = searchHelpCatalog(guideQuery, 3);

  if (results.length === 0) {
    const currentEntry = findHelpEntry(context.pathname);
    if (currentEntry) {
      return {
        state: 'explaining',
        text: `Não encontrei um guia específico para "${guideQuery}", mas posso te explicar a tela atual:\n\n${formatHelpEntry(currentEntry)}`,
        suggestions: ['Quais módulos existem?', 'O que você consegue fazer?'],
      };
    }
    return {
      state: 'neutral',
      text: `Não encontrei um guia sobre "${guideQuery}". Tente perguntar sobre um módulo específico como PDV, Estoque, Tesouraria, Contas a Receber, Produtos, etc.`,
      suggestions: ['Quais módulos existem?', 'Explique esta tela', 'O que você consegue fazer?'],
    };
  }

  const best = results[0];
  const parts = [formatHelpEntry(best)];

  if (results.length > 1) {
    const others = results.slice(1).map((r) => `• ${r.title}`).join('\n');
    parts.push(`Guias relacionados:\n${others}`);
  }

  const suggestions: string[] = [];
  if (best.connectsWith && best.connectsWith.length > 0) {
    suggestions.push(`Como funciona ${best.connectsWith[0]}?`);
  }
  if (best.commonMistakes && best.commonMistakes.length > 0) {
    suggestions.push('Quais erros evitar?');
  }
  suggestions.push('Explique esta tela');

  return {
    state: 'explaining',
    text: parts.join('\n\n'),
    suggestions: suggestions.slice(0, 3),
  };
}

function buildPageGuidance(context: AssistantContext): AssistantReply {
  const helpEntry = findHelpEntry(context.pathname);

  if (helpEntry) {
    return {
      state: 'explaining',
      text: formatHelpEntry(helpEntry),
      suggestions: context.suggestedPrompts.slice(0, 3),
    };
  }

  return {
    state: 'explaining',
    text: `Você está em ${context.routeLabel}. ${context.scopeText}`,
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
      'Posso explicar qualquer módulo do sistema — é só perguntar! Exemplos: "Como funciona o PDV?", "Guia de Estoque", "O que é Tesouraria?".',
    ].join('\n\n'),
    suggestions: context.suggestedPrompts.slice(0, 3),
  };
}

function buildIntegratedModulesReply(): AssistantReply {
  return {
    state: 'explaining',
    text: [
      'Conheço todos os módulos do sistema e posso explicar cada um em detalhes. Pergunte sobre qualquer um!',
      '',
      '📊 Dashboard — Visão geral do negócio',
      '🛒 Vendas — PDV, Pedidos, CRM, Metas, Comissões, Expedição',
      '📦 Suprimentos — Estoque, Compras, Recebimento, XML',
      '💰 Financeiro — Tesouraria, Contas a Receber/Pagar, Extrato, DRE, Conciliação',
      '🏭 Indústria — Chão de Fábrica, PCP, MRP, Qualidade, BOM, Roteiros',
      '🔧 Serviços — OS, Contratos, Cobranças, NFS-e',
      '📄 Fiscal — NF-e, NFS-e, Naturezas de Operação, Regras Fiscais',
      '👥 RH — Colaboradores, Cargos, Competências, Treinamentos',
      '⚙️ Configurações, Cadastros, Integrações',
    ].join('\n'),
    suggestions: ['Como funciona o PDV?', 'Guia de Estoque', 'O que é Tesouraria?'],
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
      'Posso te ajudar de várias formas:',
      '• Explicar qualquer módulo do sistema (ex: "Como funciona o PDV?")',
      '• Explicar a tela atual (ex: "Explique esta tela")',
      '• Mostrar o passo a passo de funcionalidades (ex: "Como cadastrar um produto?")',
      '• Listar módulos disponíveis (ex: "Quais módulos existem?")',
      '',
      `Você está em ${context.routeLabel}. Posso começar explicando esta área?`,
    ].join('\n'),
    suggestions: ['Explique esta tela', 'Quais módulos existem?', 'Como funciona o PDV?'],
  };
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export class RuleBasedAssistantAdapter implements AssistantModelAdapter {
  async classifyIntent(input: { message: string }): Promise<AssistantIntent> {
    return classifyMessage(input.message);
  }

  async generateReply(input: { message: string; context: AssistantContext; intent: AssistantIntent }): Promise<AssistantReply> {
    switch (input.intent.kind) {
      case 'scope':
      case 'capabilities':
        return buildScopeReply(input.context);
      case 'help_current_page':
        return buildPageGuidance(input.context);
      case 'help_guide':
        return buildGuideReply(input.intent.guideQuery ?? input.message, input.context);
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
  const helpEntry = findHelpEntry(context.pathname);
  const whatIs = helpEntry?.whatIs ?? context.scopeText;

  return {
    id: makeId(),
    role: 'assistant',
    state: 'neutral',
    createdAt: new Date().toISOString(),
    suggestions: [
      'Explique esta tela',
      ...(context.suggestedPrompts.slice(0, 2)),
    ],
    content: [
      `Sou a Isa, sua assistente do ERP.`,
      `Você está em ${context.routeLabel}${context.activeEmpresaNome ? ` (${context.activeEmpresaNome})` : ''}. ${whatIs}`,
      'Pergunte sobre qualquer módulo do sistema — sei explicar todos em detalhe. Também posso mostrar o passo a passo de cada funcionalidade.',
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

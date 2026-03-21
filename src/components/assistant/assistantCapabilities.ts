import type { AssistantCapabilityLevel, AssistantModule, AssistantRouteCapability } from '@/lib/assistant/assistantTypes';

const MODULE_DEFAULTS: Record<
  AssistantModule,
  Omit<AssistantRouteCapability, 'match' | 'routeLabel'>
> = {
  geral: {
    module: 'geral',
    capabilityLevel: 'sem_integracao',
    scopeText: 'Posso orientar sobre o uso do ERP e explicar o escopo do assistente, mas ainda não atuo operacionalmente nesta área.',
    enabledActions: ['explicar escopo atual'],
    suggestedPrompts: ['O que você consegue fazer aqui?', 'Quais módulos já estão integrados?'],
  },
  dashboard: {
    module: 'dashboard',
    capabilityLevel: 'consulta',
    scopeText: 'Posso explicar o que este painel mostra, orientar próximos passos e resumir o escopo operacional disponível.',
    enabledActions: ['explicar painel', 'indicar próximos passos', 'resumir escopo'],
    suggestedPrompts: ['Explique este painel', 'Quais próximos passos você recomenda?'],
  },
  financeiro: {
    module: 'financeiro',
    capabilityLevel: 'preparacao',
    scopeText: 'Posso orientar no Financeiro, explicar os fluxos e preparar sugestões de análise. Ainda não executo operações reais nem leio dados em tempo real nesta versão inicial.',
    enabledActions: ['explicar fluxo', 'organizar pedidos de análise', 'preparar prompts operacionais'],
    suggestedPrompts: ['O que você consegue fazer aqui?', 'Como devo fechar este fluxo?', 'Quais análises você pode preparar?'],
  },
  suprimentos: {
    module: 'suprimentos',
    capabilityLevel: 'consulta',
    scopeText: 'Posso orientar sobre estoque, compras e recebimento, além de explicar o fluxo ideal e as verificações mais importantes.',
    enabledActions: ['explicar fluxo', 'listar verificações recomendadas'],
    suggestedPrompts: ['Explique este fluxo', 'Quais verificações devo fazer aqui?'],
  },
  vendas: {
    module: 'vendas',
    capabilityLevel: 'sem_integracao',
    scopeText: 'Neste momento eu consigo orientar sobre o processo de Vendas, mas ainda não atuo operacionalmente neste módulo.',
    enabledActions: ['explicar fluxo'],
    suggestedPrompts: ['Explique este módulo', 'O que já está integrado em Vendas?'],
  },
  fiscal: {
    module: 'fiscal',
    capabilityLevel: 'sem_integracao',
    scopeText: 'Em Fiscal eu atuo apenas como apoio consultivo por enquanto. Não executo nem simulo ações fiscais nesta fase.',
    enabledActions: ['explicar fluxo', 'apontar limites atuais'],
    suggestedPrompts: ['O que você já faz em Fiscal?', 'Explique esta tela'],
  },
  industria: {
    module: 'industria',
    capabilityLevel: 'sem_integracao',
    scopeText: 'Em Indústria eu ainda opero apenas como apoio consultivo, sem automação operacional neste estágio.',
    enabledActions: ['explicar fluxo'],
    suggestedPrompts: ['Explique este módulo', 'O que você consegue fazer aqui?'],
  },
  servicos: {
    module: 'servicos',
    capabilityLevel: 'sem_integracao',
    scopeText: 'Em Serviços eu ainda atuo apenas como apoio consultivo. Posso explicar o fluxo e os próximos passos recomendados.',
    enabledActions: ['explicar fluxo'],
    suggestedPrompts: ['Explique este módulo', 'Quais são os próximos passos?'],
  },
  cadastros: {
    module: 'cadastros',
    capabilityLevel: 'consulta',
    scopeText: 'Posso orientar sobre cadastros, explicar dependências entre módulos e indicar o mínimo necessário para evitar retrabalho.',
    enabledActions: ['explicar dependências', 'orientar preenchimento mínimo'],
    suggestedPrompts: ['O que preciso preencher aqui?', 'Este cadastro impacta quais módulos?'],
  },
  configuracoes: {
    module: 'configuracoes',
    capabilityLevel: 'consulta',
    scopeText: 'Posso orientar sobre empresa, permissões, plano e integrações, explicando o efeito de cada área sem aplicar mudanças automaticamente.',
    enabledActions: ['explicar áreas', 'orientar configuração'],
    suggestedPrompts: ['Explique esta configuração', 'O que devo revisar aqui?'],
  },
  suporte: {
    module: 'suporte',
    capabilityLevel: 'consulta',
    scopeText: 'Posso orientar no diagnóstico, indicar o contexto ideal para suporte e explicar como registrar um problema com mais precisão.',
    enabledActions: ['explicar diagnóstico', 'orientar abertura de ticket'],
    suggestedPrompts: ['Como devo registrar este problema?', 'O que preciso coletar antes de abrir ticket?'],
  },
  desenvolvedor: {
    module: 'desenvolvedor',
    capabilityLevel: 'consulta',
    scopeText: 'Posso orientar sobre as telas operacionais e de diagnóstico, mas sem executar ações técnicas automaticamente.',
    enabledActions: ['explicar painel', 'orientar diagnóstico'],
    suggestedPrompts: ['Explique esta tela', 'O que devo verificar primeiro?'],
  },
};

export const ASSISTANT_ROUTE_CAPABILITIES: AssistantRouteCapability[] = [
  {
    match: '/app/dashboard',
    routeLabel: 'Dashboard',
    ...MODULE_DEFAULTS.dashboard,
  },
  {
    match: '/app/financeiro/tesouraria',
    routeLabel: 'Tesouraria',
    ...MODULE_DEFAULTS.financeiro,
    scopeText:
      'Posso explicar Tesouraria, organizar verificações e preparar análises de saldo, movimentação e conciliação. Ainda não executo lançamentos nem consulto dados reais nesta primeira versão.',
    enabledActions: ['explicar tesouraria', 'preparar checklist de análise', 'organizar perguntas de conciliação'],
    suggestedPrompts: ['Explique esta tela', 'Como devo analisar divergências aqui?', 'O que você consegue fazer em Tesouraria?'],
  },
  {
    match: '/app/financeiro/extrato',
    routeLabel: 'Extrato',
    ...MODULE_DEFAULTS.financeiro,
    scopeText:
      'Posso orientar a leitura do extrato, explicar conciliação e sugerir um roteiro de análise. Ainda não leio o extrato real nem concilio automaticamente nesta versão.',
    enabledActions: ['explicar conciliação', 'preparar roteiro de análise'],
    suggestedPrompts: ['Como devo conciliar este extrato?', 'Explique esta tela'],
  },
  {
    match: '/app/financeiro/contas-a-receber',
    routeLabel: 'Contas a Receber',
    ...MODULE_DEFAULTS.financeiro,
    suggestedPrompts: ['Explique esta tela', 'Como devo priorizar cobranças?', 'O que você consegue fazer aqui?'],
  },
  {
    match: '/app/financeiro/contas-a-pagar',
    routeLabel: 'Contas a Pagar',
    ...MODULE_DEFAULTS.financeiro,
    suggestedPrompts: ['Explique esta tela', 'Como devo organizar os pagamentos?', 'O que você consegue fazer aqui?'],
  },
  {
    match: '/app/financeiro',
    routeLabel: 'Financeiro',
    ...MODULE_DEFAULTS.financeiro,
  },
  {
    match: '/app/suprimentos/estoque',
    routeLabel: 'Estoque',
    ...MODULE_DEFAULTS.suprimentos,
    scopeText:
      'Posso explicar o fluxo de estoque, apontar verificações importantes e preparar um checklist para análise de divergências. Ainda não faço leitura operacional em tempo real nesta versão.',
    enabledActions: ['explicar kardex e saldo', 'preparar checklist de divergências'],
    suggestedPrompts: ['Explique esta tela', 'Quais verificações devo fazer no estoque?', 'O que você já faz aqui?'],
  },
  {
    match: '/app/suprimentos/compras',
    routeLabel: 'Compras',
    ...MODULE_DEFAULTS.suprimentos,
    suggestedPrompts: ['Explique esta tela', 'Como devo conduzir este fluxo de compra?'],
  },
  {
    match: '/app/suprimentos/recebimento',
    routeLabel: 'Recebimento',
    ...MODULE_DEFAULTS.suprimentos,
    suggestedPrompts: ['Explique esta tela', 'Quais verificações devo fazer no recebimento?'],
  },
  {
    match: '/app/suprimentos',
    routeLabel: 'Suprimentos',
    ...MODULE_DEFAULTS.suprimentos,
  },
  {
    match: '/app/vendas',
    routeLabel: 'Vendas',
    ...MODULE_DEFAULTS.vendas,
  },
  {
    match: '/app/fiscal',
    routeLabel: 'Fiscal',
    ...MODULE_DEFAULTS.fiscal,
  },
  {
    match: '/app/industria',
    routeLabel: 'Indústria',
    ...MODULE_DEFAULTS.industria,
  },
  {
    match: '/app/servicos',
    routeLabel: 'Serviços',
    ...MODULE_DEFAULTS.servicos,
  },
  {
    match: '/app/services',
    routeLabel: 'Serviços',
    ...MODULE_DEFAULTS.servicos,
  },
  {
    match: '/app/cadastros',
    routeLabel: 'Cadastros',
    ...MODULE_DEFAULTS.cadastros,
  },
  {
    match: '/app/products',
    routeLabel: 'Produtos',
    ...MODULE_DEFAULTS.cadastros,
  },
  {
    match: '/app/partners',
    routeLabel: 'Parceiros',
    ...MODULE_DEFAULTS.cadastros,
  },
  {
    match: '/app/configuracoes',
    routeLabel: 'Configurações',
    ...MODULE_DEFAULTS.configuracoes,
  },
  {
    match: '/app/suporte',
    routeLabel: 'Suporte',
    ...MODULE_DEFAULTS.suporte,
  },
  {
    match: '/app/desenvolvedor',
    routeLabel: 'Desenvolvedor',
    ...MODULE_DEFAULTS.desenvolvedor,
  },
];

export function capabilityLevelLabel(level: AssistantCapabilityLevel): string {
  switch (level) {
    case 'consulta':
      return 'Consulta';
    case 'preparacao':
      return 'Preparação';
    case 'acao_assistida':
      return 'Ação assistida';
    default:
      return 'Sem integração';
  }
}

export function resolveAssistantRouteCapability(pathname: string): AssistantRouteCapability {
  const matches = ASSISTANT_ROUTE_CAPABILITIES.filter((item) => pathname.startsWith(item.match));
  if (matches.length > 0) {
    return matches.sort((a, b) => b.match.length - a.match.length)[0]!;
  }

  const root = pathname.split('/')[2] as AssistantModule | undefined;
  const fallbackModule = root && root in MODULE_DEFAULTS ? root : 'geral';
  return {
    match: pathname,
    routeLabel: 'Área atual',
    ...MODULE_DEFAULTS[fallbackModule],
  };
}

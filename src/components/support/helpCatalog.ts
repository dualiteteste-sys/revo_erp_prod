import type { RoadmapGroupKey } from '@/components/roadmap/types';

export type HelpLink = {
  label: string;
  href: string;
  kind?: 'internal' | 'external';
};

export type HelpEntry = {
  match: string; // prefix
  title: string;
  whatIs: string;
  steps: string[];
  dependsOn?: string[];
  connectsWith?: string[];
  fillPerfectly?: string[];
  links?: HelpLink[];
  roadmapKey?: RoadmapGroupKey;
};

export const HELP_CATALOG: HelpEntry[] = [
  {
    match: '/app/partners',
    title: 'Clientes e Fornecedores: guia rápido',
    whatIs: 'Aqui você cadastra pessoas (cliente/fornecedor) que serão usadas em vendas, compras, OS e financeiro.',
    steps: [
      'Clique em “Novo” e defina o tipo (Cliente / Fornecedor / Ambos).',
      'Preencha os dados mínimos e salve.',
      'Valide no fluxo: use o cadastro em um Pedido/OS/Compra para confirmar.',
    ],
    dependsOn: ['Empresa ativa', 'Permissão: Cadastros (create/update)'],
    connectsWith: ['Vendas', 'Suprimentos', 'Serviços (OS)', 'Financeiro'],
    fillPerfectly: [
      'Nome/Razão social e documento (CPF/CNPJ) sem caracteres estranhos.',
      'Endereço completo (CEP) para expedição e emissão fiscal (quando aplicável).',
      'Contato principal (email/telefone) para cobranças e comunicação.',
      'Classificação correta: fornecedor para compras, cliente para vendas/OS.',
    ],
    links: [{ label: 'Abrir Roadmap (Cadastros)', href: '/app/dashboard?roadmap=cadastros', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/products',
    title: 'Produtos: guia rápido',
    whatIs: 'Produtos alimentam pedidos/PDV, compras, estoque e MRP-lite. O objetivo é manter SKU/unidade e estoque consistentes.',
    steps: [
      'Cadastre 1 produto ativo com SKU e unidade.',
      'Defina mínimo/máximo e (opcional) lead time.',
      'Faça 1 movimentação/recebimento para validar estoque e kardex.',
      'Abra Suprimentos → Relatórios e confira a reposição sugerida.',
    ],
    dependsOn: ['Unidades de medida', 'Permissão: Cadastros (create/update)', 'Depósito (se multi-estoque estiver ativo)'],
    connectsWith: ['Vendas (Pedidos/PDV)', 'Suprimentos (Estoque/Compras/Recebimentos)', 'Indústria (BOM/MRP)', 'Financeiro (custos)'],
    fillPerfectly: [
      'SKU único (evita duplicidade) e unidade correta.',
      'Status “Ativo” + categoria/grupo (quando existir) para relatórios.',
      'Mín/Máx e lead time coerentes para sugestão de compra.',
      'Tributos básicos (quando aplicável) para fiscal/precificação.',
    ],
    links: [{ label: 'Suprimentos → Relatórios', href: '/app/suprimentos/relatorios', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/vendas/pedidos',
    title: 'Pedidos de venda: guia rápido',
    whatIs: 'Pedidos organizam venda no ERP e servem como base para expedição, histórico e financeiro.',
    steps: [
      'Crie um pedido com 1 cliente e 1 item.',
      'Revise preços/descontos e confirme totais.',
      'Salve e confira status e histórico.',
      'Se for expedir, avance para Vendas → Expedição e registre tracking.',
    ],
    dependsOn: ['Clientes', 'Produtos', 'Permissão: Vendas (create/update)'],
    connectsWith: ['Expedição', 'Financeiro (A Receber)', 'Fiscal (NF-e quando habilitado)'],
    fillPerfectly: [
      'Cliente correto (evita erros de entrega/cobrança).',
      'Itens com unidade e quantidade coerentes (impacta estoque).',
      'Descontos com justificativa (quando exigido por permissão).',
      'Canal (PDV/online) e observações para expedição.',
    ],
    links: [{ label: 'Abrir Expedição', href: '/app/vendas/expedicao', kind: 'internal' }],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/pdv',
    title: 'PDV: guia rápido',
    whatIs: 'PDV é venda rápida com baixa de estoque e lançamento no financeiro. O foco aqui é velocidade sem bagunçar o caixa.',
    steps: [
      'Selecione uma conta corrente padrão para recebimentos.',
      'Adicione itens e confirme quantidades/preços.',
      'Finalize e confira o comprovante/histórico.',
      'Sem internet: finalize mesmo assim e aguarde a sincronização automática.',
    ],
    dependsOn: ['Conta corrente padrão (recebimentos)', 'Produtos com estoque (se aplicável)', 'Permissão: PDV (create)'],
    connectsWith: ['Vendas (Pedidos)', 'Financeiro (Tesouraria)', 'Estoque (baixa e kardex)'],
    fillPerfectly: [
      'Conta de recebimento correta (evita caixa “furado”).',
      'Desconto dentro da permissão (auditável).',
      'Cliente (quando necessário) para histórico e cobranças.',
    ],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/expedicao',
    title: 'Expedição: guia rápido',
    whatIs: 'Expedição dá rastreabilidade: status, tracking e SLA por pedido.',
    steps: [
      'Abra uma expedição para um pedido.',
      'Avance status (Separação → Envio) e registre tracking.',
      'Use filtros e “Atrasadas (SLA)” para pendências.',
    ],
    dependsOn: ['Pedidos criados', 'Transportadora (quando aplicável)', 'Permissão: Expedição (update)'],
    connectsWith: ['Pedidos', 'Clientes (endereço)', 'Relatórios de vendas'],
    fillPerfectly: ['Tracking e transportadora corretos.', 'Status atualizado no momento certo.', 'Anexos/observações quando houver ocorrência.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/suprimentos/compras',
    title: 'Ordens de compra: guia rápido',
    whatIs: 'Ordem de compra organiza recebimento e custo. Use rascunho/enviado e acompanhe o que falta receber.',
    steps: [
      'Crie uma OC em rascunho com 1 fornecedor e 1 item.',
      'Envie/registre recebimento quando chegar (total ou parcial).',
      'Veja impacto em estoque e custos (quando aplicável).',
    ],
    dependsOn: ['Fornecedores', 'Produtos', 'Permissão: Suprimentos (create/update)'],
    connectsWith: ['Recebimentos', 'Estoque', 'Financeiro (A Pagar)'],
    fillPerfectly: [
      'Fornecedor correto e condições básicas (prazo) quando existir.',
      'Itens com unidade e quantidades corretas.',
      'Registrar parcialidades para não “sumir” saldo a receber.',
    ],
    links: [{ label: 'Abrir Recebimentos', href: '/app/suprimentos/recebimentos', kind: 'internal' }],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/relatorios',
    title: 'Relatórios de suprimentos: guia rápido',
    whatIs: 'Aqui você vê valorização/ABC e reposição. O objetivo é comprar o necessário com previsibilidade.',
    steps: [
      'Veja “Valorização & ABC” para entender onde está o capital.',
      'Use “Baixo estoque / reposição” para urgências.',
      'Use “Sugestão de Compra (MRP-lite)” considerando OCs e lead time.',
    ],
    dependsOn: ['Produtos com mínimo/máximo', 'Movimentações/recebimentos registrados'],
    connectsWith: ['Compras', 'Estoque', 'Produtos'],
    fillPerfectly: ['Mín/máx coerentes.', 'Lead time realista.', 'OC aberta registrada (evita sugerir compra duplicada).'],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/estoque',
    title: 'Estoque: guia rápido',
    whatIs: 'Aqui você controla saldo e movimentações com histórico (kardex). Com depósitos, você enxerga por local e transfere sem planilha paralela.',
    steps: [
      'Selecione o depósito (se existir) e use a busca para encontrar o produto.',
      'Clique em “Movimentar” para registrar entrada/saída/ajustes (ou transferência entre depósitos).',
      'Abra o “Kardex” para validar histórico e exporte CSV quando precisar.',
    ],
    dependsOn: ['Produtos', 'Depósitos (se multi-estoque estiver ativo)', 'Permissão: Suprimentos (update)'],
    connectsWith: ['Compras/Recebimentos', 'Vendas/PDV', 'Indústria (consumo e apontamentos)'],
    fillPerfectly: ['Sempre registrar a referência (pedido/OC/OP) quando existir.', 'Evitar ajustes manuais sem justificativa.', 'Transferências devem sair de um local e entrar em outro (saldo bate).'],
    links: [
      { label: 'Abrir Compras', href: '/app/suprimentos/compras', kind: 'internal' },
      { label: 'Abrir Recebimentos', href: '/app/suprimentos/recebimentos', kind: 'internal' },
    ],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/financeiro/tesouraria',
    title: 'Tesouraria: guia rápido',
    whatIs: 'Tesouraria consolida saldo e lançamentos. Conta corrente + extrato são a base para conciliação e relatórios.',
    steps: ['Cadastre/valide 1 conta corrente padrão.', 'Importe extrato (quando aplicável) e confira saldo.', 'Concilie e veja relatório por período.'],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/servicos/os',
    title: 'Ordem de Serviço: guia rápido',
    whatIs: 'OS é o fluxo ponta a ponta de serviços: status, agenda, anexos, histórico e custos.',
    steps: ['Crie uma OS para um cliente.', 'Adicione itens/serviços e avance status.', 'Gere financeiro/parcelas (quando aplicável) e confira auditoria.'],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/industria/ordens',
    title: 'OP/OB (Indústria): guia rápido',
    whatIs: 'Ordens de produção/beneficiamento com estados travados e rastreabilidade. Use roteiro/BOM e avance com segurança.',
    steps: ['Cadastre CT, Roteiro e BOM.', 'Crie uma ordem e aplique roteiro/BOM.', 'Execute/apontar no chão de fábrica e valide consistência.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/configuracoes/ecommerce/marketplaces',
    title: 'Integrações (marketplaces): guia rápido',
    whatIs: 'Conecte Mercado Livre/Shopee, habilite import/sync e acompanhe saúde + DLQ para reduzir suporte.',
    steps: ['Conecte o provider (OAuth).', 'Rode diagnóstico e confira health.', 'Importe pedidos e valide o mapeamento em Vendas.'],
    roadmapKey: 'integracoes',
  },
];

function buildFallbackEntry(pathname: string): HelpEntry | null {
  if (!pathname.startsWith('/app/')) return null;

  const segments = pathname.replace(/^\/app\/+/, '').split('/').filter(Boolean);
  const root = segments[0] ?? '';
  if (!root) return null;

  const groupByRoot: Record<
    string,
    {
      titlePrefix: string;
      roadmapKey?: RoadmapGroupKey;
      whatIs: string;
      steps: string[];
      dependsOn?: string[];
      connectsWith?: string[];
      fillPerfectly?: string[];
      links?: HelpLink[];
    }
  > = {
    dashboard: {
      titlePrefix: 'Painel: guia rápido',
      whatIs: 'O painel mostra o que está acontecendo no seu negócio e o que precisa de atenção agora (vendas, financeiro, pendências).',
      steps: ['Use filtros de período para comparar resultados.', 'Clique nos cards para abrir a lista correspondente.', 'Se algo falhar, use “Diagnóstico guiado” e (Ops) “Saúde”.'],
    },
    cadastros: {
      titlePrefix: 'Cadastros: guia rápido',
      roadmapKey: 'cadastros',
      whatIs: 'Cadastros são a base do ERP. Mantendo clientes, produtos e serviços consistentes, o restante (vendas, compras e financeiro) funciona sem retrabalho.',
      steps: ['Use filtros e busca para evitar duplicar cadastros.', 'Clique em “Novo” e preencha o mínimo necessário.', 'Valide no fluxo: use o cadastro em um pedido/OS/compra.'],
      dependsOn: ['Empresa ativa', 'Permissões do módulo'],
      connectsWith: ['Vendas', 'Suprimentos', 'Serviços', 'Financeiro'],
      fillPerfectly: ['Evite duplicidade (busque antes).', 'Preencha o mínimo correto.', 'Valide no fluxo e em relatórios.'],
      links: [{ label: 'Abrir Roadmap (Cadastros)', href: '/app/dashboard?roadmap=cadastros', kind: 'internal' }],
    },
    suprimentos: {
      titlePrefix: 'Suprimentos: guia rápido',
      roadmapKey: 'suprimentos',
      whatIs: 'Suprimentos mantém estoque confiável: compras, recebimentos, movimentações e relatórios de reposição.',
      steps: ['Confira estoque e depósitos (se habilitado).', 'Registre recebimentos e movimentações corretamente.', 'Use relatórios para reposição e pendências.'],
      dependsOn: ['Produtos', 'Fornecedores', 'Permissões do módulo'],
      connectsWith: ['Vendas/PDV', 'Financeiro', 'Indústria'],
      fillPerfectly: ['Registre referências (OC/recebimento) quando existir.', 'Evite ajustes manuais sem justificativa.', 'Kardex precisa bater com saldo.'],
      links: [{ label: 'Abrir Roadmap (Suprimentos)', href: '/app/dashboard?roadmap=suprimentos', kind: 'internal' }],
    },
    vendas: {
      titlePrefix: 'Vendas: guia rápido',
      roadmapKey: 'vendas',
      whatIs: 'Vendas organiza pedidos/PDV e conecta expedição e financeiro com rastreabilidade.',
      steps: ['Crie um pedido ou venda no PDV e confira total.', 'Avance para expedição (se aplicável).', 'Valide no fim: financeiro e histórico batem.'],
      dependsOn: ['Clientes', 'Produtos', 'Conta corrente (PDV)'],
      connectsWith: ['Expedição', 'Financeiro', 'Suprimentos'],
      fillPerfectly: ['Descontos auditáveis.', 'Endereço/contato corretos.', 'Status e timeline atualizados.'],
      links: [{ label: 'Abrir Roadmap (Vendas)', href: '/app/dashboard?roadmap=vendas', kind: 'internal' }],
    },
    financeiro: {
      titlePrefix: 'Financeiro: guia rápido',
      roadmapKey: 'financeiro',
      whatIs: 'Financeiro consolida caixa, contas a pagar/receber e relatórios. O objetivo é saldo confiável e auditoria.',
      steps: ['Defina contas correntes padrão e valide saldo.', 'Registre pagar/receber e concilie com extrato quando possível.', 'Use relatórios por período para fechar.'],
      dependsOn: ['Contas correntes', 'Permissões do módulo'],
      connectsWith: ['Vendas/PDV', 'Suprimentos', 'Serviços'],
      fillPerfectly: ['Data e categoria corretas.', 'Conciliação reduz divergência.', 'Estornos sempre auditáveis.'],
      links: [{ label: 'Abrir Roadmap (Financeiro)', href: '/app/dashboard?roadmap=financeiro', kind: 'internal' }],
    },
    servicos: {
      titlePrefix: 'Serviços: guia rápido',
      roadmapKey: 'servicos',
      whatIs: 'Serviços (OS) organiza atendimento, status, agenda, anexos e histórico, com geração de financeiro quando aplicável.',
      steps: ['Crie uma OS e avance status.', 'Registre itens/custos e anexos.', 'Gere parcelas e valide auditoria.'],
      dependsOn: ['Clientes', 'Permissões do módulo'],
      connectsWith: ['Financeiro', 'Cadastros', 'Suprimentos (peças/estoque)'],
      fillPerfectly: ['Status coerente com agenda.', 'Equipamento/serial (quando aplicável).', 'Anexos e observações em ocorrências.'],
      links: [{ label: 'Abrir Roadmap (Serviços)', href: '/app/dashboard?roadmap=servicos', kind: 'internal' }],
    },
    industria: {
      titlePrefix: 'Indústria: guia rápido',
      roadmapKey: 'industria',
      whatIs: 'Indústria conecta roteiro/BOM, ordens e execução no chão de fábrica com rastreabilidade e travas de estado.',
      steps: ['Cadastre CT, Roteiro e BOM.', 'Crie uma OP/OB e aplique roteiro/BOM.', 'Aponte execução e valide consistência de estados.'],
      dependsOn: ['Produtos', 'Roteiro + BOM', 'Permissões do módulo'],
      connectsWith: ['Suprimentos (estoque)', 'Qualidade', 'Relatórios'],
      fillPerfectly: ['Estados travados (sem pular etapas).', 'Apontamentos com quantidade e motivo.', 'Consumo de materiais rastreável.'],
      links: [{ label: 'Abrir Roadmap (Indústria)', href: '/app/dashboard?roadmap=industria', kind: 'internal' }],
    },
    fiscal: {
      titlePrefix: 'Fiscal: guia rápido',
      whatIs: 'Fiscal reúne configurações e emissão/consulta de documentos fiscais. O foco é reduzir risco e manter registros rastreáveis.',
      steps: ['Complete configurações mínimas (emitente e numeração).', 'Crie rascunho e valide dados.', 'Emita/acompanhe status e armazene XML/DANFE.'],
    },
    configuracoes: {
      titlePrefix: 'Configurações: guia rápido',
      whatIs: 'Aqui você ajusta empresa, permissões, plano e integrações. O objetivo é habilitar o que precisa sem travar o uso do sistema.',
      steps: ['Complete dados da empresa e onboarding mínimo.', 'Revise papéis e permissões por função.', 'Confira assinatura e limites do plano.'],
    },
    desenvolvedor: {
      titlePrefix: 'Desenvolvedor: guia rápido',
      whatIs: 'Área para diagnóstico e operação. Use para ver logs/saúde e reprocessar itens com segurança (DLQ).',
      steps: ['Abra a tela de Saúde para ver pendências e falhas.', 'Use “dry-run” antes de reprocessar quando disponível.', 'Reprocesso deve ser idempotente (sem duplicar).'],
    },
    suporte: {
      titlePrefix: 'Suporte: guia rápido',
      whatIs: 'Use diagnóstico guiado para resolver problemas comuns sem abrir ticket e registrar o contexto quando precisar de ajuda.',
      steps: ['Escolha o problema e siga os passos sugeridos.', 'Se necessário, anexe prints e ID de request.', 'Use “Saúde (Ops)” para falhas técnicas e filas.'],
    },
  };

  const group = groupByRoot[root];
  if (!group) {
    return {
      match: pathname,
      title: 'Guia rápido',
      whatIs: 'Esta área ajuda a concluir tarefas com menos retrabalho.',
      steps: ['Use filtros e busca para achar o que precisa.', 'Clique em “Novo” para criar ou abra para editar.', 'Valide no fluxo e confirme no histórico/relatórios.'],
      fillPerfectly: ['Preencha o mínimo correto.', 'Evite duplicidades.', 'Valide no fluxo e no relatório.'],
    };
  }

  return {
    match: pathname,
    title: group.titlePrefix,
    whatIs: group.whatIs,
    steps: group.steps,
    dependsOn: group.dependsOn,
    connectsWith: group.connectsWith,
    fillPerfectly: group.fillPerfectly,
    links: group.links,
    roadmapKey: group.roadmapKey,
  };
}

export function findHelpEntry(pathname: string): HelpEntry | null {
  const matches = HELP_CATALOG.filter((e) => pathname.startsWith(e.match));
  if (matches.length) return matches.sort((a, b) => b.match.length - a.match.length)[0] ?? null;
  return buildFallbackEntry(pathname);
}

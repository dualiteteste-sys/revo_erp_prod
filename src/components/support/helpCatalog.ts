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
  links?: HelpLink[];
  roadmapKey?: RoadmapGroupKey;
};

export const HELP_CATALOG: HelpEntry[] = [
  {
    match: '/app/partners',
    title: 'Clientes e Fornecedores: guia rápido',
    whatIs: 'Aqui você cadastra pessoas (cliente/fornecedor) que serão usadas em vendas, compras, OS e financeiro.',
    steps: ['Clique em “Novo” e preencha nome + tipo (cliente/fornecedor).', 'Salve e valide se aparece na lista.', 'Use o cadastro em um pedido/OS para confirmar o fluxo.'],
    links: [{ label: 'Abrir Roadmap (Cadastros)', href: '/app/dashboard?roadmap=cadastros', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/products',
    title: 'Produtos: guia rápido',
    whatIs: 'Produtos alimentam pedidos/PDV, compras, estoque e MRP-lite. O objetivo é manter SKU/unidade e estoque consistentes.',
    steps: ['Cadastre 1 produto ativo com SKU e unidade.', 'Defina mínimo/máximo e (opcional) lead time.', 'Abra Suprimentos → Relatórios e veja a reposição sugerida.'],
    links: [{ label: 'Suprimentos → Relatórios', href: '/app/suprimentos/relatorios', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/vendas/pedidos',
    title: 'Pedidos de venda: guia rápido',
    whatIs: 'Pedidos organizam venda no ERP e servem como base para expedição, histórico e financeiro.',
    steps: ['Crie um pedido com 1 cliente e 1 item.', 'Salve e confira total e status.', 'Se for expedir, avance para Vendas → Expedição.'],
    links: [{ label: 'Abrir Expedição', href: '/app/vendas/expedicao', kind: 'internal' }],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/pdv',
    title: 'PDV: guia rápido',
    whatIs: 'PDV é venda rápida com baixa de estoque e lançamento no financeiro. O foco aqui é velocidade sem bagunçar o caixa.',
    steps: ['Selecione uma conta corrente de recebimento.', 'Crie uma venda e finalize.', 'Sem internet: finalize mesmo assim e aguarde a sincronização automática.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/expedicao',
    title: 'Expedição: guia rápido',
    whatIs: 'Expedição dá rastreabilidade: status, tracking e SLA por pedido.',
    steps: ['Abra uma expedição para um pedido.', 'Avance status (Separação → Envio) e registre tracking.', 'Use filtros e “Atrasadas (SLA)” para pendências.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/suprimentos/compras',
    title: 'Ordens de compra: guia rápido',
    whatIs: 'Ordem de compra organiza recebimento e custo. Use rascunho/enviado e acompanhe o que falta receber.',
    steps: ['Crie uma OC em rascunho com 1 item.', 'Envie/registre recebimento quando chegar.', 'Veja impacto em estoque e custos (quando aplicável).'],
    links: [{ label: 'Abrir Recebimentos', href: '/app/suprimentos/recebimentos', kind: 'internal' }],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/relatorios',
    title: 'Relatórios de suprimentos: guia rápido',
    whatIs: 'Aqui você vê valorização/ABC e reposição. O objetivo é comprar o necessário com previsibilidade.',
    steps: ['Veja “Valorização & ABC” para entender onde está o capital.', 'Use “Baixo estoque / reposição” para urgências.', 'Use “Sugestão de Compra (MRP-lite)” considerando OCs e lead time.'],
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

export function findHelpEntry(pathname: string): HelpEntry | null {
  const matches = HELP_CATALOG.filter((e) => pathname.startsWith(e.match));
  if (!matches.length) return null;
  return matches.sort((a, b) => b.match.length - a.match.length)[0] ?? null;
}


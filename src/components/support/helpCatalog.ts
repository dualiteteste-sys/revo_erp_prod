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
  commonMistakes?: string[];
  links?: HelpLink[];
  roadmapKey?: RoadmapGroupKey;
};

export const HELP_CATALOG: HelpEntry[] = [
  // Cadastros (core)
  {
    match: '/app/partners',
    title: 'Guia Rápido de Clientes e Fornecedores',
    whatIs:
      'Aqui você mantém o “cadastro mestre” de pessoas (cliente/fornecedor). Um cadastro bem feito evita suporte e retrabalho em vendas, compras, OS, expedição e financeiro.',
    steps: [
      'Antes de criar: use a busca por nome/CPF/CNPJ para evitar duplicidade.',
      'Clique em “Novo” e defina o tipo (Cliente / Fornecedor / Ambos).',
      'Preencha o mínimo (nome/documento/contato) e salve.',
      'Valide no fluxo: use o cadastro em um Pedido/OS/Compra e confira se aparece corretamente nos selects.',
      'Se a operação tiver expedição/fiscal: complete endereço e dados fiscais quando necessário.',
    ],
    dependsOn: ['Empresa ativa', 'Permissão: Cadastros (create/update)'],
    connectsWith: ['Vendas', 'Suprimentos', 'Serviços (OS)', 'Financeiro'],
    fillPerfectly: [
      'Nome/Razão social e documento (CPF/CNPJ) corretos e sem caracteres “esquisitos”.',
      'Tipo correto: fornecedor para compras; cliente para vendas/OS (ambos quando fizer sentido).',
      'Contato principal (email/telefone) para cobrança e comunicação (reduz “não consegui falar com o cliente”).',
      'Endereço com CEP quando houver entrega/expedição ou emissão fiscal (quando aplicável).',
      'Observações úteis (ex.: regra de entrega, preferência de contato) só quando forem operacionais.',
    ],
    commonMistakes: [
      'Criar duplicado (ex.: “João”, “João Silva”, “JOAO SILVA”).',
      'Cadastrar fornecedor como cliente (ou vice‑versa) e depois “sumir” no módulo.',
      'Documento com zeros ou dígito errado (cobra/fiscal trava lá na frente).',
      'Endereço incompleto e expedição “vira suporte”.',
    ],
    links: [{ label: 'Abrir Roadmap (Cadastros)', href: '/app/dashboard?roadmap=cadastros', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/cadastros/grupos-produtos',
    title: 'Guia Rápido de Grupos de Produtos',
    whatIs:
      'Grupos organizam catálogo e relatórios (vendas, estoque e indústria). Um bom grupo facilita busca, filtros e visão de margem/ABC sem planilha.',
    steps: [
      'Crie um grupo com nome claro (ex.: “Elétricos”, “Revestimentos”, “Peças – Assistência”).',
      'Use o grupo nos Produtos e valide filtros nas listas/relatórios.',
      'Se o grupo não for usado: arquive/desative (quando disponível) para não poluir o catálogo.',
    ],
    dependsOn: ['Permissão: Cadastros (create/update)'],
    connectsWith: ['Produtos', 'Relatórios (Suprimentos/Vendas)', 'Indústria (quando aplicável)'],
    fillPerfectly: [
      'Nomes “autoexplicativos” (evita grupo duplicado).',
      'Poucos níveis e sem exagero (ex.: não criar 50 grupos com diferença mínima).',
      'Padronize o prefixo quando necessário (ex.: “Peças – …”).',
    ],
    commonMistakes: ['Criar grupos com nomes parecidos e perder padrão.', 'Deixar grupo vazio e confundir usuários.'],
    links: [{ label: 'Abrir Produtos', href: '/app/products', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/cadastros/unidades-medida',
    title: 'Guia Rápido de Unidades de Medida',
    whatIs:
      'Unidades de medida definem como você compra, armazena e vende (UN, CX, KG, M). Se a unidade estiver errada, estoque e financeiro “quebram” lá na frente.',
    steps: [
      'Cadastre as unidades que realmente usa (UN, CX, KG…).',
      'Revise se os Produtos usam a unidade correta.',
      'Valide no fluxo: crie um pedido e uma compra com o mesmo produto e confira quantidades.',
    ],
    dependsOn: ['Permissão: Cadastros (manage)'],
    connectsWith: ['Produtos', 'Compras/Recebimentos', 'Estoque', 'Indústria (BOM)'],
    fillPerfectly: ['Sigla curta e padrão (UN/CX/KG).', 'Descrição clara.', 'Evite duplicar a mesma unidade com sigla diferente.'],
    commonMistakes: ['Criar “UN” e “Unidade” duplicadas.', 'Trocar unidade de produto já em uso e gerar divergência.'],
    links: [{ label: 'Abrir Produtos', href: '/app/products', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/cadastros/embalagens',
    title: 'Guia Rápido de Embalagens',
    whatIs:
      'Embalagens ajudam expedição e logística: define como o item sai (caixa, envelope, pallet) e melhora custo/prazo e padrão de envio.',
    steps: [
      'Cadastre as embalagens que você realmente usa (com descrição).',
      'Use a embalagem no pedido/expedição (quando aplicável).',
      'Valide no fluxo: separar/embalar um pedido e conferir se fica registrado.',
    ],
    dependsOn: ['Permissão: Cadastros (create/update)'],
    connectsWith: ['Expedição', 'Vendas', 'Produtos'],
    fillPerfectly: ['Descrição clara (ex.: “Caixa 30x20x10”).', 'Evite duplicidade.', 'Use padrão de nomes para achar rápido.'],
    commonMistakes: ['Cadastrar embalagens “genéricas” demais e não ajudar na operação.', 'Duplicar embalagens com nomes diferentes.'],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/cadastros/vendedores',
    title: 'Guia Rápido de Vendedores',
    whatIs:
      'Vendedores permitem atribuir vendas, calcular comissões e acompanhar desempenho. O objetivo é: rastrear quem vendeu e reduzir disputa/comissão manual.',
    steps: [
      'Cadastre vendedores ativos com nome e (se aplicável) percentual de comissão padrão.',
      'Valide no fluxo: crie um pedido e selecione um vendedor.',
      'Abra Vendas → Comissões e confira se o vendedor aparece.',
    ],
    dependsOn: ['Permissão: Cadastros (create/update)'],
    connectsWith: ['Pedidos/PDV', 'Comissões', 'Metas de vendas', 'Relatórios'],
    fillPerfectly: ['Nome consistente (evita duplicidade).', 'Comissão padrão quando existir (reduz ajustes).', 'Desativar quando sair da empresa.'],
    commonMistakes: ['Criar vendedor duplicado.', 'Comissão padrão errada e precisar corrigir no mês.'],
    links: [{ label: 'Abrir Comissões', href: '/app/vendas/comissoes', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/carriers',
    title: 'Guia Rápido de Transportadoras',
    whatIs:
      'Transportadoras conectam expedição ao mundo real: rastreio, prazo e padrão de envio. Ajuda a reduzir suporte de entrega e manter histórico.',
    steps: [
      'Cadastre as transportadoras usadas (nome/documento/contatos).',
      'Valide em Expedição: selecione transportadora e informe tracking.',
      'Use filtros e histórico para ver atrasos e ocorrências.',
    ],
    dependsOn: ['Permissão: Cadastros (create/update)'],
    connectsWith: ['Expedição', 'Pedidos', 'Relatórios de vendas'],
    fillPerfectly: ['Contato comercial e operacional.', 'Documento correto.', 'Nome padronizado (sem duplicar).'],
    commonMistakes: ['Cadastrar como “Transportadora X” e “Transp. X” duplicadas.', 'Não registrar tracking e virar suporte.'],
    links: [{ label: 'Abrir Expedição', href: '/app/vendas/expedicao', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/services',
    title: 'Guia Rápido de Serviços (Cadastro)',
    whatIs:
      'Serviços são itens de OS/contratos/notas. Um cadastro bem feito deixa orçamento e faturamento consistentes e reduz ajuste manual.',
    steps: [
      'Cadastre um serviço com descrição clara e preço base.',
      'Valide em uma OS: adicione o serviço e confira total.',
      'Se houver impostos/regras básicas, preencha o mínimo necessário (quando aplicável).',
    ],
    dependsOn: ['Permissão: Cadastros (create/update)'],
    connectsWith: ['OS', 'Contratos', 'Notas de serviço', 'Financeiro'],
    fillPerfectly: ['Nome objetivo (ex.: “Troca de tela”, “Revisão preventiva”).', 'Preço base realista.', 'Categoria/grupo quando existir.'],
    commonMistakes: ['Criar serviço duplicado com nomes diferentes.', 'Preço base “zero” e virar ajuste sempre.'],
    links: [{ label: 'Abrir OS', href: '/app/ordens-de-servico', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },

  // Ferramentas rápidas
  {
    match: '/app/cep-search',
    title: 'Guia Rápido de Busca por CEP',
    whatIs: 'Ferramenta para preencher endereço rápido e reduzir erro manual em cadastros e expedição.',
    steps: ['Digite o CEP.', 'Copie/aplique o endereço no cadastro.', 'Revise número/complemento.'],
    dependsOn: ['Conexão com internet'],
    connectsWith: ['Cadastros (clientes/fornecedores)', 'Expedição'],
    fillPerfectly: ['Sempre revisar número/complemento.', 'Se o CEP não existir, preencher manualmente com cuidado.'],
    commonMistakes: ['Colar CEP com caracteres.', 'Não conferir bairro/cidade e gerar entrega errada.'],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/cnpj-search',
    title: 'Guia Rápido de Busca por CNPJ',
    whatIs: 'Ferramenta para preencher dados de empresa rápido e reduzir erro de digitação em razão social/endereço.',
    steps: ['Digite o CNPJ.', 'Confirme os dados retornados.', 'Revise contato e salve no cadastro.'],
    dependsOn: ['Conexão com internet'],
    connectsWith: ['Cadastros (clientes/fornecedores)', 'Fiscal (emitente/destinatário quando aplicável)'],
    fillPerfectly: ['Validar se o CNPJ é do cadastro correto.', 'Revisar e-mail/telefone manualmente.'],
    commonMistakes: ['Buscar o CNPJ errado e copiar dados para o cliente errado.'],
    roadmapKey: 'cadastros',
  },

  {
    match: '/app/products',
    title: 'Guia Rápido de Produtos',
    whatIs:
      'Produtos alimentam pedidos/PDV, compras, estoque e (quando existir) indústria/MRP. O objetivo é ter SKU, unidade, estoque e preços consistentes — sem planilha paralela.',
    steps: [
      'Cadastre 1 produto “do mundo real”: nome + SKU + unidade + status ativo.',
      'Se você usa reposição: defina mínimo/máximo e (opcional) lead time.',
      'Valide o estoque: faça 1 recebimento/movimentação e confira no Kardex.',
      'Valide a venda: use o produto em um Pedido/PDV e confira totais e baixa (se aplicável).',
      'Abra Suprimentos → Relatórios e veja se a reposição sugerida faz sentido.',
    ],
    dependsOn: ['Unidades de medida', 'Permissão: Cadastros (create/update)', 'Depósito (se multi-estoque estiver ativo)'],
    connectsWith: ['Vendas (Pedidos/PDV)', 'Suprimentos (Estoque/Compras/Recebimentos)', 'Indústria (BOM/MRP)', 'Financeiro (custos)'],
    fillPerfectly: [
      'SKU único e “humano” (ex.: sem espaços e sem variações aleatórias).',
      'Unidade correta (impacta estoque, compra e produção).',
      'Mín/Máx coerentes com sua rotina (evita sugestão “louca” de compra).',
      'Lead time realista (para reposição e promessas de entrega).',
      'Se fiscal/precificação exigir: tributos básicos preenchidos (quando aplicável).',
    ],
    commonMistakes: [
      'SKU vazio ou duplicado (vira confusão em expedição e relatórios).',
      'Unidade errada (compra em “CX” e vende em “UN” sem conversão).',
      'Produto inativo “some” no pedido/PDV e parece bug.',
      'Mín/Máx invertidos ou zerados e reposição não funciona.',
    ],
    links: [{ label: 'Suprimentos → Relatórios', href: '/app/suprimentos/relatorios', kind: 'internal' }],
    roadmapKey: 'cadastros',
  },

  // Vendas (demais módulos)
  {
    match: '/app/sales-dashboard',
    title: 'Guia Rápido do Painel de Vendas',
    whatIs:
      'O painel de vendas mostra KPIs e tendências (volume, conversão, ticket, metas). O objetivo é: tomar decisão sem exportar planilha.',
    steps: [
      'Selecione período e filtros (canal/vendedor).',
      'Clique nos KPIs para abrir a lista/relatório correspondente.',
      'Use metas para acompanhar performance e agir cedo.',
    ],
    dependsOn: ['Pedidos/PDV registrados', 'Permissão: Vendas (view)'],
    connectsWith: ['Pedidos', 'PDV', 'Metas', 'Relatórios'],
    fillPerfectly: ['Manter canal/vendedor preenchidos nos pedidos.', 'Usar período consistente (mês/semana).'],
    commonMistakes: ['Esperar KPI sem dados (sem registrar canal/vendedor).'],
    links: [{ label: 'Abrir Relatórios de Vendas', href: '/app/vendas/relatorios', kind: 'internal' }],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/crm',
    title: 'Guia Rápido de CRM',
    whatIs:
      'CRM organiza oportunidades (funil) antes da venda. O objetivo é: previsibilidade e follow-up sem “post-it”.',
    steps: [
      'Crie uma oportunidade com cliente e valor estimado.',
      'Avance etapas do funil (com motivo ao perder).',
      'Ao ganhar: gere proposta/pedido (quando disponível) para não duplicar trabalho.',
    ],
    dependsOn: ['Clientes', 'Permissão: CRM/Vendas (create/update)'],
    connectsWith: ['Propostas', 'Pedidos', 'Metas (quando aplicável)'],
    fillPerfectly: ['Próximo passo e data de follow-up.', 'Valor estimado realista.', 'Motivo de perda padronizado (melhora aprendizado).'],
    commonMistakes: ['Criar oportunidade sem follow-up e “morrer” no funil.', 'Não marcar perdido e inflar pipeline.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/metas',
    title: 'Guia Rápido de Metas de Vendas',
    whatIs:
      'Metas dão direção: você define objetivo por período e acompanha realização. O objetivo é alinhar time e agir antes de “fechar o mês”.',
    steps: [
      'Defina meta por período (mês/semana) e, se aplicável, por vendedor.',
      'Acompanhe no painel e ajuste estratégia (campanha, mix, comissão).',
      'Use histórico para ver evolução.',
    ],
    dependsOn: ['Vendedores (quando por vendedor)', 'Permissão: Vendas (manage)'],
    connectsWith: ['Painel de vendas', 'Comissões', 'Relatórios'],
    fillPerfectly: ['Meta realista e por período fixo.', 'Vendedor correto.', 'Revisar metas em ciclos curtos no início.'],
    commonMistakes: ['Criar metas sem vendedor/canal e depois não conseguir analisar.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/propostas',
    title: 'Guia Rápido de Propostas Comerciais',
    whatIs:
      'Propostas estruturam a negociação antes do pedido. O objetivo é: padronizar preço, evitar erro e acelerar fechamento.',
    steps: [
      'Crie uma proposta com cliente e itens.',
      'Revise preços/descontos e valide margens (quando disponível).',
      'Envie e acompanhe status (enviado/aceito/recusado).',
      'Ao aceitar: gere pedido para não re-digitar.',
    ],
    dependsOn: ['Clientes', 'Produtos/Serviços', 'Permissão: Vendas (create/update)'],
    connectsWith: ['CRM', 'Pedidos', 'Relatórios de vendas'],
    fillPerfectly: ['Prazo e condições claros.', 'Itens com unidade/quantidade corretos.', 'Registrar motivo de recusa quando houver.'],
    commonMistakes: ['Refazer proposta “do zero” em vez de duplicar.', 'Desconto fora de permissão e travar no envio.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/comissoes',
    title: 'Guia Rápido de Comissões',
    whatIs:
      'Comissões calculam e auditam remuneração variável. O objetivo é: transparência e evitar discussão no fechamento.',
    steps: [
      'Garanta vendedor no pedido/PDV e comissão padrão (se usar).',
      'Abra comissões por período e revise pendências.',
      'Feche/aprove quando estiver correto (conforme o processo interno).',
    ],
    dependsOn: ['Vendedores', 'Pedidos/PDV com vendedor', 'Permissão: Vendas/Financeiro (view)'],
    connectsWith: ['Pedidos/PDV', 'Metas', 'Relatórios'],
    fillPerfectly: ['Vendedor sempre preenchido.', 'Política de comissão documentada.', 'Ajustes sempre com motivo.'],
    commonMistakes: ['Pedido sem vendedor “não entra” na comissão.', 'Comissão padrão errada e retrabalho no mês.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/automacoes',
    title: 'Guia Rápido do Painel de Automação (Vendas)',
    whatIs:
      'Automação executa rotinas (ex.: lembretes, reprocessos, ações recorrentes) para reduzir trabalho manual. O objetivo é: consistência e menos esquecimento.',
    steps: [
      'Crie uma automação com objetivo claro e gatilho simples.',
      'Use “Validar” antes de ativar.',
      'Teste em pequena escala e monitore logs/saúde.',
    ],
    dependsOn: ['Permissão: Ops/Automação (manage)'],
    connectsWith: ['Vendas', 'Suporte (logs)', 'Desenvolvedor (Saúde)'],
    fillPerfectly: ['Um gatilho por automação (evita efeito cascata).', 'Logs ativados e monitoramento.'],
    commonMistakes: ['Criar automação genérica demais e disparar em massa.', 'Ativar sem validar e gerar ruído.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/devolucoes',
    title: 'Guia Rápido de Devolução de Vendas',
    whatIs:
      'Devolução desfaz venda de forma rastreável: ajusta estoque/financeiro e mantém histórico. O objetivo é: correção sem “gambiarra”.',
    steps: [
      'Selecione o pedido/itens para devolver.',
      'Defina motivo e quantidades.',
      'Aplique e confira reflexo (estoque + financeiro, quando aplicável).',
      'Use histórico para auditoria.',
    ],
    dependsOn: ['Pedidos/PDV concluídos', 'Permissão: Vendas (manage)', 'Estoque (se baixa habilitada)'],
    connectsWith: ['Estoque', 'Financeiro', 'Relatórios de vendas'],
    fillPerfectly: ['Motivo sempre preenchido.', 'Quantidades corretas.', 'Estorno financeiro alinhado ao processo.'],
    commonMistakes: ['Ajustar estoque manualmente em vez de devolver.', 'Devolver sem motivo (vira suporte).'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/relatorios',
    title: 'Guia Rápido de Relatórios de Vendas',
    whatIs:
      'Relatórios de vendas ajudam a enxergar faturamento, mix, canais e desempenho. O objetivo é: fechar o período com confiança e agir no que importa.',
    steps: [
      'Use filtros de período e canal (PDV/online).',
      'Confira devoluções para entender faturamento líquido.',
      'Se houver vendedor: filtre por vendedor e compare com metas.',
    ],
    dependsOn: ['Pedidos/PDV registrados', 'Permissão: Vendas (view)'],
    connectsWith: ['Pedidos/PDV', 'Metas', 'Comissões', 'Expedição'],
    fillPerfectly: ['Canal/vendedor preenchidos nos pedidos.', 'Devoluções registradas corretamente.'],
    commonMistakes: ['Relatório “não bate” porque devoluções não foram registradas.', 'Misturar períodos sem padronizar.'],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/pedidos',
    title: 'Guia Rápido de Pedidos de Venda',
    whatIs:
      'Pedidos são o “centro” da venda: organizam itens, preços, histórico e servem de base para expedição e (quando habilitado) financeiro/fiscal.',
    steps: [
      'Crie um pedido com 1 cliente e 1 item.',
      'Revise preços/descontos (respeitando permissões) e confirme totais.',
      'Salve e confira status + histórico/timeline.',
      'Se houver entrega: avance para Expedição e registre status/tracking.',
      'Se houver cobrança: confira se o lançamento/integração esperada foi gerada (quando aplicável).',
    ],
    dependsOn: ['Clientes', 'Produtos', 'Permissão: Vendas (create/update)'],
    connectsWith: ['Expedição', 'Financeiro (A Receber)', 'Fiscal (NF-e quando habilitado)'],
    fillPerfectly: [
      'Cliente correto (evita erros de entrega/cobrança).',
      'Itens com unidade e quantidade coerentes (impacta estoque).',
      'Descontos com justificativa (quando exigido por permissão).',
      'Canal (PDV/online) e observações para expedição.',
    ],
    commonMistakes: [
      'Criar pedido com cliente errado e só descobrir na expedição/cobrança.',
      'Aplicar desconto fora da permissão e travar no checkout.',
      'Quantidade/unidade incoerentes (estoque “quebra”).',
      'Esquecer observações de entrega e virar suporte.',
    ],
    links: [{ label: 'Abrir Expedição', href: '/app/vendas/expedicao', kind: 'internal' }],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/pdv',
    title: 'Guia Rápido do PDV',
    whatIs:
      'PDV é venda rápida com baixa de estoque (quando aplicável) e impacto no financeiro. O foco é: velocidade com controle — sem “bagunçar o caixa”.',
    steps: [
      'Garanta que existe uma conta corrente padrão de recebimentos (Tesouraria).',
      'Selecione o caixa (quando existir) e confirme que está aberto.',
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
    commonMistakes: [
      'Tentar vender sem conta corrente padrão (bloqueia no final).',
      'Finalizar duas vezes (clique duplo) — o sistema deve bloquear, mas aguarde o feedback.',
      'Em offline: fechar a aba antes de sincronizar (deixe o badge “pendente” resolver).',
    ],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/expedicao',
    title: 'Guia Rápido de Expedição',
    whatIs:
      'Expedição transforma pedido em entrega rastreável: separação, envio, tracking e SLA. O objetivo é reduzir “cadê meu pedido?” e dar previsibilidade.',
    steps: [
      'Abra uma expedição para um pedido.',
      'Na separação: confirme itens e avance o status (Separação → Embalagem → Envio).',
      'Use “Escanear” para localizar pedido/tracking rápido (WMS light).',
      'Registre tracking e transportadora (quando aplicável).',
      'Use filtros e “Atrasadas (SLA)” para pendências.',
    ],
    dependsOn: ['Pedidos criados', 'Transportadora (quando aplicável)', 'Permissão: Expedição (update)'],
    connectsWith: ['Pedidos', 'Clientes (endereço)', 'Relatórios de vendas'],
    fillPerfectly: [
      'Tracking e transportadora corretos (evita suporte e “cadê meu pedido”).',
      'Status atualizado no momento certo (SLA e pendências ficam confiáveis).',
      'Observações quando houver ocorrência (extravio/dano).',
    ],
    commonMistakes: [
      'Enviar sem tracking quando o cliente espera rastreio.',
      'Marcar como enviado sem separar/embalar (vira divergência e retrabalho).',
      'Não registrar ocorrência (perde histórico para suporte).',
    ],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/suprimentos/recebimentos',
    title: 'Guia Rápido de Recebimentos (Suprimentos)',
    whatIs:
      'Recebimentos é onde você traz entradas (via XML ou manual) para dentro do ERP, garantindo estoque e custo confiáveis. O foco é: rastrear o que entrou e fechar a conferência sem divergência.',
    steps: [
      'Importe um XML (ou crie recebimento manual) e confira fornecedor/datas.',
      'Abra o recebimento e faça a conferência (escaneando itens quando possível).',
      'Resolva divergências e finalize para refletir no estoque.',
      'Se houver OC: vincule o recebimento à compra para rastreabilidade.',
    ],
    dependsOn: ['Fornecedores', 'Produtos', 'Permissão: Suprimentos (view/update)'],
    connectsWith: ['Estoque (kardex/saldo)', 'Compras (OC)', 'Financeiro (custos/A Pagar quando aplicável)'],
    fillPerfectly: [
      'Fornecedor correto (evita lançar entrada “na empresa errada”).',
      'Itens vinculados ao produto correto (SKU/unidade).',
      'Finalizar somente quando a conferência estiver fiel ao físico.',
    ],
    commonMistakes: [
      'Importar XML e nunca finalizar conferência (estoque “não aparece”).',
      'Vincular item ao produto errado (explode divergência depois).',
      'Ajustar no estoque manualmente em vez de fechar o recebimento.',
    ],
    links: [{ label: 'Abrir Compras', href: '/app/suprimentos/compras', kind: 'internal' }],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/recebimento-manual',
    title: 'Guia Rápido de Recebimento Manual',
    whatIs:
      'Recebimento manual serve para entradas sem XML. O objetivo é registrar a entrada com rastreabilidade e refletir corretamente no estoque.',
    steps: [
      'Crie o recebimento manual com fornecedor e data.',
      'Adicione itens e quantidades com unidade correta.',
      'Faça a conferência e finalize para refletir no estoque.',
    ],
    dependsOn: ['Fornecedores', 'Produtos', 'Permissão: Suprimentos (update)'],
    connectsWith: ['Estoque', 'Compras (quando houver OC)', 'Financeiro (custos)'],
    fillPerfectly: ['Descrição clara e referência (nota/pedido) quando existir.', 'Unidade correta.', 'Finalizar só depois de revisar.'],
    commonMistakes: ['Criar manual sem fornecedor e perder histórico.', 'Unidade errada e divergência de saldo.'],
    links: [{ label: 'Abrir Estoque', href: '/app/suprimentos/estoque', kind: 'internal' }],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/recebimento',
    title: 'Guia Rápido de Conferência de Recebimento',
    whatIs:
      'Conferência é o ponto de controle do estoque: ela garante que o que entrou (XML/nota) bate com o físico, e que custo/saldo ficam confiáveis.',
    steps: [
      'Vincule produtos do sistema para itens que vieram só do XML.',
      'Use “Escanear código” (EAN/SKU/Cód. do item) para localizar o item e somar na conferência (WMS light).',
      'Resolva divergências (quantidade diferente / item faltando).',
      'Ajuste custos adicionais (frete/impostos) se necessário e finalize.',
    ],
    dependsOn: ['Recebimento criado (XML ou manual)', 'Produtos (para vincular)', 'Permissão: Suprimentos (update)'],
    connectsWith: ['Estoque (saldo/kardex)', 'Compras (OC)', 'Financeiro (custos)'],
    fillPerfectly: [
      'Vincule o produto correto (SKU/unidade) antes de finalizar.',
      'Conferência não deve “passar do XML” sem motivo (evita saldo errado).',
      'Se houver frete/impostos, rateie antes de finalizar (custo médio confiável).',
    ],
    commonMistakes: [
      'Finalizar recebimento sem vincular itens (estoque fica “órfão”).',
      'Conferir acima do XML e criar saldo “fantasma”.',
      'Ignorar custo/frete e depois “margem some”.',
    ],
    links: [{ label: 'Abrir Estoque', href: '/app/suprimentos/estoque', kind: 'internal' }],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/compras',
    title: 'Guia Rápido de Ordens de Compra',
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
    commonMistakes: [
      'Receber por fora da OC e perder rastreabilidade.',
      'Não registrar recebimento parcial e “sumir” o pendente.',
      'Comprar em unidade diferente da cadastrada e gerar divergência.',
    ],
    links: [{ label: 'Abrir Recebimentos', href: '/app/suprimentos/recebimentos', kind: 'internal' }],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/relatorios',
    title: 'Guia Rápido de Relatórios de Suprimentos',
    whatIs: 'Aqui você vê valorização/ABC e reposição. O objetivo é comprar o necessário com previsibilidade.',
    steps: [
      'Veja “Valorização & ABC” para entender onde está o capital.',
      'Use “Baixo estoque / reposição” para urgências.',
      'Use “Sugestão de Compra (MRP-lite)” considerando OCs e lead time.',
    ],
    dependsOn: ['Produtos com mínimo/máximo', 'Movimentações/recebimentos registrados'],
    connectsWith: ['Compras', 'Estoque', 'Produtos'],
    fillPerfectly: ['Mín/máx coerentes.', 'Lead time realista.', 'OC aberta registrada (evita sugerir compra duplicada).'],
    commonMistakes: [
      'Esperar sugestão sem configurar mínimo/máximo.',
      'Ignorar OCs abertas e comprar duplicado.',
      'Não registrar lead time e prometer reposição irreal.',
    ],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/suprimentos/estoque',
    title: 'Guia Rápido de Estoque',
    whatIs:
      'Aqui você controla saldo e movimentações com histórico (Kardex). Com depósitos, você enxerga por local e transfere sem “planilha paralela”.',
    steps: [
      'Selecione o depósito (se existir) e use a busca para encontrar o produto.',
      'Clique em “Movimentar” para registrar entrada/saída/ajustes (ou transferência entre depósitos).',
      'Abra o “Kardex” para validar histórico e exporte CSV quando precisar.',
    ],
    dependsOn: ['Produtos', 'Depósitos (se multi-estoque estiver ativo)', 'Permissão: Suprimentos (update)'],
    connectsWith: ['Compras/Recebimentos', 'Vendas/PDV', 'Indústria (consumo e apontamentos)'],
    fillPerfectly: ['Sempre registrar a referência (pedido/OC/OP) quando existir.', 'Evitar ajustes manuais sem justificativa.', 'Transferências devem sair de um local e entrar em outro (saldo bate).'],
    commonMistakes: [
      'Ajustar manualmente sem motivo (quebra auditoria e vira suporte).',
      'Transferir sem registrar entrada/saída (saldo não bate).',
      'Não conferir Kardex quando “algo sumiu”.',
    ],
    links: [
      { label: 'Abrir Compras', href: '/app/suprimentos/compras', kind: 'internal' },
      { label: 'Abrir Recebimentos', href: '/app/suprimentos/recebimentos', kind: 'internal' },
    ],
    roadmapKey: 'suprimentos',
  },
  {
    match: '/app/financeiro/tesouraria',
    title: 'Guia Rápido de Tesouraria',
    whatIs:
      'Tesouraria é o “coração” do financeiro: contas correntes, lançamentos, extratos e conciliação. Quando a Tesouraria está redonda, o restante (pagar/receber/relatórios/PDV) fica confiável.',
    steps: [
      'Crie/valide pelo menos 1 conta corrente e marque padrões (recebimentos/pagamentos) quando fizer sentido.',
      'Registre lançamentos (entrada/saída) com descrição clara e data correta.',
      'Importe extrato (quando aplicável) e concilie: o saldo deixa de ser “achismo”.',
      'Use filtros de período para fechar o mês e conferir relatórios (caixa e faturamento).',
    ],
    dependsOn: ['Permissão: Tesouraria (view/create/update)', 'Conta corrente cadastrada'],
    connectsWith: ['PDV (recebimentos)', 'Contas a pagar/receber', 'Relatórios financeiros', 'Serviços (OS → financeiro)'],
    fillPerfectly: [
      'Conta correta (evita lançar “no lugar errado”).',
      'Descrição que ajude a auditar (ex.: “Venda PDV #123”, “Fornecedor X – OC #45”).',
      'Conciliação frequente reduz divergência e suporte.',
      'Se centro de custo estiver ativo: preencher sempre (relatórios batem).',
    ],
    commonMistakes: [
      'Trabalhar sem conciliação e só descobrir divergência no fim do mês.',
      'Lançar sem descrição e depois “ninguém sabe o que é”.',
      'Misturar contas correntes e perder controle do caixa real.',
    ],
    links: [{ label: 'Abrir Contas a Receber', href: '/app/financeiro/contas-a-receber', kind: 'internal' }],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/financeiro/contas-a-receber',
    title: 'Guia Rápido de Contas a Receber',
    whatIs:
      'Contas a Receber controla o que entra no caixa: parcelas, vencimentos, baixas e estornos. O objetivo é: previsibilidade de recebimento e auditoria.',
    steps: [
      'Crie uma conta (ou gere a partir de Venda/OS quando aplicável).',
      'Defina vencimento, valor e (se ativo) centro de custo.',
      'Baixe/estorne com motivo e confira reflexo na Tesouraria.',
      'Use filtros (período/status) para acompanhar inadimplência.',
    ],
    dependsOn: ['Tesouraria (contas correntes)', 'Permissão: Financeiro (view/update)'],
    connectsWith: ['Tesouraria (movimentações)', 'Vendas/PDV', 'Serviços (OS)'],
    fillPerfectly: [
      'Vencimento e valor corretos (base do fluxo de caixa).',
      'Baixa sempre na conta corrente certa.',
      'Estorno com motivo (auditoria e suporte).',
    ],
    commonMistakes: [
      'Baixar na conta errada e “sumir” saldo.',
      'Editar valores depois de baixado (evite; prefira estorno + refazer).',
      'Misturar competência e data de pagamento sem padrão.',
    ],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/financeiro/contas-a-pagar',
    title: 'Guia Rápido de Contas a Pagar',
    whatIs:
      'Contas a Pagar controla o que sai do caixa: títulos, vencimentos, baixas e estornos. O objetivo é: pagar certo, no prazo, com trilha auditável.',
    steps: [
      'Crie uma conta (ou gere a partir de Compras/Recebimentos quando aplicável).',
      'Defina vencimento, valor e (se ativo) centro de custo.',
      'Baixe/estorne com motivo e confira reflexo na Tesouraria.',
      'Use filtros e relatórios para prever caixa e evitar atrasos.',
    ],
    dependsOn: ['Tesouraria (contas correntes)', 'Permissão: Financeiro (view/update)'],
    connectsWith: ['Tesouraria (movimentações)', 'Suprimentos (compras/recebimentos)', 'Relatórios financeiros'],
    fillPerfectly: [
      'Fornecedor correto e referência (OC/recebimento) quando existir.',
      'Baixa sempre na conta corrente certa.',
      'Estorno com motivo (reduz suporte).',
    ],
    commonMistakes: [
      'Pagar em duplicidade (prefira conciliação e referências).',
      'Baixar fora do mês e perder visão do caixa.',
      'Apagar histórico em vez de estornar.',
    ],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/financeiro/extrato',
    title: 'Guia Rápido de Extrato Bancário',
    whatIs:
      'Extrato bancário é a ponte entre o banco e o ERP. Importando e conciliando, o saldo do sistema passa a bater com o saldo real, reduzindo divergência e suporte.',
    steps: [
      'Importe o extrato (arquivo/integração, conforme disponível).',
      'Revise lançamentos sem match e vincule ao que já existe (receber/pagar/PDV).',
      'Crie regras simples de conciliação para reduzir esforço recorrente.',
      'Confira o saldo por conta corrente.',
    ],
    dependsOn: ['Tesouraria (contas correntes)', 'Permissão: Tesouraria (view/update)'],
    connectsWith: ['Contas a pagar/receber', 'PDV', 'Relatórios'],
    fillPerfectly: ['Importar no banco/conta corretos.', 'Conciliar antes do fechamento do período.', 'Criar regras para itens recorrentes.'],
    commonMistakes: [
      'Conciliar “no olho” e deixar itens sem vínculo.',
      'Importar extrato na conta errada.',
      'Ignorar itens pequenos recorrentes (somam e viram divergência).',
    ],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/financeiro/relatorios',
    title: 'Guia Rápido de Relatórios Financeiros',
    whatIs:
      'Relatórios financeiros mostram se o caixa e o resultado batem com a operação. O objetivo é: fechar período com confiança e sem retrabalho.',
    steps: [
      'Use filtros de período para comparar meses/semana.',
      'Abra Tesouraria/Contas a pagar/receber pelos CTAs quando houver divergência.',
      'Se centro de custo estiver ativo: valide relatório por centro e DRE simplificada.',
    ],
    dependsOn: ['Movimentações na Tesouraria', 'Permissão: Financeiro (view)'],
    connectsWith: ['Tesouraria', 'Contas a pagar/receber', 'Vendas', 'Serviços', 'Suprimentos (custos)'],
    fillPerfectly: ['Fechar com conciliação feita.', 'Usar o mesmo critério de datas (competência vs pagamento).'],
    commonMistakes: [
      'Ver relatório sem conciliar e concluir “está errado”.',
      'Misturar período de competência e pagamento sem padrão.',
    ],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/servicos/os',
    title: 'Guia Rápido de Ordem de Serviço',
    whatIs:
      'OS é o fluxo ponta a ponta de serviços (assistência técnica inclusive): status, agenda, anexos, checklists e histórico. O objetivo é: operação previsível + cliente bem informado + financeiro amarrado.',
    steps: [
      'Crie uma OS para um cliente e descreva o problema com clareza.',
      'Se aplicável: cadastre/vincule o equipamento (serial/IMEI/acessórios/fotos).',
      'Avance status conforme o checklist do tipo de serviço (diagnóstico → execução → teste → entrega).',
      'Registre anexos e eventos importantes (orçamento, aprovação, ocorrências).',
      'Quando gerar cobrança: crie parcelas e confira auditoria (quem/quando/valor).',
    ],
    dependsOn: ['Clientes', 'Permissão: OS (create/update)', 'Tesouraria (se gerar financeiro)'],
    connectsWith: ['Financeiro (parcelas/estornos)', 'Cadastros (serviços/produtos)', 'Suprimentos (peças/estoque)'],
    fillPerfectly: [
      'Defeito/solicitação objetiva (reduz “liga e pergunta de novo”).',
      'Serial/IMEI correto (evita trocar equipamento do cliente).',
      'Checklist seguido (evita retrabalho e retorno).',
      'Fotos e anexos antes/depois (prova e transparência).',
    ],
    commonMistakes: [
      'Pular status/checklist e “perder” onde a OS está.',
      'Não registrar aprovação do orçamento e virar conflito.',
      'Não anexar evidências (fotos) em casos sensíveis.',
    ],
    links: [{ label: 'Abrir Clientes', href: '/app/partners', kind: 'internal' }],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/servicos/contratos',
    title: 'Guia Rápido de Contratos de Serviços',
    whatIs:
      'Contratos organizam recorrência (serviços mensais, manutenção, planos). O objetivo é reduzir suporte e garantir cobrança previsível.',
    steps: [
      'Crie um contrato com cliente, vigência e itens/serviços recorrentes.',
      'Defina regra de cobrança (mensal/trimestral) e dia de vencimento.',
      'Gere cobranças do período e valide no Financeiro.',
      'Use histórico para saber “o que foi cobrado e por quê”.',
    ],
    dependsOn: ['Clientes', 'Serviços cadastrados (quando aplicável)', 'Permissão: Serviços (create/update)'],
    connectsWith: ['Cobranças (Serviços)', 'Financeiro (A Receber)', 'Relatórios de serviços'],
    fillPerfectly: ['Dia de vencimento coerente.', 'Itens/valores claros.', 'Vigência e reajustes bem definidos (se aplicável).'],
    commonMistakes: [
      'Criar contrato sem regra de cobrança e virar “manual todo mês”.',
      'Alterar valor sem registrar histórico.',
      'Esquecer de encerrar contrato e continuar cobrando.',
    ],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/servicos/cobrancas',
    title: 'Guia Rápido de Cobranças (Serviços)',
    whatIs:
      'Cobranças é onde você acompanha e executa a cobrança recorrente/avulsa de serviços. O objetivo é: receber no prazo e manter trilha auditável.',
    steps: [
      'Gere cobranças a partir de contratos (quando aplicável) ou crie avulsa.',
      'Envie/registre comunicação (template) e acompanhe status.',
      'Baixe/estorne no Financeiro e mantenha histórico.',
    ],
    dependsOn: ['Contratos (quando recorrente)', 'Financeiro (A Receber)', 'Permissão: Serviços (view/update)'],
    connectsWith: ['Financeiro', 'Contratos', 'Clientes (contato)'],
    fillPerfectly: ['Contato correto do cliente.', 'Mensagens objetivas.', 'Registrar motivo ao estornar/ajustar.'],
    commonMistakes: [
      'Cobrar sem validar contato e “ninguém recebe”.',
      'Não registrar histórico e perder contexto no suporte.',
    ],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/servicos/notas',
    title: 'Guia Rápido de Notas de Serviço',
    whatIs:
      'Notas de serviço registram a prestação e ajudam a organizar faturamento e histórico. O objetivo é: rastreabilidade e conformidade (quando a emissão fiscal estiver habilitada).',
    steps: [
      'Crie uma nota vinculada ao cliente/OS/contrato quando fizer sentido.',
      'Revise descrição, valores e datas.',
      'Salve e use filtros para acompanhar o período.',
    ],
    dependsOn: ['Clientes', 'Permissão: Serviços (view/create)'],
    connectsWith: ['OS', 'Contratos', 'Relatórios de serviços', 'Fiscal (quando aplicável)'],
    fillPerfectly: ['Descrição clara do serviço.', 'Referência (OS/contrato) quando existir.', 'Datas coerentes com competência.'],
    commonMistakes: [
      'Criar nota sem referência e depois “não sei de onde veio”.',
      'Misturar datas e perder relatório por período.',
    ],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/servicos/relatorios',
    title: 'Guia Rápido de Relatórios de Serviços',
    whatIs:
      'Relatórios de serviços mostram volume, produtividade e faturamento por período. O objetivo é: enxergar gargalos e fechar o mês sem planilha.',
    steps: [
      'Use filtros (período/status) para ver tendências.',
      'Abra OS/contratos a partir do relatório quando precisar de detalhe.',
      'Combine com Financeiro para validar faturamento/recebimentos.',
    ],
    dependsOn: ['OS/contratos registrados', 'Permissão: Serviços (view)'],
    connectsWith: ['OS', 'Contratos', 'Financeiro', 'Dashboard'],
    fillPerfectly: ['Manter status e datas corretas nas OS.', 'Registrar aprovações e eventos importantes.'],
    commonMistakes: ['Relatório “não bate” porque status/datas não foram atualizados no fluxo.'],
    roadmapKey: 'servicos',
  },

  // Central de relatórios (hub)
  {
    match: '/app/relatorios',
    title: 'Guia Rápido da Central de Relatórios',
    whatIs:
      'Centraliza relatórios por área (vendas, suprimentos, financeiro, serviços, indústria). O objetivo é: encontrar rápido e reduzir “onde vejo isso?”.',
    steps: ['Escolha a área (Vendas/Suprimentos/Financeiro…).', 'Aplique filtros de período.', 'Use os CTAs para ir ao módulo de origem quando precisar detalhar.'],
    dependsOn: ['Permissão de leitura dos módulos'],
    connectsWith: ['Vendas', 'Suprimentos', 'Financeiro', 'Serviços', 'Indústria'],
    fillPerfectly: ['Manter datas/status corretos no fluxo (relatório depende do dado).'],
    commonMistakes: ['Esperar relatório “mágico” sem registrar o fluxo no módulo de origem.'],
  },

  // Fiscal (NF-e) — mesmo deixando NF por último, o guia precisa ser específico
  {
    match: '/app/fiscal/nfe/configuracoes',
    title: 'Guia Rápido de Configurações de NF-e',
    whatIs:
      'Configurações de NF-e definem emitente, série/numeração e ambiente. O objetivo é evitar rejeição e suporte na hora de emitir.',
    steps: [
      'Preencha emitente (dados da empresa) e confirme ambiente (homologação/produção).',
      'Defina série e numeração (ponto crítico para não duplicar).',
      'Valide um rascunho antes de emitir (quando a emissão estiver ativa).',
    ],
    dependsOn: ['Dados da empresa', 'Permissão: Fiscal (manage)', 'Plano com NF-e (quando habilitado)'],
    connectsWith: ['Pedidos/PDV', 'Produtos (tributação)', 'Clientes (dados fiscais)', 'Emissões NF-e'],
    fillPerfectly: ['Série/numeração sem conflito.', 'CNPJ/IE corretos.', 'Ambiente correto (produção ≠ homologação).'],
    commonMistakes: ['Numeração duplicada.', 'Ambiente errado e “não emite”.', 'Emitente incompleto e rejeição.'],
    roadmapKey: 'fiscal',
  },
  {
    match: '/app/fiscal/nfe',
    title: 'Guia Rápido de Emissões de NF-e',
    whatIs:
      'Aqui você acompanha emissões e status (rascunho, autorizada, rejeitada). O objetivo é ter trilha e resolver rejeição sem “adivinhar”.',
    steps: [
      'Crie/abra um rascunho e revise dados principais.',
      'Emita e acompanhe o status.',
      'Se rejeitar: corrija o campo indicado e reemita (sem duplicar).',
      'Quando disponível: baixe/consulte XML/DANFE.',
    ],
    dependsOn: ['Configurações de NF-e', 'Clientes/Produtos com dados fiscais (quando aplicável)'],
    connectsWith: ['Pedidos/PDV', 'Configurações de NF-e', 'Logs/Timeline'],
    fillPerfectly: ['Destinatário e itens coerentes.', 'Tributos básicos preenchidos quando necessário.', 'Não editar após autorizada sem fluxo correto.'],
    commonMistakes: ['Tentar emitir sem configurar emitente/série.', 'Ignorar rejeição e “tentar de novo” sem corrigir.'],
    roadmapKey: 'fiscal',
  },

  // Financeiro (centros de custo e cobranças)
  {
    match: '/app/financeiro/centros-de-custo',
    title: 'Guia Rápido de Centros de Custo',
    whatIs:
      'Centros de custo organizam despesas/receitas por área (ex.: Comercial, Oficina, Produção). O objetivo é enxergar DRE simplificada e reduzir discussão no fechamento.',
    steps: [
      'Crie centros (com nomes claros) e defina padrões quando necessário.',
      'No lançamento (pagar/receber/tesouraria), preencha centro de custo.',
      'Abra relatórios por centro e valide se as somas batem.',
    ],
    dependsOn: ['Permissão: Financeiro (manage)', 'Lançamentos no financeiro'],
    connectsWith: ['Tesouraria', 'Contas a pagar/receber', 'Relatórios financeiros'],
    fillPerfectly: ['Poucos centros (evita confusão).', 'Nome padronizado.', 'Preencher sempre que estiver ativo.'],
    commonMistakes: ['Criar centros demais e ninguém usa.', 'Não preencher e depois “relatório não funciona”.'],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/financeiro/cobrancas',
    title: 'Guia Rápido de Cobrança Bancária',
    whatIs:
      'Cobrança bancária automatiza recebimentos (quando aplicável): remessa/retorno, conciliação e histórico. O objetivo é reduzir trabalho manual e inadimplência.',
    steps: ['Configure conta e parâmetros (quando aplicável).', 'Gere cobranças e acompanhe status.', 'Importe retorno/conciliação e confirme baixas.'],
    dependsOn: ['Tesouraria (conta corrente)', 'Permissão: Financeiro (manage)', 'Integração/conta habilitada (quando aplicável)'],
    connectsWith: ['Contas a receber', 'Extrato/Conciliação', 'Relatórios'],
    fillPerfectly: ['Dados bancários corretos.', 'Vencimentos e valores coerentes.', 'Conciliação frequente.'],
    commonMistakes: ['Configurar conta errada.', 'Gerar cobrança sem validar cliente/contato.'],
    roadmapKey: 'financeiro',
  },

  // RH & Qualidade (guias específicos)
  {
    match: '/app/rh/dashboard',
    title: 'Guia Rápido do Dashboard de RH',
    whatIs:
      'O dashboard de RH mostra indicadores (treinamentos, cargos, compliance). O objetivo é enxergar risco operacional e agir antes de virar incidente.',
    steps: ['Selecione período/filtros.', 'Clique nos cards para abrir listas.', 'Use alertas de vencimento para priorizar treinamentos.'],
    dependsOn: ['Colaboradores, cargos e treinamentos cadastrados'],
    connectsWith: ['Colaboradores', 'Cargos', 'Treinamentos', 'Matriz de competências'],
    fillPerfectly: ['Manter status e datas de validade corretos.', 'Registrar conclusões com evidência quando aplicável.'],
    commonMistakes: ['Esperar KPI sem preencher cadastros base.', 'Não atualizar status de treinamento e “parecer errado”.'],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/rh/colaboradores',
    title: 'Guia Rápido de Colaboradores',
    whatIs:
      'Colaboradores são a base do RH: vínculo com cargos, treinamentos e competências. O objetivo é operar com compliance e menos risco.',
    steps: ['Cadastre colaborador com dados mínimos.', 'Vincule cargo e (quando necessário) unidade.', 'Atribua treinamentos obrigatórios e acompanhe vencimentos.'],
    dependsOn: ['Cargos cadastrados', 'Permissão: RH (create/update)'],
    connectsWith: ['Cargos', 'Treinamentos', 'Competências', 'Matriz'],
    fillPerfectly: ['Nome/documento corretos.', 'Cargo coerente.', 'Datas de admissão/validade corretas.'],
    commonMistakes: ['Cadastrar colaborador sem cargo.', 'Não atualizar status e perder rastreio.'],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/rh/cargos',
    title: 'Guia Rápido de Cargos e Funções',
    whatIs:
      'Cargos definem responsabilidades e servem de base para treinamentos e competências. O objetivo é padronizar exigências e reduzir “cada um faz de um jeito”.',
    steps: ['Crie cargos com nome claro.', 'Defina treinamentos obrigatórios por cargo.', 'Use a matriz para ver gaps e gerar plano de ação.'],
    dependsOn: ['Permissão: RH (manage)'],
    connectsWith: ['Treinamentos', 'Competências', 'Matriz de competências', 'Colaboradores'],
    fillPerfectly: ['Poucos cargos bem definidos.', 'Treinamentos obrigatórios realistas.', 'Manter histórico de mudanças.'],
    commonMistakes: ['Criar cargos duplicados.', 'Exigir treinamento demais e ninguém cumpre.'],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/rh/competencias',
    title: 'Guia Rápido de Competências',
    whatIs:
      'Competências são critérios de habilidade/conhecimento usados na matriz. O objetivo é enxergar gaps e evoluir time com plano claro.',
    steps: ['Cadastre competências com descrição objetiva.', 'Defina níveis (quando aplicável).', 'Use na matriz para avaliar e criar plano.'],
    dependsOn: ['Permissão: RH (manage)'],
    connectsWith: ['Matriz de competências', 'Treinamentos', 'Cargos'],
    fillPerfectly: ['Descrições específicas (evita subjetividade).', 'Níveis consistentes.', 'Não criar competências redundantes.'],
    commonMistakes: ['Competência genérica demais (não mede nada).', 'Criar duplicadas com nomes diferentes.'],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/rh/matriz',
    title: 'Guia Rápido de Matriz de Competências',
    whatIs:
      'A matriz mostra o “gap” entre o necessário e o atual. O objetivo é transformar avaliação em ação (plano) e reduzir risco operacional.',
    steps: ['Escolha colaborador/cargo.', 'Avalie níveis.', 'Para gaps críticos, crie plano de ação com responsável e prazo.', 'Acompanhe evolução no tempo.'],
    dependsOn: ['Colaboradores', 'Competências', 'Cargos'],
    connectsWith: ['Treinamentos', 'Dashboard RH'],
    fillPerfectly: ['Planos com responsável e prazo.', 'Atualização periódica (mensal).'],
    commonMistakes: ['Avaliar e nunca criar plano.', 'Não revisar e virar “foto velha”.'],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/rh/treinamentos',
    title: 'Guia Rápido de Treinamentos',
    whatIs:
      'Treinamentos garantem compliance e segurança. O objetivo é saber o que está vencido/pendente e registrar evidências.',
    steps: ['Cadastre treinamentos com validade (quando aplicável).', 'Atribua a cargos/colaboradores.', 'Registre conclusão e acompanhe vencimentos.'],
    dependsOn: ['Cargos/colaboradores', 'Permissão: RH (manage)'],
    connectsWith: ['Dashboard RH', 'Cargos', 'Colaboradores'],
    fillPerfectly: ['Validade correta.', 'Evidência anexada quando necessário.', 'Regras claras por cargo.'],
    commonMistakes: ['Não registrar conclusão e parecer “pendente”.', 'Validade errada e falsos alertas.'],
    roadmapKey: 'servicos',
  },

  // Indústria — guias específicos por página (para não ficar tudo igual)
  {
    match: '/app/industria/centros-trabalho',
    title: 'Guia Rápido de Centros de Trabalho',
    whatIs:
      'Centros de trabalho representam recursos (máquinas/linhas) usados no roteiro. O objetivo é planejar capacidade e organizar execução.',
    steps: ['Cadastre centros de trabalho com descrição clara.', 'Defina parâmetros essenciais (quando existirem).', 'Use o centro no roteiro e valide na OP/execução.'],
    dependsOn: ['Permissão: Indústria (manage)'],
    connectsWith: ['Roteiros', 'PCP/Capacidade', 'Ordens (OP/OB)'],
    fillPerfectly: ['Nome consistente (ex.: “Corte”, “Solda”).', 'Não duplicar centros equivalentes.', 'Manter ativo/inativo correto.'],
    commonMistakes: ['Criar centro duplicado e confundir roteiros.', 'Usar centro genérico para tudo e perder visão.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/boms',
    title: 'Guia Rápido de Ficha Técnica (BOM)',
    whatIs:
      'BOM (Ficha Técnica) define materiais e quantidades por produto. O objetivo é consumo rastreável e custo/estoque coerentes.',
    steps: ['Crie BOM para o produto final.', 'Adicione materiais com quantidades e unidade.', 'Valide criando uma OP e conferindo consumo.'],
    dependsOn: ['Produtos', 'Permissão: Indústria (manage)'],
    connectsWith: ['Ordens (OP/OB)', 'MRP', 'Estoque'],
    fillPerfectly: ['Materiais corretos (SKU).', 'Quantidades realistas.', 'Revisar quando alterar processo.'],
    commonMistakes: ['BOM desatualizada e faltar material.', 'Unidade errada e consumo incoerente.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/roteiros',
    title: 'Guia Rápido de Roteiros',
    whatIs:
      'Roteiro define etapas e ordem de execução. O objetivo é travar estados corretamente e dar previsibilidade de filas/capacidade.',
    steps: ['Crie etapas com centro de trabalho.', 'Defina sequência e (quando existir) tempo padrão.', 'Aplique o roteiro na OP/OB e valide execução.'],
    dependsOn: ['Centros de trabalho', 'Permissão: Indústria (manage)'],
    connectsWith: ['Ordens', 'Execução', 'PCP/Capacidade'],
    fillPerfectly: ['Etapas na ordem real.', 'Tempos realistas.', 'Não pular etapas na execução.'],
    commonMistakes: ['Roteiro genérico e execução não reflete a realidade.', 'Etapas fora de ordem e quebrar rastreabilidade.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/materiais-cliente',
    title: 'Guia Rápido de Materiais de Cliente',
    whatIs:
      'Materiais de cliente permitem rastrear insumos que não são da sua empresa (beneficiamento). O objetivo é controle e auditoria sem misturar estoque próprio.',
    steps: ['Cadastre o cliente e o material.', 'Registre entradas/saídas (quando aplicável).', 'Vincule em OP/OB e acompanhe saldo.'],
    dependsOn: ['Clientes', 'Produtos', 'Permissão: Indústria (manage)'],
    connectsWith: ['Beneficiamento (OB)', 'Estoque/Controle', 'Relatórios'],
    fillPerfectly: ['Cliente correto.', 'Material correto e unidade coerente.', 'Registrar saldo sempre que movimentar.'],
    commonMistakes: ['Misturar material do cliente com estoque próprio.', 'Não vincular e perder rastreio.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/operadores',
    title: 'Guia Rápido de Operadores (Indústria)',
    whatIs:
      'Operadores são usuários do chão de fábrica. O objetivo é: apontamento correto, permissões e histórico por pessoa.',
    steps: ['Cadastre/vincule operadores.', 'Defina permissões/escopo (quando aplicável).', 'Teste no Chão de fábrica e Operador.'],
    dependsOn: ['Usuários', 'Permissão: Indústria (manage)'],
    connectsWith: ['Tela do operador', 'Execução', 'Qualidade'],
    fillPerfectly: ['Nome/identificação claros.', 'Permissões mínimas necessárias.', 'Desativar quando sair.'],
    commonMistakes: ['Operador com permissão demais.', 'Operador sem vínculo e “não aparece”.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/operador',
    title: 'Guia Rápido da Tela do Operador',
    whatIs:
      'Tela do operador é o “modo execução”: apontar etapas, registrar quantidades e ocorrências. O objetivo é velocidade com consistência (sem quebrar estados).',
    steps: ['Selecione a ordem/etapa.', 'Aponte início/fim ou quantidade conforme o fluxo.', 'Registre ocorrências (parada/refugo) quando houver.', 'Finalize etapa e confira status.'],
    dependsOn: ['OP/OB criada', 'Roteiro aplicado', 'Permissão: Indústria (execute)'],
    connectsWith: ['Execução', 'Chão de fábrica', 'Relatórios', 'Qualidade'],
    fillPerfectly: ['Não pular etapas.', 'Quantidade correta.', 'Motivo em ocorrências.'],
    commonMistakes: ['Apontar na ordem errada.', 'Finalizar sem registrar ocorrência e perder causa.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/chao-de-fabrica',
    title: 'Guia Rápido do Chão de Fábrica',
    whatIs:
      'Chão de fábrica mostra filas, WIP e execução em tempo real. O objetivo é enxergar gargalo e agir sem depender de “grito no corredor”.',
    steps: ['Use filtros por centro de trabalho.', 'Veja filas e prioridades.', 'Abra a ordem para apontar ou redistribuir (quando permitido).'],
    dependsOn: ['Ordens e apontamentos', 'Permissão: Indústria (view/execute)'],
    connectsWith: ['PCP', 'Execução', 'Operador'],
    fillPerfectly: ['Manter status atualizados.', 'Registrar ocorrências com motivo.'],
    commonMistakes: ['Executar fora da fila sem registrar e bagunçar WIP.', 'Não atualizar status e painel “parece errado”.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/execucao',
    title: 'Guia Rápido de Execução (Indústria)',
    whatIs:
      'Execução consolida apontamentos e entregas por etapa. O objetivo é consistência: o que foi produzido, onde está, e o que falta.',
    steps: ['Abra uma OP e veja etapas.', 'Registre apontamentos/entregas conforme o processo.', 'Use histórico para auditoria.'],
    dependsOn: ['OP/OB', 'Roteiro', 'Permissão: Indústria (execute)'],
    connectsWith: ['Chão de fábrica', 'Relatórios', 'Qualidade'],
    fillPerfectly: ['Apontar quantidades reais.', 'Registrar motivo em desvios.', 'Respeitar travas de estado.'],
    commonMistakes: ['“Dar baixa” sem apontar e perder rastreio.', 'Apontar duplicado (clique duplo) — aguarde feedback.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/pcp',
    title: 'Guia Rápido de PCP / Capacidade',
    whatIs:
      'PCP ajuda a planejar capacidade e prazos. O objetivo é transformar “achismo” em fila operável e alertas de atraso.',
    steps: ['Crie demanda/ordens.', 'Rode planejamento/sugestões (quando disponível).', 'Ajuste filas e valide capacidade por centro de trabalho.'],
    dependsOn: ['Centros de trabalho', 'Roteiros', 'Ordens'],
    connectsWith: ['MRP', 'Chão de fábrica', 'Relatórios'],
    fillPerfectly: ['Tempos realistas.', 'Ordem de prioridade clara.', 'Não alterar estado “na mão” sem motivo.'],
    commonMistakes: ['Planejar sem tempos/roteiro e gerar fila irreal.', 'Ignorar alertas e “atrasar” sem ver.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/mrp',
    title: 'Guia Rápido de MRP',
    whatIs:
      'MRP sugere compras/produção com base em BOM, estoque e demanda. O objetivo é reduzir falta de material e urgência.',
    steps: ['Selecione período/demanda.', 'Gere sugestões.', 'Aplique com cuidado (criar OC/ordens) e valide impacto no estoque.'],
    dependsOn: ['BOM', 'Estoque confiável', 'Demanda/ordens'],
    connectsWith: ['Suprimentos (compras)', 'Estoque', 'PCP'],
    fillPerfectly: ['BOM atualizada.', 'Mín/máx e lead time coerentes.', 'Registrar OCs abertas para não duplicar.'],
    commonMistakes: ['Rodar MRP com BOM desatualizada.', 'Aplicar sugestão sem revisar e comprar errado.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/qualidade/planos',
    title: 'Guia Rápido de Planos de Qualidade',
    whatIs:
      'Planos de qualidade definem critérios mínimos e checkpoints. O objetivo é reduzir retrabalho e rastrear conformidade.',
    steps: ['Crie plano com checkpoints simples.', 'Aplique em etapas/ordens (quando disponível).', 'Registre resultados e ocorrências.'],
    dependsOn: ['Permissão: Qualidade (manage)', 'Ordens/etapas'],
    connectsWith: ['Execução', 'Lotes', 'Relatórios'],
    fillPerfectly: ['Checkpoints objetivos.', 'Poucos itens críticos.', 'Registro de não conformidade com motivo.'],
    commonMistakes: ['Plano grande demais e ninguém usa.', 'Checkpoints subjetivos.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/qualidade/motivos',
    title: 'Guia Rápido de Motivos de Qualidade',
    whatIs:
      'Motivos padronizam ocorrências (refugo, parada, não conformidade). O objetivo é relatório consistente e ação corretiva.',
    steps: ['Cadastre motivos com categorias.', 'Use nos apontamentos/qualidade.', 'Analise relatórios para atacar raiz.'],
    dependsOn: ['Permissão: Qualidade (manage)'],
    connectsWith: ['Execução', 'Relatórios de indústria', 'Dashboard'],
    fillPerfectly: ['Nomes curtos e claros.', 'Evitar motivos duplicados.', 'Categoria ajuda análise.'],
    commonMistakes: ['Motivos genéricos (“erro”) e não ajudam.', 'Duplicar motivo e bagunçar relatório.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/qualidade/lotes',
    title: 'Guia Rápido de Lotes e Bloqueio',
    whatIs:
      'Lotes permitem rastrear e bloquear material/produto quando necessário. O objetivo é rastreabilidade e controle sem planilha.',
    steps: ['Crie lote (quando necessário) e registre entradas.', 'Bloqueie quando houver não conformidade.', 'Libere/baixe com trilha auditável.'],
    dependsOn: ['Produtos', 'Permissão: Qualidade (manage)'],
    connectsWith: ['Estoque', 'Execução', 'Relatórios'],
    fillPerfectly: ['Lote com identificação única.', 'Bloqueio com motivo.', 'Registrar histórico de liberação.'],
    commonMistakes: ['Bloquear sem motivo e virar suporte.', 'Misturar lote entre produtos.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/dashboard',
    title: 'Guia Rápido do Dashboard Industrial',
    whatIs:
      'Dashboard industrial mostra WIP, filas e eficiência. O objetivo é “ver e agir” — abrir o detalhe e corrigir gargalo.',
    steps: ['Veja KPIs do período.', 'Clique para drill-down (ordens/etapas).', 'Aja: repriorize, replaneje ou corrija apontamento.'],
    dependsOn: ['Ordens e apontamentos'],
    connectsWith: ['Chão de fábrica', 'Relatórios', 'PCP'],
    fillPerfectly: ['Manter status atualizados.', 'Apontamentos com motivo em desvios.'],
    commonMistakes: ['Usar dashboard sem dados (sem apontar).'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/relatorios',
    title: 'Guia Rápido de Relatórios de Indústria',
    whatIs:
      'Relatórios industriais mostram WIP, filas, eficiência e qualidade. O objetivo é fechar operação e priorizar melhoria contínua.',
    steps: ['Selecione período e filtros (centro/ordem).', 'Analise filas e atrasos.', 'Use motivos/qualidade para atacar causas.'],
    dependsOn: ['Ordens/etapas registradas', 'Permissão: Indústria (view)'],
    connectsWith: ['Execução', 'Qualidade', 'PCP'],
    fillPerfectly: ['Registrar motivos.', 'Manter etapas e estados coerentes.'],
    commonMistakes: ['Relatório “não bate” por falta de apontamento.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/automacao',
    title: 'Guia Rápido de Automação (Indústria)',
    whatIs:
      'Automação na indústria ajuda a manter consistência (rotinas e validações). O objetivo é reduzir erro humano e padronizar execução.',
    steps: ['Revise automações disponíveis.', 'Ative o mínimo necessário.', 'Monitore logs/saúde e ajuste.'],
    dependsOn: ['Permissão: Ops/Indústria (manage)'],
    connectsWith: ['Ordens', 'Execução', 'Logs/Saúde'],
    fillPerfectly: ['Ativar uma por vez.', 'Validar impacto antes.', 'Manter logs úteis.'],
    commonMistakes: ['Ativar várias automações e não saber qual afetou o fluxo.'],
    roadmapKey: 'industria',
  },
  {
    match: '/app/industria/status-beneficiamentos',
    title: 'Guia Rápido de Status de Beneficiamentos',
    whatIs:
      'Visão focada em beneficiamentos: status e pendências por ordem. O objetivo é enxergar gargalos rapidamente.',
    steps: ['Use filtros por status.', 'Abra uma ordem para detalhes.', 'Aja na execução e valide atualização do status.'],
    dependsOn: ['OB/execução registrada'],
    connectsWith: ['Ordens', 'Execução', 'Relatórios'],
    fillPerfectly: ['Atualizar status no fluxo correto.', 'Registrar ocorrências.'],
    commonMistakes: ['Status “parado” porque execução não foi apontada.'],
    roadmapKey: 'industria',
  },

  // OS (rota antiga / listagem)
  {
    match: '/app/ordens-de-servico',
    title: 'Guia Rápido de Ordens de Serviço (Lista)',
    whatIs:
      'Esta é a lista central de OS: criação, busca e acompanhamento por status/cliente/técnico. O objetivo é enxergar fila e agir rápido.',
    steps: ['Use busca e filtros por status.', 'Crie uma OS nova quando chegar o atendimento.', 'Abra a OS para checklist, anexos e eventos.', 'Feche quando concluir para refletir relatórios.'],
    dependsOn: ['Clientes', 'Permissão: OS (view/create)'],
    connectsWith: ['OS (detalhe)', 'Financeiro', 'Suprimentos (peças)', 'Relatórios de OS'],
    fillPerfectly: ['Status sempre atualizado.', 'Técnico atribuído quando possível.', 'Anexos e eventos registrados.'],
    commonMistakes: ['Deixar OS sem status/técnico e perder controle.', 'Fechar sem evidências (fotos) em casos críticos.'],
    links: [{ label: 'Abrir Relatórios de OS', href: '/app/servicos/relatorios', kind: 'internal' }],
    roadmapKey: 'servicos',
  },
  {
    match: '/app/industria/ordens',
    title: 'Guia Rápido de OP/OB (Indústria)',
    whatIs:
      'OP/OB organiza a produção/beneficiamento com estados travados e rastreabilidade. A regra é simples: “não pular etapas” — isso protege a operação e evita divergência de estoque/qualidade.',
    steps: [
      'Cadastre Centros de Trabalho, Roteiro e Ficha Técnica (BOM) para o produto.',
      'Crie uma OP/OB e aplique o roteiro/BOM.',
      'No chão de fábrica: aponte execução por etapa (quantidade/tempo/ocorrências).',
      'Valide consumo e saldos no estoque (quando aplicável) e finalize sem quebrar estados.',
    ],
    dependsOn: ['Produtos', 'Centros de trabalho', 'Roteiro + BOM', 'Permissão: Indústria (create/update)'],
    connectsWith: ['Suprimentos (estoque/consumo)', 'Qualidade (lotes/bloqueio)', 'Relatórios industriais'],
    fillPerfectly: [
      'Roteiro com tempos/ordem realistas (capacidade e filas fazem sentido).',
      'BOM coerente com o que realmente consome (evita falta “misteriosa”).',
      'Apontamentos por etapa com motivo/ocorrência quando houver (auditoria).',
    ],
    commonMistakes: [
      'Criar OP sem roteiro/BOM e depois “não sei o que consumir”.',
      'Apontar fora de ordem e quebrar rastreabilidade.',
      'Ignorar ocorrências (parada/refugo) e perder eficiência real.',
    ],
    roadmapKey: 'industria',
  },
  {
    match: '/app/configuracoes/ecommerce/marketplaces',
    title: 'Guia Rápido de Integrações (Marketplaces)',
    whatIs:
      'Integrações conectam o ERP ao canal (Mercado Livre/Shopee). A meta é simples: importar pedidos sem duplicar, com logs e reprocesso seguro (quando algo falhar).',
    steps: [
      'Conecte o provider (OAuth) e confirme que o status fica “Saudável”.',
      'Rode uma importação inicial (pedidos) e valide o mapeamento em Vendas.',
      'Se algo falhar: verifique a DLQ em Desenvolvedor → Saúde e reprocessar com segurança.',
    ],
    dependsOn: ['Permissão: Integrações (manage)', 'Conexão OAuth ativa', 'Produtos/estoque (para mapeamento)'],
    connectsWith: ['Vendas (pedidos)', 'Suprimentos (estoque)', 'Desenvolvedor (Saúde/DLQ)', 'Logs (auditoria)'],
    fillPerfectly: [
      'Conferir se o SKU do marketplace bate com o SKU do ERP (ou configurar mapeamento).',
      'Evitar importar duas vezes sem necessidade (use idempotência e status).',
      'Monitorar health e agir na DLQ (reduz “parou de sincronizar”).',
    ],
    commonMistakes: [
      'Conectar com usuário/loja errada e importar pedidos “do lugar errado”.',
      'Ignorar health/DLQ e descobrir só quando cliente reclamar.',
      'SKU sem padrão e mapeamento vira suporte.',
    ],
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
      titlePrefix: 'Guia Rápido do Painel',
      whatIs: 'O painel mostra o que está acontecendo no seu negócio e o que precisa de atenção agora (vendas, financeiro, pendências).',
      steps: ['Use filtros de período para comparar resultados.', 'Clique nos cards para abrir a lista correspondente.', 'Se algo falhar, use “Diagnóstico guiado” e (Ops) “Saúde”.'],
    },
    cadastros: {
      titlePrefix: 'Guia Rápido de Cadastros',
      roadmapKey: 'cadastros',
      whatIs: 'Cadastros são a base do ERP. Mantendo clientes, produtos e serviços consistentes, o restante (vendas, compras e financeiro) funciona sem retrabalho.',
      steps: ['Use filtros e busca para evitar duplicar cadastros.', 'Clique em “Novo” e preencha o mínimo necessário.', 'Valide no fluxo: use o cadastro em um pedido/OS/compra.'],
      dependsOn: ['Empresa ativa', 'Permissões do módulo'],
      connectsWith: ['Vendas', 'Suprimentos', 'Serviços', 'Financeiro'],
      fillPerfectly: ['Evite duplicidade (busque antes).', 'Preencha o mínimo correto.', 'Valide no fluxo e em relatórios.'],
      links: [{ label: 'Abrir Roadmap (Cadastros)', href: '/app/dashboard?roadmap=cadastros', kind: 'internal' }],
    },
    suprimentos: {
      titlePrefix: 'Guia Rápido de Suprimentos',
      roadmapKey: 'suprimentos',
      whatIs: 'Suprimentos mantém estoque confiável: compras, recebimentos, movimentações e relatórios de reposição.',
      steps: ['Confira estoque e depósitos (se habilitado).', 'Registre recebimentos e movimentações corretamente.', 'Use relatórios para reposição e pendências.'],
      dependsOn: ['Produtos', 'Fornecedores', 'Permissões do módulo'],
      connectsWith: ['Vendas/PDV', 'Financeiro', 'Indústria'],
      fillPerfectly: ['Registre referências (OC/recebimento) quando existir.', 'Evite ajustes manuais sem justificativa.', 'Kardex precisa bater com saldo.'],
      links: [{ label: 'Abrir Roadmap (Suprimentos)', href: '/app/dashboard?roadmap=suprimentos', kind: 'internal' }],
    },
    vendas: {
      titlePrefix: 'Guia Rápido de Vendas',
      roadmapKey: 'vendas',
      whatIs: 'Vendas organiza pedidos/PDV e conecta expedição e financeiro com rastreabilidade.',
      steps: ['Crie um pedido ou venda no PDV e confira total.', 'Avance para expedição (se aplicável).', 'Valide no fim: financeiro e histórico batem.'],
      dependsOn: ['Clientes', 'Produtos', 'Conta corrente (PDV)'],
      connectsWith: ['Expedição', 'Financeiro', 'Suprimentos'],
      fillPerfectly: ['Descontos auditáveis.', 'Endereço/contato corretos.', 'Status e timeline atualizados.'],
      links: [{ label: 'Abrir Roadmap (Vendas)', href: '/app/dashboard?roadmap=vendas', kind: 'internal' }],
    },
    financeiro: {
      titlePrefix: 'Guia Rápido de Financeiro',
      roadmapKey: 'financeiro',
      whatIs: 'Financeiro consolida caixa, contas a pagar/receber e relatórios. O objetivo é saldo confiável e auditoria.',
      steps: ['Defina contas correntes padrão e valide saldo.', 'Registre pagar/receber e concilie com extrato quando possível.', 'Use relatórios por período para fechar.'],
      dependsOn: ['Contas correntes', 'Permissões do módulo'],
      connectsWith: ['Vendas/PDV', 'Suprimentos', 'Serviços'],
      fillPerfectly: ['Data e categoria corretas.', 'Conciliação reduz divergência.', 'Estornos sempre auditáveis.'],
      links: [{ label: 'Abrir Roadmap (Financeiro)', href: '/app/dashboard?roadmap=financeiro', kind: 'internal' }],
    },
    servicos: {
      titlePrefix: 'Guia Rápido de Serviços',
      roadmapKey: 'servicos',
      whatIs: 'Serviços (OS) organiza atendimento, status, agenda, anexos e histórico, com geração de financeiro quando aplicável.',
      steps: ['Crie uma OS e avance status.', 'Registre itens/custos e anexos.', 'Gere parcelas e valide auditoria.'],
      dependsOn: ['Clientes', 'Permissões do módulo'],
      connectsWith: ['Financeiro', 'Cadastros', 'Suprimentos (peças/estoque)'],
      fillPerfectly: ['Status coerente com agenda.', 'Equipamento/serial (quando aplicável).', 'Anexos e observações em ocorrências.'],
      links: [{ label: 'Abrir Roadmap (Serviços)', href: '/app/dashboard?roadmap=servicos', kind: 'internal' }],
    },
    industria: {
      titlePrefix: 'Guia Rápido de Indústria',
      roadmapKey: 'industria',
      whatIs: 'Indústria conecta roteiro/BOM, ordens e execução no chão de fábrica com rastreabilidade e travas de estado.',
      steps: ['Cadastre CT, Roteiro e BOM.', 'Crie uma OP/OB e aplique roteiro/BOM.', 'Aponte execução e valide consistência de estados.'],
      dependsOn: ['Produtos', 'Roteiro + BOM', 'Permissões do módulo'],
      connectsWith: ['Suprimentos (estoque)', 'Qualidade', 'Relatórios'],
      fillPerfectly: ['Estados travados (sem pular etapas).', 'Apontamentos com quantidade e motivo.', 'Consumo de materiais rastreável.'],
      links: [{ label: 'Abrir Roadmap (Indústria)', href: '/app/dashboard?roadmap=industria', kind: 'internal' }],
    },
    fiscal: {
      titlePrefix: 'Guia Rápido de Fiscal',
      whatIs: 'Fiscal reúne configurações e emissão/consulta de documentos fiscais. O foco é reduzir risco e manter registros rastreáveis.',
      steps: ['Complete configurações mínimas (emitente e numeração).', 'Crie rascunho e valide dados.', 'Emita/acompanhe status e armazene XML/DANFE.'],
    },
    configuracoes: {
      titlePrefix: 'Guia Rápido de Configurações',
      whatIs: 'Aqui você ajusta empresa, permissões, plano e integrações. O objetivo é habilitar o que precisa sem travar o uso do sistema.',
      steps: ['Complete dados da empresa e onboarding mínimo.', 'Revise papéis e permissões por função.', 'Confira assinatura e limites do plano.'],
    },
    desenvolvedor: {
      titlePrefix: 'Guia Rápido de Desenvolvedor',
      whatIs: 'Área para diagnóstico e operação. Use para ver logs/saúde e reprocessar itens com segurança (DLQ).',
      steps: ['Abra a tela de Saúde para ver pendências e falhas.', 'Use “dry-run” antes de reprocessar quando disponível.', 'Reprocesso deve ser idempotente (sem duplicar).'],
    },
    suporte: {
      titlePrefix: 'Guia Rápido de Suporte',
      whatIs: 'Use diagnóstico guiado para resolver problemas comuns sem abrir ticket e registrar o contexto quando precisar de ajuda.',
      steps: ['Escolha o problema e siga os passos sugeridos.', 'Se necessário, anexe prints e ID de request.', 'Use “Saúde (Ops)” para falhas técnicas e filas.'],
    },
  };

  const group = groupByRoot[root];
  if (!group) {
    return {
      match: pathname,
      title: 'Guia Rápido',
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

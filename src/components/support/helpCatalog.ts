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

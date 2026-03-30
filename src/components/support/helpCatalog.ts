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
  // Dashboard / Configurações / Suporte / DevOps (rotas "raiz")
  {
    match: '/app/dashboard',
    title: 'Guia Rápido do Dashboard',
    whatIs:
      'O dashboard é a “central do controle”: ele resume o que está acontecendo agora (vendas, financeiro e pendências) e te leva direto para a ação — sem planilha e sem caça‑clique.',
    steps: [
      'Confirme a empresa ativa (canto superior/selector) e o período selecionado.',
      'Use os KPIs como “alertas”: clique no card que está fora do esperado para abrir a lista correspondente.',
      'Se for o primeiro uso: abra o Assistente/Roadmap e conclua o mínimo (caixa, centro de custo quando ativo, etc.).',
      'Quando algo não bater: use “Diagnóstico guiado (Suporte)” e, para perfis ops/dev, “Saúde (Ops)”.',
    ],
    dependsOn: ['Empresa ativa'],
    connectsWith: ['Vendas', 'Financeiro', 'Suprimentos', 'Serviços', 'Indústria', 'Configurações'],
    fillPerfectly: [
      'Escolher o período correto (evita “número estranho”).',
      'Tratar o dashboard como “painel de ação”, não só consulta (clicar e resolver).',
      'Quando a operação crescer, usar filtros (empresa/unidade/vendedor) para evitar decisões por “achismo”.',
    ],
    commonMistakes: [
      'Comparar meses diferentes sem ajustar período.',
      'Ignorar pendências e tentar resolver “na mão” em cada módulo.',
      'Achar que o dashboard está “errado” quando falta cadastrar/registrar eventos (ex.: expedição, conciliação).',
    ],
    links: [{ label: 'Abrir Roadmap (Cadastros)', href: '/app/dashboard?roadmap=cadastros', kind: 'internal' }],
  },
  {
    match: '/app/configuracoes',
    title: 'Guia Rápido de Configurações',
    whatIs:
      'Configurações é onde você define a base da operação: dados da empresa, permissões (RBAC), assinatura/plano e integrações. A ideia é habilitar o que precisa sem travar o uso do ERP.',
    steps: [
      'Finalize dados da empresa e o onboarding mínimo (para evitar bloqueios).',
      'Revise papéis e permissões por função (menu, rotas e banco).',
      'Abra “Minha assinatura” e confirme plano, trial e limites sincronizados.',
      'Se estiver configurando integrações, valide também em Desenvolvedor → Saúde (DLQ/logs).',
    ],
    dependsOn: ['Empresa ativa', 'Permissão: Configurações (view/manage)'],
    connectsWith: ['Assinatura/Stripe', 'RBAC', 'Onboarding', 'Integrações', 'Logs/Saúde'],
    fillPerfectly: [
      'Permissões mínimas por função (evita usuário “ver tudo” ou “não conseguir nada”).',
      'Concluir o mínimo operacional (conta padrão, centro de custo quando ativo).',
      'Manter integrações “saudáveis” (DLQ sob controle e reprocesso funcionando).',
    ],
    commonMistakes: [
      'Dar acesso admin para “resolver rápido” e esquecer (vira risco de segurança).',
      'Configurar plano manualmente e depois estranhar divergência com assinatura.',
      'Não concluir onboarding e achar que o módulo está com bug (na verdade é gate de setup).',
    ],
  },
  {
    match: '/app/suporte',
    title: 'Guia Rápido de Suporte (Tickets + Diagnóstico)',
    whatIs:
      'Suporte é a “central de ajuda” da Ultria: diagnóstico guiado (sem console) + abertura de ticket com contexto automático (empresa, request-id, checks) para resolver rápido.',
    steps: [
      'Comece pelos cards “Diagnóstico guiado” (Onboarding / PDV / Integrações) e conclua o que estiver como “Faltando”.',
      'Se o problema persistir, gere o “Pacote de diagnóstico” e copie o request-id (quando existir).',
      'Abra um ticket: descreva o que você estava tentando fazer e anexe o pacote (ou cole o texto pronto).',
      'Acompanhe seus tickets na lista “Tickets de suporte”.',
      'Se você for da equipe: abra “Console (equipe)” para triagem centralizada.',
    ],
    dependsOn: ['Usuário autenticado'],
    connectsWith: ['Tickets (Suporte)', 'Desenvolvedor → Erros no Sistema', 'Desenvolvedor → Logs', 'Desenvolvedor → Saúde', 'Configurações'],
    fillPerfectly: [
      'Sempre incluir: “o que fiz”, “o que esperava”, “o que aconteceu” + request-id (quando houver).',
      'Usar o pacote de diagnóstico (evita ida e volta e prints soltos).',
      'Quando for erro intermitente: anotar horário e repetir 1x com calma para capturar o request-id.',
    ],
    commonMistakes: [
      'Abrir ticket sem contexto (vira “ping-pong”).',
      'Repetir ação que falha e duplicar operação (quando não for idempotente).',
      'Tentar resolver “no braço” sem rodar os checks (onboarding/PDV) primeiro.',
    ],
    links: [
      { label: 'Abrir Erros no Sistema (dev)', href: '/app/desenvolvedor/erros', kind: 'internal' },
      { label: 'Abrir Saúde (Ops)', href: '/app/desenvolvedor/saude', kind: 'internal' },
    ],
  },
  {
    match: '/app/suporte/console',
    title: 'Guia Rápido do Console de Suporte (equipe)',
    whatIs:
      'Console (equipe) é o painel interno para triagem e acompanhamento de tickets por empresa. Ele não é necessário para clientes — apenas para staff autorizado.',
    steps: [
      'Valide acesso: o menu aparece apenas para staff autorizado.',
      'Use a busca por assunto/e-mail e filtre por status (Novo/Triagem/Em andamento…).',
      'Atualize o status conforme o atendimento evoluir.',
      'Ao encerrar: marque como “Resolvido” ou “Arquivado” (mantém histórico e métricas).',
    ],
    dependsOn: ['Permissão/flag de staff (ops)'],
    connectsWith: ['Suporte (Tickets)', 'Desenvolvedor → Erros no Sistema', 'Desenvolvedor → Logs'],
    fillPerfectly: [
      'Triagem rápida (≤ 1 dia útil na beta).',
      'Padronizar status para não “perder” ticket no fluxo.',
      'Responder sempre pedindo o mínimo de contexto (passos + request-id).',
    ],
    commonMistakes: ['Tentar usar console sem permissão (aparece “acesso restrito”).', 'Deixar tickets em “Novo” sem triagem.'],
    links: [{ label: 'Abrir Suporte (cliente)', href: '/app/suporte', kind: 'internal' }],
  },
  {
    match: '/app/desenvolvedor/saude',
    title: 'Guia Rápido de Saúde (Operação)',
    whatIs:
      '“Saúde” é o painel da operação: mostra pendências, falhas e DLQs (NF/marketplace/financeiro) e permite reprocessar de forma segura, idempotente e auditável.',
    steps: [
      'Confira os contadores por domínio (NF/marketplace/financeiro).',
      'Abra a lista de DLQ e inspecione o motivo da falha.',
      'Se disponível: rode “dry-run” para confirmar que o reprocesso não vai duplicar.',
      'Reprocessar e validar: status/timeline atualiza e os contadores diminuem.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view/manage)'],
    connectsWith: ['Logs', 'Integrações', 'Fiscal', 'Financeiro'],
    fillPerfectly: ['Reprocessar com contexto.', 'Preferir dry-run quando houver.', 'Acompanhar contadores (saúde = 0 pendências críticas).'],
    commonMistakes: ['Reprocessar em massa sem entender a causa raiz.', 'Tratar DLQ como “lixeira” e ignorar por dias.'],
  },
  {
    match: '/app/desenvolvedor/woocommerce',
    title: 'Guia Rápido — Painel de Controle WooCommerce',
    whatIs:
      'Painel interno para operar cada loja Woo: status consolidado, webhooks, fila/DLQ, mapa de SKU, replay de pedido e sync forçado por SKU.',
    steps: [
      'Abra a lista de lojas e entre no painel da store desejada.',
      'No Overview, valide health/fila/webhooks e siga recomendações.',
      'Em Sync Tools, rode replay por order_id, rebuild map ou force sync por SKU.',
      'Use Logs para confirmar resultado sem expor segredos (dados sensíveis redigidos).',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)', 'Store Woo cadastrada'],
    connectsWith: ['Desenvolvedor → Saúde', 'Configurações → E-commerce', 'Logs'],
    fillPerfectly: ['Atuar por store específica.', 'Resolver DLQ com replay idempotente.', 'Pausar store quando houver 401/403 recorrente.'],
    commonMistakes: ['Rodar sync sem SKU mapeado.', 'Forçar replay sem validar order_id.', 'Expor prints com dados sensíveis.'],
    links: [
      { label: 'Abrir Saúde (Ops)', href: '/app/desenvolvedor/saude', kind: 'internal' },
      { label: 'Configurações de E-commerce', href: '/app/configuracoes/ecommerce/marketplaces', kind: 'internal' },
    ],
  },
  {
    match: '/app/products/woocommerce/catalog',
    title: 'Guia Rápido — Catálogo Woo (Importação)',
    whatIs:
      'Tela operacional para buscar produtos no WooCommerce, selecionar em massa, validar preview e iniciar uma execução rastreável de importação para o Revo.',
    steps: [
      'Selecione a loja Woo na tela de Produtos antes de abrir esta página.',
      'Busque por nome/SKU, marque os itens desejados e rode o preview.',
      'Revise blockers/warnings no preview e execute apenas quando estiver limpo.',
      'Após iniciar, acompanhe em “Execução WooCommerce” e use “Reexecutar falhas” quando necessário.',
    ],
    dependsOn: ['Permissão: Produtos (view)', 'Loja Woo cadastrada e saudável'],
    connectsWith: ['Produtos', 'Execução WooCommerce', 'Painel Dev WooCommerce'],
    commonMistakes: ['Importar sem SKU definido no Woo.', 'Executar com blockers pendentes.', 'Ignorar falhas de mapeamento após a execução.'],
  },
  {
    match: '/app/products/woocommerce/runs/',
    title: 'Guia Rápido — Execução WooCommerce',
    whatIs:
      'Relatório operacional por run: progresso, itens concluídos/ignorados/com erro, hints de correção e atalho para reprocessar apenas falhas.',
    steps: [
      'Abra o run recém-criado para acompanhar o processamento.',
      'Use “Atualizar” para polling manual quando necessário.',
      'Se houver falhas, use “Reexecutar falhas” para novo run sem duplicar itens concluídos.',
      'Quando o erro for de autenticação/mapeamento, corrija a causa e execute novamente.',
    ],
    dependsOn: ['Permissão: Produtos (view)', 'Run criado por ação de catálogo Woo'],
    connectsWith: ['Produtos', 'Painel Dev WooCommerce', 'Saúde (Ops)'],
    commonMistakes: ['Reexecutar tudo em vez de só falhas.', 'Ignorar códigos de erro/hint por item.', 'Fechar run sem validar contadores finais.'],
  },
  {
    match: '/app/desenvolvedor/entitlements',
    title: 'Guia Rápido — Entitlements por plano (Ultria)',
    whatIs:
      'Esta área é o “Console Ultria” para definir, globalmente, módulos e limites padrão por plano (ex.: Serviços/Indústria, max usuários, limite de NF-e). Ela afeta todos os tenants.',
    steps: [
      'Escolha o plano (ESSENCIAL/PRO/MAX/INDUSTRIA/SCALE).',
      'Ajuste módulos (plano_mvp) e limites (max_users, max_nfe_monthly).',
      'Clique em “Salvar” e valide o “Efetivo” (aplica via billing → entitlements).',
      'Se precisar voltar ao padrão: use “Remover override”.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (manage)'],
    connectsWith: ['Billing (assinaturas)', 'Entitlements por empresa', 'Plan gating'],
    commonMistakes: ['Ajustar limite sem alinhar com o pricing real.', 'Confundir RBAC (permissões de usuário) com entitlements (plano).'],
  },
  {
    match: '/app/desenvolvedor/logs',
    title: 'Guia Rápido de Logs',
    whatIs:
      'Logs e auditoria mostram “quem fez o quê e quando” (por usuário/empresa/entidade) e ajudam a diagnosticar falhas sem depender do console do navegador.',
    steps: [
      'Filtre por período e por entidade (ex.: OS, pedido, lançamento).',
      'Quando houver erro: use o request-id para correlacionar chamadas.',
      'Se o erro veio de reprocesso, volte para Saúde e veja o item na DLQ/timeline.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)'],
    connectsWith: ['Saúde (DLQ/reprocesso)', 'Diagnóstico (Suporte)'],
    fillPerfectly: [
      'Buscar pelo request-id quando disponível.',
      'Usar filtros por empresa/usuário para evitar “ruído”.',
      'Não expor PII em logs (LGPD) — manter somente o necessário para diagnóstico.',
    ],
    commonMistakes: ['Tentar diagnosticar sem filtros (vira caos).', 'Confundir log de operação com dado de negócio (ex.: “pedido não existe”).'],
  },
  {
    match: '/app/desenvolvedor/diagnostico',
    title: 'Guia Rápido de Diagnóstico Técnico',
    whatIs:
      'Diagnóstico técnico é um “assistente de investigação”: ele reúne verificações de conexão, permissões, banco/Edge Functions e integrações para achar a causa raiz rápido.',
    steps: ['Escolha o teste/checagem.', 'Execute e observe o resultado.', 'Siga os links sugeridos (logs/saúde/config).'],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)'],
    connectsWith: ['Logs', 'Saúde', 'Configurações'],
    fillPerfectly: ['Executar com a empresa correta selecionada.', 'Registrar prints/IDs quando necessário.'],
    commonMistakes: ['Rodar em empresa errada e concluir “não funciona”.'],
  },
  {
    match: '/app/desenvolvedor/supabase-demo',
    title: 'Guia Rápido (Supabase Demo)',
    whatIs:
      'Supabase Demo é uma área auxiliar para validações internas (debug) e demonstrações. Ela não faz parte do fluxo do cliente final — use com cuidado para não gerar “drift” no banco.',
    steps: [
      'Use apenas quando solicitado por suporte/ops (ou para reproduzir um bug).',
      'Prefira executar o fluxo real do sistema; use a demo só quando precisar isolar uma hipótese.',
      'Se a mudança for no Supabase: transforme em migration (mesmo que mínima).',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (manage)'],
    connectsWith: ['Migrations', 'Logs', 'Saúde'],
    commonMistakes: ['Ajustar “na mão” e gerar drift.', 'Usar em produção sem necessidade.'],
  },
  {
    match: '/app/desenvolvedor/erros',
    title: 'Guia Rápido de “Erros no Sistema”',
    whatIs:
      'Esta tela captura erros reais do navegador/RPC e agrega por incidente (fingerprint), com severidade P0/P1/P2 e prompt técnico pronto para investigação rápida.',
    steps: [
      'Use filtros por status, texto e origem (source).',
      'Priorize incidentes P0 na seção “Incidentes em tempo real (agregados)”.',
      'Clique em “Copiar prompt” para gerar um relato técnico completo para o agente.',
      'Se precisar filtrar por período: use “De/Até” (data).',
      'Para limpar ruído: selecione múltiplos itens (checkbox) e use “Ignorar em lote”.',
      'Para abrir um reporte bem formatado: clique em “Enviar p/ Dev”, descreva o que estava tentando fazer e copie o texto/abra o e-mail.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)'],
    connectsWith: ['Suporte (Tickets)', 'Logs', 'Saúde (Ops)', 'Diagnóstico'],
    fillPerfectly: [
      'Marcar como “Investigando” assim que iniciar análise (evita duplicar esforço).',
      'Sempre anexar request_id + HTTP status + code no prompt enviado.',
      'Usar “Ignorado” apenas para erro de uso/validação (não bug).',
      'Garantir request_id e response_text (quando houver) para debug rápido.',
    ],
    commonMistakes: [
      'Ignorar erro real (vira “fantasma” em produção).',
      'Marcar “corrigido” sem validar em DEV/PROD.',
      'Deixar lista crescer sem triagem (vira ruído).',
    ],
    links: [
      { label: 'Abrir Logs', href: '/app/desenvolvedor/logs', kind: 'internal' },
      { label: 'Abrir Saúde (Ops)', href: '/app/desenvolvedor/saude', kind: 'internal' },
    ],
  },
  {
    match: '/app/desenvolvedor/403',
    title: 'Guia Rápido — 403 (Empresa ativa)',
    whatIs:
      'Esta página existe para diagnosticar rapidamente “403 (Forbidden)” por empresa ativa: normalmente é ausência de empresa ativa, divergência de assinatura/plano, ou uma regra de permissão/RLS bloqueando o acesso.',
    steps: [
      'Confirme a empresa ativa no topo (selector de empresa).',
      'Abra Configurações → Minha Assinatura e confirme se o plano está sincronizado.',
      'Se o erro for “Recurso indisponível no plano”: verifique se o módulo deveria estar habilitado para o plano atual.',
      'Se o erro for “permission denied/RLS”: abra Desenvolvedor → Inventário RLS e valide a tabela/rotas do módulo.',
      'Se persistir: abra Desenvolvedor → Erros no Sistema, copie o request_id e reporte via “Enviar p/ Dev”.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)'],
    connectsWith: ['Configurações → Minha Assinatura', 'Erros no Sistema', 'Inventário RLS', 'Logs'],
    fillPerfectly: ['Sempre validar empresa ativa antes de concluir “bug”.', 'Manter plano/entitlements sincronizados.'],
    commonMistakes: ['Trocar de empresa e manter aba antiga aberta (empresa ativa muda).', 'Testar módulo fora do plano e achar que é instabilidade.'],
    links: [
      { label: 'Configurações → Minha Assinatura', href: '/app/configuracoes?tab=assinatura', kind: 'internal' },
      { label: 'Abrir Inventário RLS', href: '/app/desenvolvedor/rls', kind: 'internal' },
      { label: 'Abrir Erros no Sistema', href: '/app/desenvolvedor/erros', kind: 'internal' },
    ],
  },
  {
    match: '/app/desenvolvedor/stripe-dedupe',
    title: 'Guia Rápido — Stripe: dedupe / vincular Customer',
    whatIs:
      'Ferramenta interna para diagnosticar duplicidade no Stripe (mesmo e-mail/CNPJ) e vincular o Customer correto ao tenant. O objetivo é evitar erros de plano/assinatura e inconsistência de acesso.',
    steps: [
      'Antes de qualquer ação: faça um backup do tenant (Backups por Empresa).',
      'Busque no Stripe por e-mail e/ou CNPJ (quando houver).',
      'Priorize o Customer que tem assinatura ativa/trial e/ou metadata coerente (o sistema marca “Recomendado”).',
      'Clique em “Vincular ao tenant” e depois valide em Configurações → Minha Assinatura.',
      'Se houver duplicados sem uso: avalie exclusão segura (quando disponível) — sempre após backup.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (manage)', 'Stripe configurado'],
    connectsWith: ['Minha Assinatura', 'Backups por Empresa', 'Logs'],
    fillPerfectly: ['Sempre backup antes de dedupe.', 'Nunca “apagar no Stripe” sem confirmar qual Customer está em uso.'],
    commonMistakes: ['Vincular o Customer errado e “sumir” assinatura.', 'Dedup sem backup e sem restore drill.'],
    links: [
      { label: 'Abrir Backups por Empresa', href: '/app/desenvolvedor/backups-tenant', kind: 'internal' },
      { label: 'Abrir Minha Assinatura', href: '/app/configuracoes?tab=assinatura', kind: 'internal' },
    ],
  },
  {
    match: '/app/desenvolvedor/rls',
    title: 'Guia Rápido — Inventário RLS (multi-tenant)',
    whatIs:
      'Inventário RLS mostra, por tabela, se o isolamento multi-tenant está correto (RLS + policy de current_empresa_id()). Ele ajuda a eliminar vazamento de dados entre empresas.',
    steps: [
      'Carregue o inventário e filtre por tabela/módulo (busca).',
      'Entenda o risco: ALTO = grants sem RLS; MÉDIO = tem RLS mas falta policy por empresa; OK = isolado.',
      'Gere um snapshot para auditoria (evidência) e, quando necessário, baixe em Markdown.',
      'Corrija itens MÉDIO/ALTO via migrations (nunca “na mão”).',
      'Após corrigir: rode o snapshot novamente e valide “boot sem 403” no verify.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)'],
    connectsWith: ['Migrations', 'Gates (E2E boot sem 403)', 'Logs'],
    fillPerfectly: ['Zerar itens ALTO/MÉDIO antes de abrir beta ampla.', 'Tratar RLS como “core do produto”.'],
    commonMistakes: ['Confiar apenas no frontend (cache) e esquecer RLS.', 'Dar grant em tabela e quebrar isolamento.'],
    links: [
      { label: 'Supabase — RLS', href: 'https://supabase.com/docs/guides/database/postgres/row-level-security', kind: 'external' },
      { label: 'Abrir Backups', href: '/app/desenvolvedor/backups', kind: 'internal' },
    ],
  },
  {
    match: '/app/desenvolvedor/backups-tenant',
    title: 'Guia Rápido — Backup por Empresa (tenant)',
    whatIs:
      'Backups por Empresa geram um snapshot dos registros de um tenant (por empresa) e registram no catálogo com `r2_key`/auditoria. É a base para dedupe seguro, restore drill e recuperação rápida.',
    steps: [
      'Selecione o tenant alvo (ou use “empresa ativa” quando aplicável).',
      'Dispare o backup e aguarde o status (catálogo).',
      'Confirme que o backup apareceu no catálogo (com `r2_key`).',
      'Para simular recuperação: rode restore drill no ambiente verify (sem tocar em prod).',
      'Após restore: execute o “check mínimo” (login owner → empresa ativa → navegar) e valide sem 403.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)', 'R2/GitHub dispatch configurados'],
    connectsWith: ['Stripe: Dedupe', 'Restore drill (verify)', 'Logs'],
    fillPerfectly: ['Sempre nomear o motivo do backup (ex.: antes-limpeza-stripe).', 'Executar restore drill periodicamente.'],
    commonMistakes: ['Fazer dedupe sem backup.', 'Rodar restore em prod por engano (use verify).'],
    links: [
      { label: 'Abrir Backups (DB)', href: '/app/desenvolvedor/backups', kind: 'internal' },
      { label: 'Abrir Stripe: Dedupe', href: '/app/desenvolvedor/stripe-dedupe', kind: 'internal' },
    ],
  },
  {
    match: '/app/desenvolvedor/backups',
    title: 'Guia Rápido — Backups (Registros) — manual',
    whatIs:
      'Backups (Registros) permitem disparar backup/restore do banco (ambiente) de forma controlada. Útil para restore drill, verificação de migrations e recuperação operacional.',
    steps: [
      'Escolha o ambiente (ex.: prod/dev/verify) e dispare o backup.',
      'Confirme a execução no catálogo e no storage (quando aplicável).',
      'Para restore: selecione o backup e rode apenas no ambiente correto (verify para drills).',
      'Após restore, execute o “check mínimo” automatizado (quando disponível) e valide a navegação básica.',
    ],
    dependsOn: ['Permissão: Ops/Desenvolvedor (view)', 'Workflows/Secrets configurados'],
    connectsWith: ['Inventário RLS', 'Restore drill', 'Gates CI'],
    fillPerfectly: ['Preferir verify para restore drill.', 'Manter retenção/rotina de auditoria.'],
    commonMistakes: ['Restaurar em ambiente errado.', 'Confiar no backup sem testar restore drill.'],
    links: [{ label: 'Abrir Inventário RLS', href: '/app/desenvolvedor/rls', kind: 'internal' }],
  },

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
      'Grupos organizam catálogo em categorias hierárquicas (ex.: Eletrônicos >> Celulares >> Smartphones). Facilitam relatórios, filtros e mapeamento de categorias para marketplaces.',
    steps: [
      'Crie grupos raiz (ex.: “Eletrônicos”, “Vestuário”, “Alimentos”).',
      'Crie subgrupos dentro dos grupos raiz (ex.: “Celulares” dentro de “Eletrônicos”) selecionando o grupo pai.',
      'Use o grupo nos Produtos e valide filtros nas listas/relatórios.',
      'O caminho hierárquico aparece no tooltip (ex.: “Eletrônicos >> Celulares”).',
    ],
    dependsOn: ['Permissão: Cadastros (create/update)'],
    connectsWith: ['Produtos', 'Relatórios (Suprimentos/Vendas)', 'Marketplaces (mapeamento de categorias)'],
    fillPerfectly: [
      'Nomes “autoexplicativos” (evita grupo duplicado).',
      'Hierarquia coerente: 2-3 níveis são suficientes para a maioria dos catálogos.',
      'Padronize o prefixo quando necessário (ex.: “Peças – …”).',
    ],
    commonMistakes: ['Criar grupos com nomes parecidos e perder padrão.', 'Hierarquia profunda demais (mais de 4 níveis dificulta a navegação).', 'Deixar grupo vazio e confundir usuários.'],
    links: [
      { label: 'Abrir Produtos', href: '/app/products', kind: 'internal' },
      { label: 'Marcas', href: '/app/cadastros/marcas', kind: 'internal' },
    ],
    roadmapKey: 'cadastros',
  },
  {
    match: '/app/cadastros/marcas',
    title: 'Guia Rápido de Marcas',
    whatIs:
      'Marcas identificam o fabricante/grife do produto. São obrigatórias para marketplaces (Mercado Livre, Shopee, Amazon) e facilitam filtros e relatórios por marca.',
    steps: [
      'Crie marcas com nomes oficiais (ex.: “Samsung”, “Apple”, “Tramontina”).',
      'Associe a marca ao produto na aba “Dados Gerais” do cadastro de produto.',
      'Para marketplace: a marca é obrigatória na maioria dos canais.',
    ],
    dependsOn: ['Permissão: Cadastros (create/update)'],
    connectsWith: ['Produtos', 'Marketplaces (anúncios)'],
    fillPerfectly: ['Nomes oficiais e padronizados.', 'Evite duplicar (ex.: “Samsung” e “SAMSUNG”).'],
    commonMistakes: ['Marca duplicada com caixa diferente.', 'Produto sem marca publicado em marketplace.'],
    links: [
      { label: 'Abrir Produtos', href: '/app/products', kind: 'internal' },
      { label: 'Grupos de Produtos', href: '/app/cadastros/grupos-produtos', kind: 'internal' },
    ],
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
    match: '/app/cadastros/meios-pagamento',
    title: 'Guia Rápido — Meios de Pagamento / Recebimento',
    whatIs:
      'Meios de Pagamento/Recebimento padronizam o “como foi pago/recebido” (Pix, Boleto, Cartão…). Isso evita digitação livre e melhora relatórios, conciliação e consistência no financeiro.',
    steps: [
      'Escolha o tipo (Pagamento ou Recebimento).',
      'Cadastre os meios que você realmente usa (ou adicione em massa: um por linha).',
      'Itens “Padrão do sistema” podem ser ativados/inativados, mas não editados/excluídos.',
      'Use o meio nos lançamentos (Contas a Pagar/Receber) e no PDV (quando aplicável).',
    ],
    dependsOn: ['Permissão: Cadastros (manage)'],
    connectsWith: ['Financeiro (Contas a Pagar/Receber)', 'Tesouraria', 'PDV', 'Conciliação bancária'],
    fillPerfectly: [
      'Manter lista curta e padronizada (evita “Pix”, “PIX”, “Pix (QR)” duplicados).',
      'Desativar itens não usados em vez de criar novos “quase iguais”.',
    ],
    commonMistakes: [
      'Criar variações do mesmo meio e “quebrar” relatórios.',
      'Tentar excluir meio padrão do sistema.',
    ],
    links: [{ label: 'Abrir Condições de Pagamento', href: '/app/cadastros/condicoes-pagamento', kind: 'internal' }],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/cadastros/condicoes-pagamento',
    title: 'Guia Rápido — Condições de Pagamento (prazo/parcelas)',
    whatIs:
      'Condições de pagamento definem o “quando” (prazo/parcelas): 21 dias, 30 dias, 30/60, 30/60/90… Elas são usadas para gerar vencimentos/parcelas de forma consistente em compras, vendas e financeiro.',
    steps: [
      'Crie uma condição com Nome e Condição (ex.: Nome “30/60”, Condição “30/60”).',
      'Dica: a ação “Adicionar linha” só habilita quando Nome e Condição estão preenchidos.',
      'Use “Adicionar em massa” para cadastrar várias condições (uma por linha).',
      'Selecione o tipo: Pagamento, Recebimento ou Ambos (quando fizer sentido).',
      'Depois use a condição em Pedido/PDV (parcelamento) ou em Contas a Pagar/Receber (lançamento recorrente/parcelado).',
    ],
    dependsOn: ['Permissão: Cadastros (manage)'],
    connectsWith: ['Pedidos/PDV (parcelamento)', 'Financeiro (Contas a Pagar/Receber)', 'Tesouraria'],
    fillPerfectly: [
      'Usar formato simples e legível (ex.: 21, 30, 30/60/90).',
      'Manter nomes consistentes (evita duplicidade).',
    ],
    commonMistakes: ['Cadastrar condição vazia ou com texto ambíguo.', 'Criar dezenas de condições quase iguais e confundir o time.'],
    links: [
      { label: 'Abrir Contas a Pagar', href: '/app/financeiro/contas-a-pagar', kind: 'internal' },
      { label: 'Abrir Contas a Receber', href: '/app/financeiro/contas-a-receber', kind: 'internal' },
    ],
    roadmapKey: 'financeiro',
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
    match: '/app/tools/xml-tester',
    title: 'Guia Rápido de Testador de XML',
    whatIs:
      'O testador valida rapidamente um XML (estrutura e campos) antes de usar no fluxo. Ele reduz suporte ao apontar inconsistências e sugerir o que corrigir.',
    steps: [
      'Cole/envie o XML.',
      'Valide e leia os avisos/erros.',
      'Se estiver OK: prossiga para “Importar XML” (compras/recebimentos) ou para o fluxo fiscal (quando aplicável).',
    ],
    dependsOn: ['Conexão com internet'],
    connectsWith: ['Importar XML (Suprimentos)', 'Fiscal (NF-e)'],
    fillPerfectly: ['Usar o arquivo original (sem editar tags).', 'Tratar encoding/acentos quando necessário.'],
    commonMistakes: ['Testar XML “editado na mão” e mascarar o problema.', 'Confundir XML de compra com XML de emissão.'],
  },

  {
    match: '/app/products',
    title: 'Guia Rápido de Produtos',
    whatIs:
      'Produtos alimentam pedidos/PDV, compras, estoque e indústria. O objetivo é ter catálogo consistente (SKU/unidade), com precificação “inteligente” (atacado/varejo) e variações sem duplicar cadastros.',
    steps: [
      'Cadastre 1 produto “pai” (nome + SKU + unidade) e salve.',
      'Escolha o Grupo/Categoria (hierárquico) e a Marca na aba “Dados Gerais”.',
      'Se for um produto com pequenas variações (ex.: cor): gere variantes a partir do produto pai (evita duplicidade).',
      'Se vende no atacado/varejo: configure faixas de quantidade e preços (o pedido/PDV puxa automaticamente).',
      'Preencha dados de marketplace na aba “Dados Complementares”: condição (novo/usado), fabricante, modelo, preço promocional.',
      'Configure anúncios por canal na aba “Canais / Marketplace”: título, preço e categoria específicos para cada marketplace.',
      'Se vende por peso: use unidade “KG” e no pedido/PDV alterne kg/g (ex.: 400 g vira 0,4 kg).',
      'Valide ponta-a-ponta: entrada no estoque → venda (pedido/PDV) → baixa e totais.',
    ],
    dependsOn: ['Unidades de medida', 'Grupos de Produtos', 'Marcas', 'Permissão: Cadastros (create/update)', 'Depósito (se multi-estoque estiver ativo)'],
    connectsWith: ['Vendas (Pedidos/PDV)', 'Suprimentos (Estoque/Compras/Recebimentos)', 'Indústria (BOM/MRP)', 'Financeiro (custos)', 'Integrações (Marketplaces)'],
    fillPerfectly: [
      'SKU único e “humano” (ex.: sem espaços e sem variações aleatórias).',
      'Unidade correta (impacta estoque, compra e produção).',
      'Grupo/Categoria correto (organiza catálogo e mapeia para categorias de marketplace).',
      'Marca preenchida (obrigatória em Mercado Livre, Shopee e outros marketplaces).',
      'Condição definida (novo/usado/recondicionado — obrigatório para marketplaces).',
      'Para atacado/varejo: faixas sem sobreposição e com mínimo/máximo claros.',
      'Para variações: use atributos (ex.: “Cor”) e deixe o pai como “modelo” — não como item vendável (quando aplicável).',
      'Para marketplace: preencha fabricante + modelo (facilita busca no marketplace e aumenta visibilidade).',
      'Se fiscal/precificação exigir: tributos básicos preenchidos (quando aplicável).',
    ],
    commonMistakes: [
      'SKU vazio ou duplicado (vira confusão em expedição e relatórios).',
      'Unidade errada (compra em “CX” e vende em “UN” sem conversão).',
      'Sem Grupo/Categoria (produto fica “solto” e dificulta anúncio em marketplace).',
      'Sem marca (marketplaces rejeitam anúncios sem marca).',
      'Faixas de preço sobrepostas (preço “oscila”).',
      'Gerar variações com GTIN repetido/obrigatório (se não usa GTIN, mantenha vazio).',
      'Produto inativo “some” no pedido/PDV e parece bug.',
    ],
    links: [
      { label: 'Grupos de Produtos', href: '/app/cadastros/grupos-produtos', kind: 'internal' },
      { label: 'Marcas', href: '/app/cadastros/marcas', kind: 'internal' },
      { label: 'Unidades de Medida', href: '/app/cadastros/unidades-medida', kind: 'internal' },
      { label: 'Suprimentos → Estoque', href: '/app/suprimentos/estoque', kind: 'internal' },
      { label: 'Vendas → Pedidos', href: '/app/vendas/pedidos', kind: 'internal' },
      { label: 'Vendas → PDV', href: '/app/vendas/pdv', kind: 'internal' },
    ],
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
      'Se o produto for por peso (KG): alterne kg/g e digite a quantidade (ex.: 400 g).',
      'Se houver atacado/varejo: ajuste a quantidade e confirme o preço automático por faixa.',
      'Se a venda for parcelada: selecione uma Condição de Pagamento (ex.: 30/60) e gere parcelas/títulos conforme o fluxo.',
      'Revise preços/descontos (respeitando permissões) e confirme totais.',
      'Salve e confira status + histórico/timeline.',
      'Se houver entrega: avance para Expedição e registre status/tracking.',
      'Se houver cobrança: confira se o lançamento/integração esperada foi gerada (quando aplicável).',
    ],
    dependsOn: ['Clientes', 'Produtos', 'Permissão: Vendas (create/update)'],
    connectsWith: ['Expedição', 'Financeiro (A Receber)', 'Fiscal (NF-e quando habilitado)', 'Condições de Pagamento'],
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
      'Esperar preço automático sem configurar faixas no produto.',
      'Esquecer observações de entrega e virar suporte.',
    ],
    links: [{ label: 'Abrir Expedição', href: '/app/vendas/expedicao', kind: 'internal' }],
    roadmapKey: 'vendas',
  },
  {
    match: '/app/vendas/pdv',
    title: 'Guia Rápido do PDV',
    whatIs:
      'PDV é a tela de venda rápida: busque o produto, veja o total, finalize com F9. Por baixo, gera movimentação financeira, baixa estoque e emite NFC-e (se configurado). Suporta CPF na Nota e identificação de cliente. O foco é: velocidade com controle.',
    steps: [
      'Garanta que existe uma conta corrente de recebimentos selecionada.',
      'Selecione o caixa e confirme que está aberto (o sistema abre automaticamente se possível).',
      'Clique “Nova venda” para abrir a tela de venda.',
      'Use o campo unificado de busca (F2): escaneie o código de barras (detectado automaticamente) ou digite o nome do produto.',
      'CPF na Nota: clique em “Cliente / CPF na Nota” (ou F4) e digite o CPF do consumidor — ele será incluído automaticamente na NFC-e.',
      'Cliente: opcionalmente, selecione ou cadastre um cliente no campo ao lado do CPF — o CPF será preenchido automaticamente a partir do cadastro.',
      'Ajuste quantidade, preço ou desconto clicando diretamente no campo (Tab navega entre campos).',
      'Pressione F9 ou clique em “Finalizar” para abrir o modal de pagamento.',
      'Escolha a forma de pagamento: Dinheiro, Pix, Cartão de Crédito, Cartão de Débito ou outra.',
      'Para dinheiro: informe o valor recebido (sem limite de dígitos) e o troco será calculado automaticamente.',
      'Para cartão de crédito: selecione o número de parcelas (1x a 12x) — o valor por parcela aparece ao lado.',
      'Para pagamento misto: clique “Adicionar forma” e divida o valor (ex.: R$100 Pix + R$50 Dinheiro).',
      'Confirme o pagamento (F9) — a venda será finalizada (financeiro + estoque).',
      'Se NFC-e configurada (CSC): emitida automaticamente após a finalização — os dados fiscais aparecem no comprovante.',
      'O comprovante exibe o logo da empresa, pagamentos e, quando autorizado, o DANFCE com chave de acesso. Use “DANFCE (PDF)” para baixar.',
      'Ao final do dia, encerre o caixa (botão vermelho) para ver o resumo por forma de pagamento. O caixa permanece fechado até você abrir novamente.',
      'Sem internet: finalize mesmo assim e aguarde a sincronização automática.',
    ],
    dependsOn: ['Conta corrente (recebimentos)', 'Produtos cadastrados', 'Caixa PDV', 'CSC configurado (para NFC-e)'],
    connectsWith: ['Financeiro (Tesouraria)', 'Estoque (baixa e kardex)', 'Fiscal (NFC-e)'],
    fillPerfectly: [
      'Conta de recebimento correta (evita caixa “furado”).',
      'Forma de pagamento correta (obrigatória para NFC-e e para relatório de fechamento de caixa).',
      'Usar leitor de código de barras para agilizar (o campo unificado detecta scanner vs digitação).',
      'Sempre pedir CPF ao cliente (programas estaduais: Nota Paulista, Nota Gaúcha etc.).',
      'Encerrar o caixa ao final do dia para conferir saldo.',
      'Para NFC-e: configure o CSC e certificado digital em Fiscal → Configurações.',
    ],
    commonMistakes: [
      'Tentar vender sem conta corrente selecionada (bloqueia no final).',
      'Finalizar duas vezes (clique duplo) — o sistema bloqueia, mas aguarde o feedback.',
      'Em offline: fechar a aba antes de sincronizar (deixe o badge “pendente” resolver).',
      'Sem CSC configurado: a venda finaliza normalmente, mas a NFC-e não é emitida.',
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
    match: '/app/nfe-input',
    title: 'Guia Rápido de Importar XML (Compras/Recebimentos)',
    whatIs:
      'Importar XML acelera entrada de notas de compra e reduz erro manual. O objetivo é: transformar o XML em recebimento com vínculo (fornecedor, itens e totais) e manter estoque/financeiro coerentes.',
    steps: [
      'Envie o XML e revise o preview (emitente/destinatário, número/série, totais).',
      'Conferir o fornecedor (criar/selecionar corretamente).',
      'Revise o mapeamento de itens (SKU/unidade) e ajuste o que não bate.',
      'Importe e valide o resultado em Recebimentos + Estoque (kardex/saldos).',
      'Se houver divergência: corrija o cadastro do produto/unidade para evitar repetição do erro.',
    ],
    dependsOn: ['Produtos', 'Unidades de medida', 'Permissão: Suprimentos (manage)'],
    connectsWith: ['Suprimentos → Recebimentos', 'Suprimentos → Estoque', 'Financeiro (custos/A Pagar quando aplicável)'],
    fillPerfectly: [
      'Garantir que o item do XML mapeia para o SKU correto no ERP (ou ajustar cadastro).',
      'Revisar unidade (CX/UN/KG) e conversões (se existirem).',
      'Conferir número/série para evitar importação duplicada.',
    ],
    commonMistakes: [
      'Importar sem conferir fornecedor e criar duplicado.',
      'Produtos sem SKU/unidade e o importador “chuta” (vira retrabalho).',
      'Importar duas vezes o mesmo XML e duplicar entrada (use validações e vínculos).',
    ],
    links: [
      { label: 'Abrir Recebimentos', href: '/app/suprimentos/recebimentos', kind: 'internal' },
      { label: 'Abrir Produtos', href: '/app/products', kind: 'internal' },
    ],
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
      'Lançamentos que não precisam de conciliação (ex.: repasses de cartão já baixados) podem ser ignorados — use “Ignorar” na aba Conciliação.',
      'Para ignorar em lote, selecione os lançamentos via checkbox e clique em “Ignorar selecionados”.',
      'Lançamentos ignorados podem ser restaurados a qualquer momento no filtro “Ignorados”.',
      'Use filtros de período para fechar o mês e conferir relatórios (caixa e faturamento).',
    ],
    dependsOn: ['Permissão: Tesouraria (view/create/update)', 'Conta corrente cadastrada'],
    connectsWith: ['PDV (recebimentos)', 'Contas a pagar/receber', 'Relatórios financeiros', 'Serviços (OS → financeiro)', 'Conciliação de Cartão'],
    fillPerfectly: [
      'Conta correta (evita lançar “no lugar errado”).',
      'Descrição que ajude a auditar (ex.: “Venda PDV #123”, “Fornecedor X – OC #45”).',
      'Conciliação frequente reduz divergência e suporte.',
      'Se centro de custo estiver ativo: preencher sempre (relatórios batem).',
      'Ignorar lançamentos de repasse de cartão que já foram baixados na Conciliação de Cartão.',
    ],
    commonMistakes: [
      'Trabalhar sem conciliação e só descobrir divergência no fim do mês.',
      'Lançar sem descrição e depois “ninguém sabe o que é”.',
      'Misturar contas correntes e perder controle do caixa real.',
      'Deixar lançamentos de repasse de cartão pendentes eternamente (use “Ignorar”).',
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
      'Lançamentos que não precisam de conciliação podem ser marcados como “Ignorado” na aba Conciliação da Tesouraria.',
      'Use o filtro de status “Ignorado” para visualizar os lançamentos ignorados e restaurá-los se necessário.',
      'Confira o saldo por conta corrente.',
    ],
    dependsOn: ['Tesouraria (contas correntes)', 'Permissão: Tesouraria (view/update)'],
    connectsWith: ['Contas a pagar/receber', 'PDV', 'Relatórios', 'Conciliação de Cartão'],
    fillPerfectly: ['Importar no banco/conta corretos.', 'Conciliar antes do fechamento do período.', 'Criar regras para itens recorrentes.', 'Ignorar lançamentos já baixados por outro caminho (ex.: cartão de crédito).'],
    commonMistakes: [
      'Conciliar “no olho” e deixar itens sem vínculo.',
      'Importar extrato na conta errada.',
      'Deixar lançamentos de repasse de cartão pendentes eternamente — use “Ignorar” na Tesouraria.',
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
    match: '/app/financeiro/dre',
    title: 'Guia Rápido do DRE (Demonstrativo de Resultados)',
    whatIs:
      'O DRE é o “resultado” da empresa no período: ele consolida receitas e despesas e mostra o lucro/prejuízo. Aqui, ele é calculado a partir das movimentações financeiras e do mapeamento por categoria → linha do DRE.',
    steps: [
      'Escolha o período e o regime (Competência/Caixa).',
      'Gere o relatório e observe a linha “Não mapeado”.',
      'Se existir “Não mapeado”, use o painel de mapeamento para classificar as categorias com maior impacto.',
      'Atualize o relatório e confira se os valores migraram para as linhas corretas.',
      'Quando algo ficar “zero” ou incoerente: valide se existem movimentações no período e se as categorias estão preenchidas.',
    ],
    dependsOn: ['Movimentações na Tesouraria', 'Permissão: Relatórios Financeiro (view)'],
    connectsWith: ['Tesouraria', 'Relatórios Financeiros', 'Centros de custo (quando ativo)'],
    fillPerfectly: [
      'Conciliação feita (movimentações completas) antes de “fechar” o período.',
      'Categorias consistentes (evita “Não mapeado” alto).',
      'Definir um padrão por categoria (receita vs despesa) para manter o DRE estável.',
    ],
    commonMistakes: [
      'Tentar usar DRE sem movimentações no período.',
      'Mapear categoria errada (ex.: tarifa bancária como receita).',
      'Ignorar “Não mapeado” e usar o DRE como “oficial”.',
    ],
    links: [
      { label: 'Abrir Tesouraria', href: '/app/financeiro/tesouraria', kind: 'internal' },
      { label: 'Abrir Relatórios Financeiros', href: '/app/financeiro/relatorios', kind: 'internal' },
      { label: 'Abrir Centros de custo', href: '/app/financeiro/centros-de-custo', kind: 'internal' },
    ],
    roadmapKey: 'financeiro',
  },
  {
    match: '/app/financeiro/conciliacao-cartao',
    title: 'Guia Rápido de Conciliação de Cartão',
    whatIs:
      'Conciliação de Cartão permite conferir e baixar em lote as contas de cartão de crédito agrupadas por data de vencimento. Você seleciona os títulos, compara o total com a fatura da operadora e faz a baixa com um clique — sem abrir conta por conta.',
    steps: [
      'Escolha a aba: "Contas a Pagar" (faturas de cartão corporativo/fornecedores) ou "Contas a Receber" (vendas no cartão).',
      'Selecione a forma de pagamento no filtro (padrão: Cartão de crédito). Use "Status" para ver pendentes, pagos ou todos.',
      'Use os filtros de data ("De" / "Até") para isolar o período da fatura que você quer conferir.',
      'Os títulos aparecem agrupados por data de vencimento. Clique no grupo para expandir e ver os detalhes.',
      'Marque os títulos que correspondem à fatura. A barra no rodapé mostra a quantidade e o valor total — confira com o valor da fatura.',
      'Se o total bater: clique em "Baixar selecionados". Escolha a conta corrente e a data de pagamento e confirme.',
      'Para baixar um dia inteiro de uma vez: clique em "Baixar dia" no cabeçalho do grupo.',
    ],
    dependsOn: [
      'Contas a pagar/receber com "Forma de Pagamento" = Cartão de crédito',
      'Tesouraria (conta corrente cadastrada)',
      'Permissão: Contas a Pagar ou Contas a Receber (view/update)',
    ],
    connectsWith: ['Contas a Pagar', 'Contas a Receber', 'Tesouraria (movimentações)', 'Pedido de Venda (gera contas a receber com forma de pagamento)'],
    fillPerfectly: [
      'Sempre preencha "Forma de Pagamento" ao criar contas — sem isso o título não aparece aqui.',
      'Confira o total selecionado com a fatura da operadora antes de baixar.',
      'Use "Baixar dia" quando todo o dia bater com a fatura (mais rápido).',
      'Prefira selecionar individualmente quando há divergência para identificar o título faltante.',
    ],
    commonMistakes: [
      'Criar contas a pagar sem preencher "Forma de Pagamento" e depois não encontrá-las na conciliação.',
      'Baixar sem conferir o total com a fatura e descobrir divergência depois.',
      'Confundir "Contas a Pagar" (fatura do cartão corporativo) com "Contas a Receber" (vendas no cartão).',
      'Esquecer de filtrar o período correto da fatura e baixar títulos de meses diferentes.',
    ],
    links: [
      { label: 'Abrir Contas a Pagar', href: '/app/financeiro/contas-a-pagar', kind: 'internal' },
      { label: 'Abrir Contas a Receber', href: '/app/financeiro/contas-a-receber', kind: 'internal' },
      { label: 'Abrir Tesouraria', href: '/app/financeiro/tesouraria', kind: 'internal' },
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
    match: '/app/servicos/faturamento-mensal',
    title: 'Guia Rápido de Faturamento Mensal',
    whatIs:
      'O Faturamento Mensal automatiza a emissão de boletos bancários (Banco Inter) e envio por email para todos os contratos de serviço ativos. Em vez de gerar boleto por boleto, você seleciona o mês, clica em "Carregar" e o sistema prepara tudo: agenda de cobrança, conta a receber e cobrança bancária. Depois, basta selecionar os contratos e clicar em "Emitir e Enviar" — cada boleto é registrado no Inter e enviado por email automaticamente.',
    steps: [
      'Selecione o mês e ano de competência e clique em "Carregar". O sistema gera a agenda, contas a receber e cobranças bancárias para todos os contratos ativos.',
      'Revise a lista: verifique se todos os clientes têm email cadastrado (ícone de alerta aparece quando falta).',
      'Selecione os contratos desejados (ou "Selecionar todos") e clique em "Emitir e Enviar".',
      'Acompanhe a barra de progresso. Cada boleto é registrado no Banco Inter e o email com PDF anexo é enviado ao cliente.',
      'Ao concluir, o status muda para "Enviada". Se o cliente pagar, o webhook do Inter marca automaticamente como "Liquidada".',
      'Para reenviar um boleto (ex: cliente não recebeu), clique em "Reenviar" na linha desejada.',
    ],
    dependsOn: [
      'Contratos de Serviço com regra de faturamento mensal configurada',
      'Integração Banco Inter configurada (Configurações > Inter)',
      'Email do cliente cadastrado no cadastro de Pessoas',
      'Resend (email transacional) configurado no backend',
      'Permissão: Serviços (view/update) e Contas a Receber (create)',
    ],
    connectsWith: ['Contratos', 'Contas a Receber', 'Cobranças Bancárias', 'Banco Inter', 'Email (Resend)'],
    fillPerfectly: [
      'Configure a regra de faturamento no contrato: tipo mensal, valor, dia de vencimento e primeira competência.',
      'Mantenha o email do cliente sempre atualizado no cadastro.',
      'Execute o faturamento no início do mês para dar tempo de pagamento.',
      'Se falhar em algum contrato, re-execute: o sistema é idempotente (pula os já processados).',
    ],
    commonMistakes: [
      'Contrato sem regra de faturamento: não aparece na lista.',
      'Cliente sem email: aparece com alerta e é ignorado no envio em lote.',
      'Inter não configurado: a emissão falha com erro de credencial.',
      'Rodar para mês futuro sem schedule: o "Carregar" gera automaticamente.',
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
    match: '/app/fiscal/dashboard',
    title: 'Guia Rápido — Dashboard Fiscal',
    whatIs:
      'O Dashboard Fiscal é a central de indicadores do módulo fiscal: valor autorizado no período, quantidade de Pré-NF-e pendentes, rejeitadas, erros e status do IBS/CBS. Permite identificar gargalos e agir rapidamente.',
    steps: [
      'Acesse Fiscal → Dashboard Fiscal.',
      'Ajuste o período (início/fim) para filtrar os indicadores.',
      'Analise os KPIs: valor autorizado, pendentes, rejeitadas, regras fiscais ativas.',
      'Clique nos cards para navegar diretamente para a tela correspondente (NF-e, Regras).',
      'Verifique o status do IBS/CBS 2026 — se necessário, ative em Configurações NF-e.',
    ],
    dependsOn: ['Empresa ativa', 'NF-e configurada'],
    connectsWith: ['Emissão de NF-e', 'Regras Fiscais', 'Naturezas de Operação', 'Configurações NF-e'],
    fillPerfectly: [
      'Consultar diariamente para detectar NF-e pendentes ou rejeitadas.',
      'Usar o filtro de período para comparar meses.',
      'Manter regras fiscais ativas atualizadas para o motor funcionar corretamente.',
    ],
    commonMistakes: [
      'Ignorar NF-e pendentes acumuladas (rascunhos esquecidos).',
      'Não investigar rejeitadas no período — cada rejeição pode exigir ação.',
    ],
    links: [
      { label: 'Dashboard Fiscal', href: '/app/fiscal/dashboard', kind: 'internal' as const },
      { label: 'NF-e', href: '/app/fiscal/nfe', kind: 'internal' as const },
    ],
    roadmapKey: 'fiscal',
  },
  {
    match: '/app/fiscal/nfe/configuracoes',
    title: 'Guia Rápido de Configurações de NF-e',
    whatIs:
      'Configurações de NF-e definem emitente, série/numeração, ambiente e toggle IBS/CBS 2026. O objetivo é evitar rejeição e suporte na hora de emitir.',
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
      'Aqui você acompanha emissões e status (rascunho, autorizada, rejeitada, cancelada). O objetivo é ter trilha completa, resolver rejeições e gerenciar o ciclo de vida das NF-e.',
    steps: [
      'Crie/abra um rascunho e revise dados principais.',
      'Emita e acompanhe o status.',
      'Se rejeitar: corrija o campo indicado e reemita (sem duplicar).',
      'Quando disponível: baixe/consulte XML/DANFE.',
      'Para cancelar: clique no botão “Cancelar” em NF-e autorizadas, informe a justificativa (mín. 15 chars) e confirme.',
    ],
    dependsOn: ['Configurações de NF-e', 'Clientes/Produtos com dados fiscais (quando aplicável)'],
    connectsWith: ['Pedidos/PDV', 'Configurações de NF-e', 'Logs/Timeline', 'Inutilização de Numeração'],
    fillPerfectly: ['Destinatário e itens coerentes.', 'Tributos básicos preenchidos quando necessário.', 'Não editar após autorizada sem fluxo correto.', 'Cancelar dentro de 24h da autorização (prazo SEFAZ).'],
    commonMistakes: ['Tentar emitir sem configurar emitente/série.', 'Ignorar rejeição e “tentar de novo” sem corrigir.', 'Tentar cancelar NF-e após 24h — pode ser recusado pela SEFAZ.', 'Confundir “Excluir” (apaga rascunho interno) com “Cancelar” (cancela junto à SEFAZ).'],
    roadmapKey: 'fiscal',
  },
  {
    match: '/app/fiscal/nfe-recebidas',
    title: 'Guia Rápido de NF-e Recebidas (Manifestação do Destinatário)',
    whatIs:
      'Consulta automática de notas fiscais emitidas contra o CNPJ da sua empresa (NF-e de fornecedores). Permite manifestar (confirmar, desconhecer, etc.) e integrar com contas a pagar e estoque.',
    steps: [
      'Configure o certificado A1 com senha em Configurações NF-e e registre a empresa na Focus NFe.',
      'Clique em “Sincronizar” para buscar novas NF-e via Focus NFe (ou aguarde a sincronização automática).',
      'Revise as notas listadas: confira emitente, valor e data.',
      'Selecione uma ou mais notas e clique em “Manifestar” → escolha a ação (Ciência, Confirmar, Desconhecer, Não Realizada).',
      'Após confirmar uma NF-e, o XML completo fica disponível. Use os toggles de integração para gerar conta a pagar ou dar entrada no estoque.',
    ],
    dependsOn: ['Certificado A1 configurado e validado (Configurações NF-e)', 'Permissão: Fiscal (view)'],
    connectsWith: ['Configurações NF-e', 'Contas a Pagar', 'Estoque (recebimento)', 'Fornecedores'],
    fillPerfectly: [
      'Manifestar “Ciência” dentro de 10 dias da emissão para poder baixar o XML.',
      'Manifestar conclusivamente (Confirmar/Desconhecer/Não Realizada) dentro de 180 dias.',
      'Vincular fornecedor para facilitar rastreamento e geração de contas a pagar.',
    ],
    commonMistakes: [
      'Não configurar a senha do certificado — a sincronização não funciona sem ela.',
      'Deixar notas “Pendentes” por mais de 10 dias — perde o prazo de ciência.',
      'Confirmar sem conferir valor/emitente — confirmar é irreversível.',
      'Esquecer de gerar conta a pagar após confirmar — a NF-e existe mas a obrigação financeira fica fora do controle.',
    ],
    roadmapKey: 'fiscal',
  },
  {
    match: '/app/fiscal/inutilizacao',
    title: 'Guia Rápido — Inutilização de Numeração NF-e',
    whatIs:
      'Permite declarar à SEFAZ que determinados números de NF-e não serão utilizados, mantendo a sequência numérica regular. Obrigatória quando há lacunas na numeração (números pulados por erro de sistema, troca de série, etc.).',
    steps: [
      'Acesse Fiscal → Inutilização.',
      'Informe a série e o intervalo de números (inicial e final) a inutilizar.',
      'Preencha a justificativa (mínimo 15 caracteres) explicando o motivo da lacuna.',
      'Clique em "Inutilizar Números" — o sistema envia a solicitação à SEFAZ.',
      'Acompanhe o resultado no histórico abaixo do formulário.',
    ],
    dependsOn: ['Certificado A1 configurado (Configurações NF-e)', 'Token Focus NFe válido', 'Permissão: Fiscal (view)'],
    connectsWith: ['Emissões NF-e', 'Configurações NF-e'],
    fillPerfectly: [
      'Inutilize até o dia 10 do mês seguinte ao da ocorrência da lacuna.',
      'Para um único número, informe o mesmo valor em inicial e final.',
      'Máximo de 10.000 números por solicitação.',
      'A justificativa deve ser clara e específica (ex: "Falha no sistema pulou sequência de numeração").',
    ],
    commonMistakes: [
      'Tentar inutilizar números já utilizados em NF-e autorizadas — a SEFAZ rejeitará.',
      'Ultrapassar o prazo de dia 10 do mês seguinte — pode gerar multa.',
      'Confundir inutilização com cancelamento — inutilizar é para números NUNCA usados, cancelar é para NF-e já autorizada.',
      'Esquecer de verificar a série correta antes de inutilizar.',
    ],
    roadmapKey: 'fiscal',
  },
  {
    match: '/app/fiscal/naturezas-operacao',
    title: 'Guia Rápido — Naturezas de Operação',
    whatIs:
      'A Natureza de Operação é um template fiscal que define automaticamente o CFOP (intra/inter UF), CST/CSOSN de ICMS, PIS, COFINS, IPI, finalidade da emissão e comportamento (gerar financeiro, movimentar estoque). Ao selecionar uma natureza na NF-e, todos os campos fiscais dos itens são preenchidos automaticamente.',
    steps: [
      'Acesse Fiscal → Naturezas de Operação.',
      'Clique "Nova natureza" para criar. Informe código (ex: VENDA), descrição (texto que vai no XML), e os CFOPs dentro/fora da UF.',
      'Configure ICMS (CST para regime normal, CSOSN para Simples Nacional, alíquota e redução de base).',
      'Configure PIS/COFINS (CST e alíquota). Para isento/outros, use CST 99 com alíquota 0.',
      'Configure IPI se aplicável (CST e alíquota). Deixe em branco se não tributa IPI.',
      'Marque as flags: "Gera financeiro" (cria contas a receber), "Movimenta estoque" (baixa itens).',
      'Selecione a finalidade (Normal, Complementar, Ajuste, Devolução) e o regime aplicável.',
      'Ao criar rascunho de NF-e, selecione a natureza no autocomplete — CFOP, CST e alíquotas são aplicados automaticamente a todos os itens.',
    ],
    dependsOn: ['Empresa ativa', 'Permissão: Vendas (view/manage)'],
    connectsWith: ['Emissão de NF-e', 'Configurações NF-e', 'Cadastro de Produtos'],
    fillPerfectly: [
      'Sempre preencha os dois CFOPs (dentro e fora UF) — o sistema escolhe automaticamente pela UF do destinatário.',
      'Use CST 00 para ICMS tributado integralmente no regime normal.',
      'Use CSOSN 102 para Simples Nacional sem permissão de crédito.',
      'Para operações isentas de ICMS, use CST 40 ou CSOSN 300.',
      'Desmarque "Gera financeiro" em remessas e transferências.',
    ],
    commonMistakes: [
      'Deixar CFOP em branco — a NF-e será rejeitada pela SEFAZ.',
      'Confundir CST (regime normal) com CSOSN (Simples Nacional) — use o campo correto para seu regime.',
      'Esquecer de preencher CFOP fora UF — vendas interestaduais usam 6xxx.',
      'Marcar "Gera financeiro" em remessas (não gera duplicata para remessas).',
    ],
    links: [
      { label: 'Naturezas de Operação', href: '/app/fiscal/naturezas-operacao', kind: 'internal' as const },
      { label: 'Emissão de NF-e', href: '/app/fiscal/nfe', kind: 'internal' as const },
    ],
    roadmapKey: 'fiscal',
  },
  {
    match: '/app/fiscal/regras',
    title: 'Guia Rápido — Regras Fiscais',
    whatIs:
      'Regras Fiscais são condições que sobrescrevem automaticamente CFOP, CST, alíquotas e outros dados fiscais para itens específicos da NF-e. Quando o motor fiscal calcula os impostos, ele verifica se alguma regra se aplica ao item (por grupo de produto, NCM, UF do destinatário, tipo de operação ou regime). A regra mais prioritária vence e seus valores substituem os defaults da Natureza de Operação.',
    steps: [
      'Acesse Fiscal → Regras Fiscais.',
      'Clique "Nova regra" e defina um nome descritivo (ex: "ICMS ST Informática SP").',
      'Configure as condições: selecione quando a regra se aplica (grupo de produto, padrão de NCM como 8471%, UF, tipo de operação, regime).',
      'Preencha os overrides: CFOP, CST/CSOSN, alíquotas — somente os campos que devem ser diferentes da natureza padrão.',
      'Defina a prioridade (menor número = maior prioridade). Quando dois itens casam com regras diferentes, a de menor prioridade vence.',
      'Ao recalcular impostos da NF-e (botão "Recalcular"), o motor aplica: natureza → regra fiscal → defaults do produto → edição manual. Cada item mostra a origem dos dados no "explain".',
    ],
    dependsOn: ['Empresa ativa', 'Naturezas de Operação configuradas', 'Grupos de Produto (se usar condição por grupo)'],
    connectsWith: ['Naturezas de Operação', 'Emissão de NF-e', 'Motor Fiscal v2', 'Cadastro de Produtos'],
    fillPerfectly: [
      'Deixe condições vazias para aplicar a "qualquer item" — útil para regras gerais de PIS/COFINS.',
      'Use padrão NCM com % para cobrir famílias inteiras (ex: 8471% = toda linha de informática).',
      'Crie regras específicas (prioridade menor) e regras genéricas (prioridade maior) para hierarquia.',
      'Campos override vazios significam "manter o valor da natureza" — preencha só o que muda.',
    ],
    commonMistakes: [
      'Criar regras com prioridade idêntica para as mesmas condições — o motor escolhe arbitrariamente.',
      'Esquecer de preencher tanto CFOP dentro quanto fora UF — se só preencher um, o outro usa o default da natureza.',
      'Confundir CST (regime normal) com CSOSN (Simples) — preencha o campo correto para o regime da empresa.',
      'Deixar todas as condições vazias E prioridade baixa — a regra vai sobrescrever tudo indiscriminadamente.',
    ],
    links: [
      { label: 'Regras Fiscais', href: '/app/fiscal/regras', kind: 'internal' as const },
      { label: 'Naturezas de Operação', href: '/app/fiscal/naturezas-operacao', kind: 'internal' as const },
      { label: 'Emissão de NF-e', href: '/app/fiscal/nfe', kind: 'internal' as const },
    ],
    roadmapKey: 'fiscal',
  },
  {
    match: '/app/fiscal/nfse',
    title: 'Guia Rápido — NFS-e (Nota Fiscal de Serviço Eletrônica)',
    whatIs:
      'A NFS-e é o documento fiscal eletrônico para prestação de serviços. Aqui você cria rascunhos, preenche dados do serviço (discriminação, ISS, item LC 116) e envia para autorização na prefeitura via Focus NFe.',
    steps: [
      'Configure o emitente com inscrição municipal em Fiscal → Configurações NF-e (obrigatório para emitir NFS-e).',
      'Clique em "Novo rascunho" e selecione o tomador (cliente), ambiente e natureza da operação.',
      'Preencha a discriminação do serviço, valor, alíquota ISS e item da lista de serviço (LC 116).',
      'Revise os dados e clique em "Salvar rascunho".',
      'Para enviar, clique em "Enviar" — o status muda: Rascunho → Processando → Autorizada ou Rejeitada.',
      'Após autorização: baixe o PDF e XML pelos botões de ação. O código de verificação pode ser copiado.',
    ],
    dependsOn: ['Empresa ativa com inscrição municipal', 'Emitente configurado (Configurações NF-e)', 'Empresa registrada na Focus NFe'],
    connectsWith: ['Configurações NF-e', 'Cadastro de Clientes (Pessoas)', 'Financeiro (Contas a Receber)'],
    fillPerfectly: [
      'Discriminação do serviço clara e objetiva (reduz rejeição pela prefeitura).',
      'Item da lista de serviço (LC 116) correto para o tipo de serviço prestado.',
      'Código IBGE do município de prestação correto.',
      'Alíquota ISS conforme legislação do município.',
    ],
    commonMistakes: [
      'Emitir sem inscrição municipal cadastrada — a prefeitura rejeita.',
      'Item LC 116 incorreto — causa rejeição ou tributação errada.',
      'Discriminação vaga (ex.: "serviços diversos") — pode ser recusada.',
      'Confundir homologação (teste) com produção (válido fiscalmente).',
    ],
    links: [
      { label: 'Abrir NFS-e', href: '/app/fiscal/nfse', kind: 'internal' as const },
      { label: 'Configurações NF-e', href: '/app/fiscal/nfe/configuracoes', kind: 'internal' as const },
    ],
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
    steps: [
      'Selecione a ordem/etapa.',
      'Confira o status: algumas ações exigem que a operação esteja “Liberada” (evita transição inválida).',
      'Aponte início/fim ou quantidade conforme o fluxo.',
      'Registre ocorrências (parada/refugo) quando houver.',
      'Finalize etapa e confira status/histórico.',
    ],
    dependsOn: ['OP/OB criada', 'Roteiro aplicado', 'Permissão: Indústria (execute)'],
    connectsWith: ['Execução', 'Chão de fábrica', 'Relatórios', 'Qualidade'],
    fillPerfectly: ['Não pular etapas.', 'Quantidade correta.', 'Motivo em ocorrências.'],
    commonMistakes: [
      'Tentar iniciar etapa em status “planejada” (precisa liberar/gerar operações primeiro).',
      'Apontar na ordem errada.',
      'Finalizar sem registrar ocorrência e perder causa.',
    ],
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
      'Dashboard industrial mostra WIP, filas, eficiência e faturamento. O objetivo é “ver e agir” — abrir o detalhe, corrigir gargalo e faturar quando necessário.',
    steps: [
      'Veja KPIs do período (incluindo “Pendente de Faturamento”).',
      'Clique para drill-down (ordens/etapas).',
      'Use “Faturar Sem Produção” para emitir NF-e sem criar OP (ideal quando produção já foi concluída externamente).',
      'Aja: repriorize, replaneje ou corrija apontamento.',
    ],
    dependsOn: ['Ordens e apontamentos'],
    connectsWith: ['Chão de fábrica', 'Relatórios', 'PCP', 'Fiscal (NF-e)'],
    fillPerfectly: ['Manter status atualizados.', 'Apontamentos com motivo em desvios.', 'Faturar OPs concluídas para manter KPIs corretos.'],
    commonMistakes: ['Usar dashboard sem dados (sem apontar).', 'Achar que precisa concluir toda a produção para poder faturar — o botão “Faturar” está disponível a qualquer momento.'],
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

  {
    match: '/app/industria/faturamento-beneficiamento',
    title: 'Guia Rápido de Faturamento de Beneficiamento',
    whatIs:
      'Tela de composição fiscal para ordens de beneficiamento. Selecione entregas elegíveis de uma ou mais OBs do mesmo cliente e gere uma NF-e rascunho diretamente, sem criar pedido de venda intermediário.',
    steps: [
      'Filtre por cliente, data ou busca livre.',
      'Selecione as entregas que deseja faturar (checkboxes).',
      'Ajuste o preço unitário se necessário.',
      'Escolha a natureza de operação (ex: Retorno de Beneficiamento).',
      'Clique em "Gerar NF-e Rascunho".',
      'Revise a NF-e na tela de emissões, calcule impostos e envie à SEFAZ.',
    ],
    dependsOn: ['OB com entregas marcadas como "Pronto para Faturar"'],
    connectsWith: ['NF-e Emissões', 'OP / OB', 'Status de Beneficiamentos'],
    fillPerfectly: [
      'Libere entregas para faturamento na OB antes de acessar esta tela.',
      'Agrupe entregas do mesmo cliente para reduzir número de NF-e.',
      'Revise a natureza de operação e CFOP antes de enviar à SEFAZ.',
    ],
    commonMistakes: [
      'Esquecer de liberar entregas na OB (status fica "Não Faturado").',
      'Selecionar entregas de clientes diferentes (NF-e precisa de um único destinatário).',
    ],
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
      'OP/OB organiza a produção/beneficiamento com estados travados e rastreabilidade. Para controle completo, “não pule etapas”. Para faturamento rápido, use o botão “Faturar” na OP ou OB a qualquer momento — produção/beneficiamento completo NÃO é obrigatório.',
    steps: [
      'Cadastre Centros de Trabalho, Roteiro e Ficha Técnica (BOM) para o produto.',
      'Crie uma OP/OB e aplique o roteiro/BOM.',
      'No chão de fábrica: aponte execução por etapa (quantidade/tempo/ocorrências).',
      'Valide consumo e saldos no estoque (quando aplicável) e finalize sem quebrar estados.',
      'Para faturar OB: registre entregas, clique em “Liberar p/ Faturamento” e depois vá em “Faturamento Beneficiamento” para compor a NF-e. Para OP: use o botão “Faturar” diretamente.',
    ],
    dependsOn: ['Produtos', 'Centros de trabalho', 'Roteiro + BOM', 'Permissão: Indústria (create/update)'],
    connectsWith: ['Suprimentos (estoque/consumo)', 'Qualidade (lotes/bloqueio)', 'Relatórios industriais', 'Fiscal (NF-e)'],
    fillPerfectly: [
      'Roteiro com tempos/ordem realistas (capacidade e filas fazem sentido).',
      'BOM coerente com o que realmente consome (evita falta “misteriosa”).',
      'Apontamentos por etapa com motivo/ocorrência quando houver (auditoria).',
    ],
    commonMistakes: [
      'Criar OP sem roteiro/BOM e depois “não sei o que consumir”.',
      'Apontar fora de ordem e quebrar rastreabilidade.',
      'Ignorar ocorrências (parada/refugo) e perder eficiência real.',
      'Achar que precisa concluir toda a produção/beneficiamento para poder faturar — o botão “Faturar” funciona em qualquer status (OP e OB).',
    ],
    roadmapKey: 'industria',
  },
  {
    match: '/app/configuracoes/ecommerce/marketplaces',
    title: 'Guia Rápido de Integrações (Marketplaces)',
    whatIs:
      'Integrações conectam o ERP ao canal (WooCommerce/Mercado Livre/Shopee). A meta é simples: operar pedidos e catálogo com previsibilidade (preview), reprocesso seguro (idempotente) e diagnóstico claro.',
    steps: [
      'Abra “Configurar” no card do provider e siga o assistente por etapas.',
      'WooCommerce: salve credenciais (CK/CS) e valide “Testar conexão”.',
      'Defina regras base (estoque/preço) e ative os recursos desejados.',
      'Catálogo (import/export + preview + execução): opere no módulo Produtos.',
      'Se algo falhar: verifique Saúde (Ops) e, se necessário, o Painel Woo (Desenvolvedor) para logs/DLQ por store.',
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

/**
 * Searches the help catalog by keyword. Returns best matches (up to `limit`).
 * Searches in: title, whatIs, steps, commonMistakes, fillPerfectly.
 */
export function searchHelpCatalog(query: string, limit = 3): HelpEntry[] {
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  const STOPWORDS = new Set([
    'como', 'esta', 'esse', 'essa', 'este', 'nosso', 'nossa', 'nossos', 'nossas',
    'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas',
    'que', 'para', 'por', 'com', 'sem', 'uma', 'uns', 'umas',
    'dos', 'das', 'nos', 'nas', 'aos', 'pela', 'pelo', 'pelas', 'pelos',
    'tem', 'ter', 'pode', 'qual', 'quais', 'mais', 'muito', 'muita',
    'todo', 'toda', 'todos', 'todas', 'bem', 'mal', 'vai', 'vou',
    'esta', 'isto', 'isso', 'aqui', 'ali', 'onde', 'quando',
    'sobre', 'entre', 'ainda', 'tambem', 'assim', 'entao',
  ]);

  const tokens = normalize(query)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

  if (tokens.length === 0) return [];

  const scored = HELP_CATALOG.map((entry) => {
    const haystack = normalize(
      [
        entry.title,
        entry.whatIs,
        ...(entry.steps || []),
        ...(entry.commonMistakes || []),
        ...(entry.fillPerfectly || []),
      ].join(' '),
    );

    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1;
      // Boost title matches
      if (normalize(entry.title).includes(token)) score += 2;
    }
    return { entry, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((r) => r.entry);
}

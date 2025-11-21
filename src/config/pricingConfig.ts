export const plans = {
  monthly: [
    {
      name: 'Start',
      price: 'R$49,00',
      priceId: 'START_MENSAL',
    },
    {
      name: 'Pro',
      price: 'R$159,00',
      priceId: 'PRO_MENSAL',
      isPopular: true,
    },
    {
      name: 'Max',
      price: 'R$349,00',
      priceId: 'MAX_MENSAL',
    },
    {
      name: 'Ultra',
      price: 'R$789,00',
      priceId: 'ULTRA_MENSAL',
    },
  ],
  annually: [
    {
      name: 'Start',
      price: 'R$39,90',
      priceId: 'START_ANUAL',
    },
    {
      name: 'Pro',
      price: 'R$129,00',
      priceId: 'PRO_ANUAL',
      isPopular: true,
    },
    {
      name: 'Max',
      price: 'R$275,00',
      priceId: 'MAX_ANUAL',
    },
    {
      name: 'Ultra',
      price: 'R$629,00',
      priceId: 'ULTRA_ANUAL',
    },
  ],
};

export const featureCategories = [
  {
    name: 'Usuários, armazenamento e histórico',
    features: [
      { name: 'Usuários', start: 'Ilimitado', pro: 'Ilimitado', max: 'Ilimitado', ultra: 'Ilimitado' },
      { name: 'Armazenamento de dados', start: 'Ilimitado', pro: 'Ilimitado', max: 'Ilimitado', ultra: 'Ilimitado' },
      { name: 'Armazenamento de anexos/imagens', start: '12 GB', pro: '12 GB', max: '12 GB', ultra: '12 GB' },
      { name: 'Histórico de consulta', start: '12 meses', pro: '24 meses', max: '36 meses', ultra: '36 meses' },
      { name: 'Regime fiscal suportado', start: 'Simples Nacional', pro: 'Simples Nacional + Regime Normal', max: 'Simples Nacional + Regime Normal', ultra: 'Simples Nacional + Regime Normal' },
    ],
  },
  {
    name: 'Atendimento',
    features: [
      { name: 'Central de ajuda', start: true, pro: true, max: true, ultra: true },
      { name: 'Suporte via ticket', start: true, pro: true, max: true, ultra: true },
      { name: 'Suporte via chat', start: false, pro: true, max: true, ultra: true },
      { name: 'Suporte por telefone', start: false, pro: false, max: true, ultra: true },
      { name: 'Atendimento com gerente de contas', start: false, pro: false, max: true, ultra: true },
      { name: 'Treinamento coletivo (onboarding em grupo)', start: false, pro: true, max: true, ultra: true },
      { name: 'Implementação guiada', start: false, pro: false, max: true, ultra: true },
      { name: 'Implementação personalizada', start: false, pro: false, max: false, ultra: true },
    ],
  },
  {
    name: 'Vendas online (OMS/Canal)',
    features: [
      { name: 'Integrações com marketplaces', start: true, pro: true, max: true, ultra: true },
      { name: 'Integrações com plataformas de e-commerce', start: true, pro: true, max: true, ultra: true },
      { name: 'Integrações logísticas', start: false, pro: 'Parcial', max: true, ultra: true },
      { name: 'Integração com módulo de envios (picking/etiquetas)', start: false, pro: true, max: true, ultra: true },
      { name: 'Anúncios (itens/variações ativas)', start: '2.000', pro: '5.000', max: '10.000', ultra: '20.000' },
      { name: 'Volume de vendas', start: 'Ilimitado', pro: 'Ilimitado', max: 'Ilimitado', ultra: 'Ilimitado' },
      { name: 'Importação/atualização automática de pedidos', start: 'Ilimitado', pro: 'Ilimitado', max: 'Ilimitado', ultra: 'Ilimitado' },
      { name: 'Sincronizações de estoque por mês', start: '150k', pro: '300k', max: '600k', ultra: '900k' },
      { name: 'Calculadora de preços / margem', start: false, pro: false, max: true, ultra: true },
    ],
  },
  {
    name: 'Vendas (PDV/CRM)',
    features: [
      { name: 'Relatório de performance de vendas', start: false, pro: false, max: true, ultra: true },
      { name: 'Desconto para gerente / fechamento de caixa', start: false, pro: false, max: true, ultra: true },
      { name: 'PDV (frente de caixa)', start: false, pro: true, max: true, ultra: true },
      { name: 'Controle de caixa do PDV', start: false, pro: false, max: true, ultra: true },
      { name: 'CRM (gestão de clientes)', start: false, pro: false, max: true, ultra: true },
      { name: 'Vendedores (comissão/rotas)', start: true, pro: true, max: true, ultra: true },
      { name: 'Google Shopping feed', start: false, pro: true, max: true, ultra: true },
      { name: 'SAT-CFe (SP)', start: false, pro: true, max: true, ultra: true },
      { name: 'PAF NFC-e (SC)', start: false, pro: true, max: true, ultra: true },
      { name: 'Devoluções de venda/NR', start: false, pro: false, max: true, ultra: true },
    ],
  },
  {
    name: 'Suprimentos / Estoque / Produção',
    features: [
      { name: 'Controle de estoque', start: true, pro: true, max: true, ultra: true },
      { name: 'Lotes e validades', start: false, pro: true, max: true, ultra: true },
      { name: 'Planejamento de compras (MRP básico)', start: false, pro: false, max: true, ultra: true },
      { name: 'Pedidos sob encomenda', start: false, pro: false, max: true, ultra: true },
      { name: 'Módulo de controle de produção (BOM/OP)', start: false, pro: false, max: true, ultra: true },
    ],
  },
  {
    name: 'Financeiro',
    features: [
      { name: 'Contas a pagar, receber e caixa', start: true, pro: true, max: true, ultra: true },
      { name: 'Emissão de boletos/cobranças', start: false, pro: true, max: true, ultra: true },
      { name: 'DRE / Demonstrativo de resultados', start: false, pro: false, max: true, ultra: true },
      { name: 'Integração com gateway de pagamento (checkout externo)', start: false, pro: false, max: true, ultra: true },
    ],
  },
  {
    name: 'Logística',
    features: [
      { name: 'Controle de expedição', start: true, pro: true, max: true, ultra: true },
      { name: 'Impressão automática de DANFE e etiqueta de envio', start: false, pro: false, max: true, ultra: true },
      { name: 'Separação e embalagem em lote', start: false, pro: false, max: true, ultra: true },
    ],
  },
  {
    name: 'Integração / API / Serviços',
    features: [
      { name: 'API de integração – requisições por minuto', start: false, pro: '30', max: '60', ultra: '120' },
      { name: 'Contratos de serviços', start: false, pro: true, max: true, ultra: true },
      { name: 'Ordens de serviço', start: false, pro: true, max: true, ultra: true },
      { name: 'NFS-e (limite por mês)', start: '20', pro: '200', max: '200', ultra: '200' },
    ],
  },
];

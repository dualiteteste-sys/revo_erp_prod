/**
 * Catálogo estático de rejeições SEFAZ para NF-e.
 * Fonte: Manual de Orientação ao Contribuinte (MOC) v7.x e NT 2024.001.
 *
 * Usado em NfeEmissoesPage para exibir ao usuário:
 *   - O que causou a rejeição
 *   - O que ele deve fazer para corrigir
 */

export type RejectionInfo = {
  code: string;
  /** Nome curto legível */
  descricao: string;
  /** Explicação amigável da causa em PT-BR */
  causa: string;
  /** O que o usuário deve fazer */
  acao: string;
  /** true se o problema pode ser resolvido editando o rascunho */
  editavel: boolean;
  /** Campo(s) afetado(s) para diagnóstico rápido */
  campoAfetado?: string;
};

export const NFE_REJECTION_CATALOG: Record<string, RejectionInfo> = {
  '202': {
    code: '202',
    descricao: 'Número máximo de NF-e atingido',
    causa: 'A série de NF-e atingiu o número máximo permitido (999999999).',
    acao: 'Entre em contato com o suporte ou altere a série da NF-e nas configurações fiscais.',
    editavel: false,
    campoAfetado: 'serie',
  },
  '206': {
    code: '206',
    descricao: 'CNPJ do emitente inválido',
    causa: 'O CNPJ informado para o emitente não é válido (falha no dígito verificador ou formato incorreto).',
    acao: 'Verifique o CNPJ em Fiscal → Configurações → Emitente. Confira se todos os 14 dígitos estão corretos.',
    editavel: false,
    campoAfetado: 'emitente.CNPJ',
  },
  '207': {
    code: '207',
    descricao: 'CNPJ do destinatário inválido',
    causa: 'O CNPJ do cliente destinatário não passou na validação do dígito verificador.',
    acao: 'Abra o cadastro do cliente e corrija o CNPJ antes de reenviar.',
    editavel: true,
    campoAfetado: 'destinatario.CNPJ',
  },
  '208': {
    code: '208',
    descricao: 'CPF do destinatário inválido',
    causa: 'O CPF do cliente destinatário não passou na validação do dígito verificador.',
    acao: 'Abra o cadastro do cliente e corrija o CPF antes de reenviar.',
    editavel: true,
    campoAfetado: 'destinatario.CPF',
  },
  '210': {
    code: '210',
    descricao: 'IE do emitente não cadastrada na SEFAZ',
    causa: 'A Inscrição Estadual informada para o emitente não está cadastrada na SEFAZ.',
    acao: 'Verifique a IE em Fiscal → Configurações → Emitente. Se o emitente for do Simples Nacional sem IE, deixe em branco.',
    editavel: false,
    campoAfetado: 'emitente.IE',
  },
  '214': {
    code: '214',
    descricao: 'Emitente não autorizado para NF-e',
    causa: 'O CNPJ do emitente não está habilitado para emitir NF-e na SEFAZ ou no ambiente configurado (homologação/produção).',
    acao: 'Certifique-se de que o credenciamento na SEFAZ está ativo. No painel Focus NFe, verifique se o CNPJ está configurado para este ambiente.',
    editavel: false,
    campoAfetado: 'emitente.CNPJ',
  },
  '228': {
    code: '228',
    descricao: 'Série fora do intervalo permitido',
    causa: 'O número de série informado está fora do intervalo autorizado para o emitente.',
    acao: 'Ajuste a série nas configurações de emissão ou verifique as faixas autorizadas na SEFAZ.',
    editavel: true,
    campoAfetado: 'serie',
  },
  '235': {
    code: '235',
    descricao: 'Município do emitente difere do CEP',
    causa: 'O município informado para o emitente não corresponde ao CEP cadastrado.',
    acao: 'Corrija o endereço do emitente em Fiscal → Configurações → Emitente. CEP e município devem ser consistentes.',
    editavel: false,
    campoAfetado: 'emitente.endereco',
  },
  '243': {
    code: '243',
    descricao: 'CNPJ do emitente difere do certificado digital',
    causa: 'O CNPJ informado na NF-e não corresponde ao CNPJ do certificado A1/A3 configurado no Focus NFe.',
    acao: 'Verifique qual CNPJ está vinculado ao certificado no painel do Focus NFe e atualize o emitente com o mesmo CNPJ.',
    editavel: false,
    campoAfetado: 'emitente.CNPJ',
  },
  '253': {
    code: '253',
    descricao: 'Duplicidade de NF-e',
    causa: 'Já existe uma NF-e com o mesmo número e série autorizada para este emitente.',
    acao: 'Não reenvie esta NF-e. Verifique se a NF-e já foi autorizada em outra tentativa.',
    editavel: false,
  },
  '301': {
    code: '301',
    descricao: 'UF do emitente inválida',
    causa: 'A sigla da UF do emitente não é reconhecida pela SEFAZ.',
    acao: 'Corrija a UF em Fiscal → Configurações → Emitente.',
    editavel: false,
    campoAfetado: 'emitente.UF',
  },
  '302': {
    code: '302',
    descricao: 'UF do destinatário inválida',
    causa: 'A sigla da UF do destinatário não é reconhecida pela SEFAZ.',
    acao: 'Corrija a UF no cadastro do cliente.',
    editavel: true,
    campoAfetado: 'destinatario.UF',
  },
  '327': {
    code: '327',
    descricao: 'Código de produto não informado',
    causa: 'Um ou mais itens da NF-e estão sem código de produto.',
    acao: 'Abra o rascunho, verifique cada item e certifique-se de que todos têm produto vinculado.',
    editavel: true,
    campoAfetado: 'itens.codigo_produto',
  },
  '357': {
    code: '357',
    descricao: 'CST/CSOSN inválido',
    causa: 'O código de situação tributária (CST ou CSOSN) de um item não é válido para o regime tributário do emitente.',
    acao: 'Verifique o CST/CSOSN dos produtos. Para Simples Nacional, use CSOSN (ex: 102). Para Lucro Real/Presumido, use CST.',
    editavel: true,
    campoAfetado: 'itens.icms_situacao_tributaria',
  },
  '360': {
    code: '360',
    descricao: 'NCM inválido',
    causa: 'O código NCM de um item não existe na tabela oficial da Receita Federal.',
    acao: 'Corrija o NCM no cadastro do produto. NCM deve ter 8 dígitos e ser válido na tabela TIPI.',
    editavel: true,
    campoAfetado: 'itens.ncm',
  },
  '409': {
    code: '409',
    descricao: 'Valor total dos itens diferente do total da NF-e',
    causa: 'A soma dos valores dos itens não corresponde ao valor total informado na NF-e.',
    acao: 'Abra o rascunho e recalcule os totais. Verifique descontos, fretes e impostos.',
    editavel: true,
  },
  '414': {
    code: '414',
    descricao: 'NCM inválido (tabela TIPI)',
    causa: 'O NCM de um item foi rejeitado pela tabela TIPI da Receita Federal.',
    acao: 'Consulte a tabela TIPI atualizada e corrija o NCM no cadastro do produto.',
    editavel: true,
    campoAfetado: 'itens.ncm',
  },
  '431': {
    code: '431',
    descricao: 'CFOP inválido',
    causa: 'O CFOP informado em um item não é válido ou não é permitido para este tipo de operação.',
    acao: 'Corrija o CFOP no cadastro do produto ou no item do rascunho. Para venda interna, use 5102; para venda interestadual, use 6102.',
    editavel: true,
    campoAfetado: 'itens.cfop',
  },
  '451': {
    code: '451',
    descricao: 'CEP do emitente inválido',
    causa: 'O CEP informado para o endereço do emitente não existe nos Correios.',
    acao: 'Corrija o CEP em Fiscal → Configurações → Emitente.',
    editavel: false,
    campoAfetado: 'emitente.CEP',
  },
  '453': {
    code: '453',
    descricao: 'CEP do destinatário inválido',
    causa: 'O CEP informado para o endereço do destinatário não existe nos Correios.',
    acao: 'Corrija o CEP no cadastro do cliente.',
    editavel: true,
    campoAfetado: 'destinatario.CEP',
  },
  '539': {
    code: '539',
    descricao: 'CNPJ do emitente não habilitado',
    causa: 'O CNPJ do emitente não está habilitado para emissão neste ambiente (homologação ou produção) junto ao Focus NFe / SEFAZ.',
    acao: 'No painel do Focus NFe, verifique se o CNPJ está configurado e habilitado para este ambiente. Para produção, certifique-se de que o credenciamento foi aprovado.',
    editavel: false,
    campoAfetado: 'emitente.CNPJ',
  },
  '543': {
    code: '543',
    descricao: 'Ambiente incorreto (homologação/produção)',
    causa: 'A NF-e foi enviada para o ambiente errado (ex: payload de produção enviado para homologação ou vice-versa).',
    acao: 'Verifique o ambiente configurado em Fiscal → Configurações e certifique-se de que corresponde ao ambiente do Focus NFe.',
    editavel: true,
    campoAfetado: 'ambiente',
  },
  '545': {
    code: '545',
    descricao: 'Chave de acesso inválida',
    causa: 'A chave de acesso gerada contém algum erro de formatação ou dígito verificador.',
    acao: 'Este é um erro interno. Tente reenviar. Se persistir, contate o suporte.',
    editavel: false,
  },
  '589': {
    code: '589',
    descricao: 'CSOSN inválido para CRT do emitente',
    causa: 'O CSOSN informado nos itens não é compatível com o CRT (Código de Regime Tributário) do emitente.',
    acao: 'Verifique o CRT do emitente em Fiscal → Configurações. Simples Nacional usa CSOSN; Lucro Real/Presumido usa CST.',
    editavel: true,
    campoAfetado: 'emitente.CRT',
  },
  '656': {
    code: '656',
    descricao: 'Certificado digital inválido ou expirado',
    causa: 'O certificado digital A1/A3 configurado no Focus NFe está expirado ou inválido.',
    acao: 'Renove o certificado digital junto à autoridade certificadora e atualize-o no painel do Focus NFe.',
    editavel: false,
  },
  '999': {
    code: '999',
    descricao: 'Rejeição genérica da SEFAZ',
    causa: 'A SEFAZ rejeitou a NF-e por um motivo não catalogado. Verifique a mensagem completa abaixo.',
    acao: 'Leia a mensagem de erro completa para identificar o campo problemático. Se necessário, contate o suporte com a mensagem completa.',
    editavel: false,
  },
};

/**
 * Extrai o código numérico de uma mensagem de rejeição SEFAZ.
 * Ex: "Rejeicao: 539 - CNPJ..." → "539"
 */
export function parseRejectionCode(mensagem: string | null | undefined): string | null {
  if (!mensagem) return null;
  const m = mensagem.match(/Rejei[çc][aã]o:?\s*(\d{3,4})/i);
  return m ? m[1] : null;
}

/**
 * Retorna as informações de catálogo para um código de rejeição.
 * Retorna null se o código não estiver no catálogo.
 */
export function getRejectionInfo(code: string | null | undefined): RejectionInfo | null {
  if (!code) return null;
  return NFE_REJECTION_CATALOG[code] ?? null;
}

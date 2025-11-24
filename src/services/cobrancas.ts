import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getPartners } from './partners';

export type StatusCobranca = 
  | 'pendente_emissao' 
  | 'emitida' 
  | 'registrada' 
  | 'enviada' 
  | 'liquidada' 
  | 'baixada' 
  | 'cancelada' 
  | 'erro';

export type TipoCobranca = 'boleto' | 'pix' | 'carne' | 'link_pagamento' | 'outro';

export type CobrancaBancaria = {
  id: string;
  conta_receber_id: string | null;
  cliente_id: string | null;
  cliente_nome?: string;
  conta_corrente_id: string | null;
  conta_nome?: string;
  documento_ref: string | null;
  descricao: string | null;
  tipo_cobranca: TipoCobranca;
  status: StatusCobranca;
  data_emissao: string | null;
  data_vencimento: string;
  data_liquidacao: string | null;
  valor_original: number;
  valor_atual: number;
  total_count?: number;
  // Campos detalhados (retornados pelo get)
  nosso_numero?: string | null;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  pix_qr_code?: string | null;
  url_pagamento?: string | null;
  eventos?: CobrancaEvento[];
};

export type CobrancaEvento = {
  id: string;
  tipo_evento: string;
  status_anterior: string | null;
  status_novo: string | null;
  mensagem: string | null;
  criado_em: string;
};

export type CobrancaPayload = Partial<Omit<CobrancaBancaria, 'id' | 'cliente_nome' | 'conta_nome' | 'eventos'>> & {
  id?: string;
};

export type CobrancaSummary = {
  pendentes: number;
  em_aberto: number;
  liquidadas: number;
  baixadas: number;
  com_erro: number;
};

export async function listCobrancas(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  status: StatusCobranca | null;
  clienteId?: string | null;
  startVenc?: Date | null;
  endVenc?: Date | null;
}): Promise<{ data: CobrancaBancaria[]; count: number }> {
  const { page, pageSize, searchTerm, status, clienteId, startVenc, endVenc } = options;
  const offset = (page - 1) * pageSize;

  try {
    const data = await callRpc<CobrancaBancaria[]>('financeiro_cobrancas_bancarias_list', {
      p_q: searchTerm || null,
      p_status: status || null,
      p_cliente_id: clienteId || null,
      p_start_venc: startVenc ? startVenc.toISOString().split('T')[0] : null,
      p_end_venc: endVenc ? endVenc.toISOString().split('T')[0] : null,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (!data || data.length === 0) {
      return { data: [], count: 0 };
    }

    const count = Number(data[0].total_count);
    return { data, count };
  } catch (error: any) {
    console.error('[SERVICE][LIST_COBRANCAS]', error);
    throw new Error(error.message || 'Não foi possível listar as cobranças.');
  }
}

export async function getCobrancaDetails(id: string): Promise<CobrancaBancaria> {
  try {
    return await callRpc<CobrancaBancaria>('financeiro_cobrancas_bancarias_get', { p_id: id });
  } catch (error: any) {
    console.error('[SERVICE][GET_COBRANCA]', error);
    throw new Error(error.message || 'Erro ao buscar detalhes da cobrança.');
  }
}

export async function saveCobranca(payload: CobrancaPayload): Promise<CobrancaBancaria> {
  try {
    return await callRpc<CobrancaBancaria>('financeiro_cobrancas_bancarias_upsert', { p_payload: payload });
  } catch (error: any) {
    console.error('[SERVICE][SAVE_COBRANCA]', error);
    throw new Error(error.message || 'Erro ao salvar a cobrança.');
  }
}

export async function deleteCobranca(id: string): Promise<void> {
  try {
    await callRpc('financeiro_cobrancas_bancarias_delete', { p_id: id });
  } catch (error: any) {
    console.error('[SERVICE][DELETE_COBRANCA]', error);
    throw new Error(error.message || 'Erro ao excluir a cobrança.');
  }
}

export async function getCobrancasSummary(startVenc?: Date | null, endVenc?: Date | null): Promise<CobrancaSummary> {
  try {
    const result = await callRpc<CobrancaSummary>('financeiro_cobrancas_bancarias_summary', {
      p_start_venc: startVenc ? startVenc.toISOString().split('T')[0] : null,
      p_end_venc: endVenc ? endVenc.toISOString().split('T')[0] : null,
    });
    return result || { pendentes: 0, em_aberto: 0, liquidadas: 0, baixadas: 0, com_erro: 0 };
  } catch (error: any) {
    console.error('[SERVICE][SUMMARY_COBRANCA]', error);
    throw new Error(error.message || 'Erro ao buscar resumo de cobranças.');
  }
}

export async function seedCobrancas(): Promise<void> {
  const { data: partners } = await getPartners({ 
    page: 1, 
    pageSize: 100, 
    searchTerm: '', 
    filterType: 'cliente', 
    sortBy: { column: 'nome', ascending: true } 
  });
  
  if (partners.length === 0) throw new Error('Crie clientes antes de gerar cobranças.');

  const promises = Array.from({ length: 5 }).map(() => {
    const partner = faker.helpers.arrayElement(partners);
    const status = faker.helpers.arrayElement(['pendente_emissao', 'emitida', 'liquidada']) as StatusCobranca;
    const valor = parseFloat(faker.finance.amount(50, 2000, 2));
    
    const payload: CobrancaPayload = {
      cliente_id: partner.id,
      descricao: `Cobrança Ref. ${faker.commerce.productName()}`,
      valor_original: valor,
      valor_atual: valor,
      data_vencimento: faker.date.soon({ days: 30 }).toISOString().split('T')[0],
      data_emissao: new Date().toISOString().split('T')[0],
      status: status,
      tipo_cobranca: 'boleto',
      documento_ref: `FAT-${faker.string.numeric(5)}`,
      observacoes: 'Gerado automaticamente',
    };
    return saveCobranca(payload);
  });
  await Promise.all(promises);
}

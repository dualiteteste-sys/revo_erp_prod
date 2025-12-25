import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getPartners } from './partners';

// Tipos alinhados com a nova tabela public.financeiro_contas_pagar
export type ContaPagar = {
    id: string;
    empresa_id: string;
    fornecedor_id: string | null;
    fornecedor_nome?: string;
    documento_ref: string | null;
    descricao: string | null;
    data_emissao: string | null;
    data_vencimento: string;
    data_pagamento: string | null;
    valor_total: number;
    valor_pago: number;
    multa: number;
    juros: number;
    desconto: number;
    saldo?: number; // Campo calculado retornado pela RPC
    forma_pagamento: string | null;
    centro_custo: string | null;
    categoria: string | null;
    status: 'aberta' | 'parcial' | 'paga' | 'cancelada';
    observacoes: string | null;
    created_at: string;
    updated_at: string;
};

export type ContaPagarPayload = Partial<Omit<ContaPagar, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'saldo' | 'fornecedor_nome'>> & {
    id?: string;
};

export type ContasPagarSummary = {
    abertas: number;
    parciais: number;
    pagas: number;
    vencidas: number;
};

export async function listContasPagar(options: {
    page: number;
    pageSize: number;
    searchTerm: string;
    status: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    sortBy: { column: string; ascending: boolean };
}): Promise<{ data: ContaPagar[]; count: number }> {
    const { page, pageSize, searchTerm, status, startDate, endDate } = options;
    const offset = (page - 1) * pageSize;
    
    try {
        // A RPC list já retorna o total_count, então não precisamos de duas chamadas
        const data = await callRpc<any[]>('financeiro_contas_pagar_list', {
            p_limit: pageSize,
            p_offset: offset,
            p_q: searchTerm || null,
            p_status: status || null,
            p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
            p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
        });

        if (!data || data.length === 0) {
            return { data: [], count: 0 };
        }

        const count = Number(data[0].total_count);
        return { data: data as ContaPagar[], count };
    } catch (error: any) {
        console.error('[SERVICE][LIST_CONTAS_PAGAR]', error);
        throw new Error(error.message || 'Não foi possível listar as contas a pagar.');
    }
}

export async function getContaPagarDetails(id: string): Promise<ContaPagar> {
    try {
        return await callRpc<ContaPagar>('financeiro_contas_pagar_get', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][GET_CONTA_PAGAR_DETAILS]', error);
        throw new Error(error.message || 'Erro ao buscar detalhes da conta.');
    }
}

export async function saveContaPagar(payload: ContaPagarPayload): Promise<ContaPagar> {
    try {
        return await callRpc<ContaPagar>('financeiro_contas_pagar_upsert', { p_payload: payload });
    } catch (error: any) {
        console.error('[SERVICE][SAVE_CONTA_PAGAR]', error);
        throw new Error(error.message || 'Erro ao salvar a conta.');
    }
}

export async function pagarContaPagar(params: { id: string; dataPagamento?: string; valorPago?: number }): Promise<ContaPagar> {
  try {
    return await callRpc<ContaPagar>('financeiro_conta_pagar_pagar', {
      p_id: params.id,
      p_data_pagamento: params.dataPagamento ?? null,
      p_valor_pago: params.valorPago ?? null,
    });
  } catch (error: any) {
    console.error('[SERVICE][PAGAR_CONTA_PAGAR]', error);
    throw new Error(error.message || 'Erro ao registrar pagamento.');
  }
}

export async function deleteContaPagar(id: string): Promise<void> {
    try {
        await callRpc('financeiro_contas_pagar_delete', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][DELETE_CONTA_PAGAR]', error);
        throw new Error(error.message || 'Erro ao excluir a conta.');
    }
}

export async function getContasPagarSummary(startDate?: Date | null, endDate?: Date | null): Promise<ContasPagarSummary> {
    try {
        const result = await callRpc<ContasPagarSummary>('financeiro_contas_pagar_summary', {
            p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
            p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
        });
        // Garante retorno de objeto válido mesmo se RPC retornar null (embora jsonb_build_object não deva retornar null)
        return result || { abertas: 0, parciais: 0, pagas: 0, vencidas: 0 };
    } catch (error: any) {
        console.error('[SERVICE][GET_CONTAS_PAGAR_SUMMARY]', error);
        // Repassa a mensagem original para facilitar diagnóstico
        throw new Error(error.message || 'Erro ao buscar o resumo financeiro.');
    }
}

export async function seedContasPagar(): Promise<void> {
  // Busca fornecedores existentes para vincular
  const { data: partners } = await getPartners({ 
    page: 1, 
    pageSize: 100, 
    searchTerm: '', 
    filterType: 'fornecedor', 
    sortBy: { column: 'nome', ascending: true } 
  });
  
  if (partners.length === 0) throw new Error('Crie fornecedores antes de gerar contas a pagar.');

  const promises = Array.from({ length: 5 }).map(() => {
    const partner = faker.helpers.arrayElement(partners);
    const status = faker.helpers.arrayElement(['aberta', 'paga', 'parcial']);
    const valorTotal = parseFloat(faker.finance.amount(100, 5000, 2));
    let valorPago = 0;

    if (status === 'paga') valorPago = valorTotal;
    if (status === 'parcial') valorPago = valorTotal / 2;

    const payload: ContaPagarPayload = {
      fornecedor_id: partner.id,
      descricao: `Compra de ${faker.commerce.productMaterial()}`,
      valor_total: valorTotal,
      valor_pago: valorPago,
      data_vencimento: faker.date.soon({ days: 45 }).toISOString().split('T')[0],
      data_emissao: faker.date.recent({ days: 10 }).toISOString().split('T')[0],
      status: status as any,
      observacoes: 'Gerado automaticamente',
      documento_ref: `NF-${faker.string.numeric(4)}`,
      forma_pagamento: faker.helpers.arrayElement(['Boleto', 'Pix', 'Transferência']),
      categoria: faker.helpers.arrayElement(['Matéria Prima', 'Serviços', 'Manutenção']),
    };
    return saveContaPagar(payload);
  });
  await Promise.all(promises);
}

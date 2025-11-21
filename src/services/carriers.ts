import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';

export type Carrier = Database['public']['Tables']['transportadoras']['Row'];
export type CarrierListItem = {
    id: string;
    nome_razao_social: string;
    cnpj: string | null;
    inscr_estadual: string | null;
    status: 'ativa' | 'inativa';
};
export type CarrierPayload = Partial<Carrier>;

/**
 * Busca uma lista paginada e filtrada de transportadoras.
 */
export async function getCarriers(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  filterStatus: string | null;
  sortBy: { column: keyof CarrierListItem; ascending: boolean };
}): Promise<{ data: CarrierListItem[]; count: number }> {
  const { page, pageSize, searchTerm, filterStatus, sortBy } = options;
  const offset = (page - 1) * pageSize;
  const orderString = `${sortBy.column} ${sortBy.ascending ? 'asc' : 'desc'}`;

  try {
    const count = await callRpc<number>('count_carriers', {
        p_q: searchTerm || null,
        p_status: (filterStatus as 'ativa' | 'inativa') || null,
    });

    if (Number(count) === 0) {
        return { data: [], count: 0 };
    }

    const data = await callRpc<CarrierListItem[]>('list_carriers', {
        p_limit: pageSize,
        p_offset: offset,
        p_q: searchTerm || null,
        p_status: (filterStatus as 'ativa' | 'inativa') || null,
        p_order: orderString,
    });

    return { data: data ?? [], count: Number(count) };
  } catch (error) {
      console.error('[SERVICE][GET_CARRIERS]', error);
      throw new Error('Não foi possível listar as transportadoras.');
  }
}

/**
 * Busca os detalhes completos de uma transportadora.
 */
export async function getCarrierDetails(id: string): Promise<Carrier | null> {
  try {
    const data = await callRpc<Carrier>('get_carrier_details', { p_id: id });
    return data;
  } catch (error) {
    console.error('[SERVICE][GET_CARRIER_DETAILS]', error);
    throw new Error('Erro ao buscar detalhes da transportadora.');
  }
}

/**
 * Cria ou atualiza uma transportadora.
 */
export async function saveCarrier(payload: CarrierPayload): Promise<Carrier> {
  try {
    const data = await callRpc<Carrier>('create_update_carrier', { p_payload: payload });
    return data;
  } catch (error: any) {
    console.error('[SERVICE][SAVE_CARRIER]', error);
    if (error.message && error.message.includes('ux_transportadoras_empresa_cnpj')) {
        throw new Error('Já existe uma transportadora com este CNPJ.');
    }
    throw new Error(error.message || 'Erro ao salvar a transportadora.');
  }
}

/**
 * Exclui uma transportadora.
 */
export async function deleteCarrier(id: string): Promise<void> {
  try {
    await callRpc('delete_carrier', { p_id: id });
  } catch (error: any) {
    console.error('[SERVICE][DELETE_CARRIER]', error);
    throw new Error(error.message || 'Erro ao excluir a transportadora.');
  }
}

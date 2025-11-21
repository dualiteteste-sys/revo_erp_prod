import { callRpc } from '@/lib/api';
import { Database } from '@/types/database.types';

export type PartnerListItem = {
  id: string;
  nome: string;
  tipo: Database['public']['Enums']['pessoa_tipo'];
  doc_unico: string | null;
  created_at: string;
  updated_at: string;
};

// HACK: Add fields that might be missing from generated types but exist in the DB
export type Pessoa = Database['public']['Tables']['pessoas']['Row'] & {
  celular?: string | null;
  site?: string | null;
  limite_credito?: number | null;
  condicao_pagamento?: string | null;
  informacoes_bancarias?: string | null;
};

export type PartnerPessoa = Partial<Pessoa>;

// New types based on OpenAPI spec
export type EnderecoPayload = {
  id?: string | null;
  tipo_endereco?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  pais?: string | null;
};

export type ContatoPayload = {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  cargo?: string | null;
  observacoes?: string | null;
};

export type PartnerPayload = {
  pessoa: PartnerPessoa;
  enderecos?: EnderecoPayload[] | null;
  contatos?: ContatoPayload[] | null;
};

export type PartnerDetails = Pessoa & {
  enderecos: EnderecoPayload[];
  contatos: ContatoPayload[];
};

export type ClientHit = { id: string; label: string; nome: string; doc_unico: string | null };

export async function savePartner(payload: PartnerPayload): Promise<PartnerDetails> {
  console.log('[SERVICE][SAVE_PARTNER]', payload);
  try {
    // Explicitly build the pessoa object to ensure all fields are present
    const pessoaPayload: PartnerPessoa = {
      ...payload.pessoa,
      doc_unico: payload.pessoa.doc_unico?.replace(/\D/g, '') || null,
      telefone: payload.pessoa.telefone?.replace(/\D/g, '') || null,
      celular: payload.pessoa.celular?.replace(/\D/g, '') || null,
      limite_credito: payload.pessoa.limite_credito,
      condicao_pagamento: payload.pessoa.condicao_pagamento,
      informacoes_bancarias: payload.pessoa.informacoes_bancarias,
    };

    const cleanedPayload = {
      pessoa: pessoaPayload,
      enderecos: payload.enderecos?.map(e => ({...e, cep: e.cep?.replace(/\D/g, '') || null})) || [],
      contatos: payload.contatos?.map(c => ({...c, telefone: c.telefone?.replace(/\D/g, '') || null})) || [],
    };

    const data = await callRpc<PartnerDetails>('create_update_partner', { p_payload: cleanedPayload });
    return data;
  } catch (error: any) {
    console.error('[SERVICE][SAVE_PARTNER][ERROR]', error);
    if (error.message && error.message.includes('ux_pessoas_empresa_id_doc_unico')) {
        throw new Error('Já existe um parceiro com este documento (CPF/CNPJ).');
    }
    throw error;
  }
}

export async function getPartners(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  filterType: string | null;
  sortBy: { column: keyof PartnerListItem; ascending: boolean };
}): Promise<{ data: PartnerListItem[]; count: number }> {
  const { page, pageSize, searchTerm, filterType, sortBy } = options;
  const offset = (page - 1) * pageSize;
  const orderString = `${sortBy.column} ${sortBy.ascending ? 'asc' : 'desc'}`;

  try {
    const count = await callRpc<number>('count_partners', {
      p_q: searchTerm || null,
      p_tipo: (filterType as Database['public']['Enums']['pessoa_tipo']) || null,
    });

    if (Number(count) === 0) {
      return { data: [], count: 0 };
    }

    const data = await callRpc<PartnerListItem[]>('list_partners', {
      p_limit: pageSize,
      p_offset: offset,
      p_q: searchTerm || null,
      p_tipo: (filterType as Database['public']['Enums']['pessoa_tipo']) || null,
      p_order: orderString,
    });

    return { data: data ?? [], count: Number(count) };
  } catch (error) {
    console.error('[SERVICE][GET_PARTNERS]', error);
    throw new Error('Não foi possível listar os registros.');
  }
}

export async function getPartnerDetails(id: string): Promise<PartnerDetails | null> {
  try {
    const rpcResponse = await callRpc<PartnerDetails | PartnerDetails[]>('get_partner_details', { p_id: id });
    
    const data = Array.isArray(rpcResponse) ? rpcResponse[0] : rpcResponse;

    if (data) {
        data.enderecos = data.enderecos || [];
        data.contatos = data.contatos || [];
    }
    return data || null;
  } catch (error) {
    console.error('[SERVICE][GET_PARTNER_DETAILS]', error);
    throw new Error('Erro ao buscar detalhes do registro.');
  }
}

export async function deletePartner(id: string): Promise<void> {
  try {
    await callRpc('delete_partner', { p_id: id });
  } catch (error: any) {
    console.error('[SERVICE][DELETE_PARTNER]', error);
    throw new Error(error.message || 'Erro ao excluir o registro.');
  }
}

export async function seedDefaultPartners(): Promise<Pessoa[]> {
  console.log('[RPC] seed_partners_for_current_user');
  return callRpc<Pessoa[]>('seed_partners_for_current_user');
}

export async function searchClients(q: string, limit = 20): Promise<ClientHit[]> {
  return callRpc<ClientHit[]>('search_clients_for_current_user', { p_search: q, p_limit: limit });
}

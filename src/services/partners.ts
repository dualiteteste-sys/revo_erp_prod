import { callRpc } from '@/lib/api';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/types/database.types';

export type PartnerListItem = {
  id: string;
  nome: string;
  tipo: Database['public']['Enums']['pessoa_tipo'];
  doc_unico: string | null;
  email: string | null;
  telefone: string | null;
  deleted_at: string | null;
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
  deleted_at?: string | null;
};

export type PartnerPessoa = Partial<Pessoa>;

export type PartnerStatusFilter = 'active' | 'inactive' | 'all';

// New types based on OpenAPI spec
export type EnderecoPayload = {
  id?: string | null;
  tipo_endereco?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  cidade_codigo?: string | null; // IBGE (7 dígitos) - opcional
  uf?: string | null;
  cep?: string | null;
  pais?: string | null;
  pais_codigo?: string | null; // Ex.: 1058 (Brasil) - opcional
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

export type PartnerDuplicateHit = {
  id: string;
  nome: string;
  doc_unico: string | null;
  email: string | null;
  telefone: string | null;
  celular?: string | null;
};

export async function findPartnerDuplicates(params: {
  excludeId?: string | null;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
}): Promise<PartnerDuplicateHit[]> {
  const email = String(params.email || '').trim().toLowerCase();
  const tel = String(params.telefone || '').replace(/\D/g, '');
  const cel = String(params.celular || '').replace(/\D/g, '');
  const excludeId = params.excludeId ? String(params.excludeId) : null;

  const results: PartnerDuplicateHit[] = [];
  const seen = new Set<string>();

  const pushAll = (rows: any[] | null | undefined) => {
    for (const r of rows || []) {
      const id = String(r.id);
      if (excludeId && id === excludeId) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({
        id,
        nome: String(r.nome || ''),
        doc_unico: r.doc_unico ? String(r.doc_unico) : null,
        email: r.email ? String(r.email) : null,
        telefone: r.telefone ? String(r.telefone) : null,
        celular: r.celular ? String(r.celular) : null,
      });
    }
  };

  if (email) {
    const q = supabase
      .from('pessoas')
      .select('id,nome,doc_unico,email,telefone,celular')
      .ilike('email', email)
      .is('deleted_at', null)
      .limit(10);
    if (excludeId) q.neq('id', excludeId);
    const { data, error } = await q;
    if (!error) pushAll(data as any[]);
  }

  const phones = [tel, cel].filter((d) => d && d.length >= 10);
  for (const phone of phones) {
    const q = supabase
      .from('pessoas')
      .select('id,nome,doc_unico,email,telefone,celular')
      .or(`telefone.eq.${phone},celular.eq.${phone}`)
      .is('deleted_at', null)
      .limit(10);
    if (excludeId) q.neq('id', excludeId);
    const { data, error } = await q;
    if (!error) pushAll(data as any[]);
  }

  return results;
}

export async function savePartner(payload: PartnerPayload): Promise<PartnerDetails> {
  logger.debug('[SERVICE][SAVE_PARTNER]', { payload });
  try {
    // Explicitly build the pessoa object to ensure all fields are present
    const pessoaPayload: PartnerPessoa = {
      ...payload.pessoa,
      doc_unico: payload.pessoa.doc_unico?.replace(/\D/g, '') || null,
      telefone: payload.pessoa.telefone?.replace(/\D/g, '') || null,
      celular: payload.pessoa.celular?.replace(/\D/g, '') || null,
      contribuinte_icms: payload.pessoa.contribuinte_icms ?? '9',
      limite_credito: payload.pessoa.limite_credito,
      condicao_pagamento: payload.pessoa.condicao_pagamento,
      informacoes_bancarias: payload.pessoa.informacoes_bancarias,
      contato_tags: payload.pessoa.contato_tags || [], // Ensure array to avoid scalar error
    };

    const cleanedPayload = {
      pessoa: pessoaPayload,
      enderecos:
        payload.enderecos?.map((e) => ({
          ...e,
          cep: e.cep?.replace(/\D/g, '') || null,
          cidade_codigo: e.cidade_codigo?.replace(/\D/g, '') || null,
          pais_codigo: e.pais_codigo?.replace(/\D/g, '') || null,
        })) || [],
      contatos: payload.contatos?.map(c => ({ ...c, telefone: c.telefone?.replace(/\D/g, '') || null })) || [],
    };

    const data = await callRpc<PartnerDetails>('create_update_partner', { p_payload: cleanedPayload });
    return data;
  } catch (error: any) {
    logger.error('[SERVICE][SAVE_PARTNER][ERROR]', error, { payload });
    if (error.message && (
      error.message.includes('ux_pessoas_empresa_id_doc_unico') ||
      error.message.includes('idx_pessoas_empresa_id_doc_unico_not_null')
    )) {
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
  statusFilter?: PartnerStatusFilter;
  sortBy: { column: keyof PartnerListItem; ascending: boolean };
}): Promise<{ data: PartnerListItem[]; count: number }> {
  const { page, pageSize, searchTerm, filterType, statusFilter = 'active', sortBy } = options;
  const offset = (page - 1) * pageSize;
  const orderString = `${sortBy.column} ${sortBy.ascending ? 'asc' : 'desc'}`;

  try {
    const orderByAllowed: Array<keyof PartnerListItem> = ['nome', 'created_at', 'updated_at', 'doc_unico'];
    const v2OrderBy: keyof PartnerListItem = orderByAllowed.includes(sortBy.column) ? sortBy.column : 'nome';
    const v2OrderDir = sortBy.ascending ? 'asc' : 'desc';

    try {
      const countV2 = await callRpc<number>('count_partners_v2', {
        p_search: searchTerm || null,
        p_tipo: (filterType as Database['public']['Enums']['pessoa_tipo']) || null,
        p_status: statusFilter,
      });

      if (Number(countV2) === 0) return { data: [], count: 0 };

      const dataV2 = await callRpc<PartnerListItem[]>('list_partners_v2', {
        p_search: searchTerm || null,
        p_tipo: (filterType as Database['public']['Enums']['pessoa_tipo']) || null,
        p_status: statusFilter,
        p_limit: pageSize,
        p_offset: offset,
        p_order_by: v2OrderBy,
        p_order_dir: v2OrderDir,
      });

      return { data: dataV2 ?? [], count: Number(countV2) };
    } catch (errorV2) {
      const countLegacy = await callRpc<number>('count_partners', {
        p_q: searchTerm || null,
        p_tipo: (filterType as Database['public']['Enums']['pessoa_tipo']) || null,
      });

      if (Number(countLegacy) === 0) return { data: [], count: 0 };

      const dataLegacy = await callRpc<PartnerListItem[]>('list_partners', {
        p_limit: pageSize,
        p_offset: offset,
        p_q: searchTerm || null,
        p_tipo: (filterType as Database['public']['Enums']['pessoa_tipo']) || null,
        p_order: orderString,
      });

      return { data: dataLegacy ?? [], count: Number(countLegacy) };
    }
  } catch (error) {
    logger.error('[SERVICE][GET_PARTNERS]', error, { options });
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
    logger.error('[SERVICE][GET_PARTNER_DETAILS]', error, { id });
    throw new Error('Erro ao buscar detalhes do registro.');
  }
}

export async function deletePartner(id: string): Promise<void> {
  try {
    await callRpc('delete_partner', { p_id: id });
  } catch (error: any) {
    logger.error('[SERVICE][DELETE_PARTNER]', error, { id });
    const msg = String(error?.message || '');

    if (/HTTP_409/i.test(msg) && /violates foreign key constraint/i.test(msg)) {
      throw new Error(
        'Não é possível excluir este registro porque existem dados vinculados a ele. ' +
          'Para manter o histórico do sistema, a exclusão é bloqueada.'
      );
    }

    throw new Error(msg || 'Erro ao excluir o registro.');
  }
}

export async function restorePartner(id: string): Promise<void> {
  try {
    await callRpc('restore_partner', { p_id: id });
  } catch (error: any) {
    logger.error('[SERVICE][RESTORE_PARTNER]', error, { id });
    const msg = String(error?.message || '');
    throw new Error(msg || 'Erro ao reativar o registro.');
  }
}

export async function seedDefaultPartners(): Promise<Pessoa[]> {
  logger.debug('[RPC] seed_partners_for_current_user');
  return callRpc<Pessoa[]>('seed_partners_for_current_user');
}

export async function searchClients(q: string, limit = 20): Promise<ClientHit[]> {
  return callRpc<ClientHit[]>('search_clients_for_current_user', { p_search: q, p_limit: limit });
}

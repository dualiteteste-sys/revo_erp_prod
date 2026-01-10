import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';

export type TipoCentroCusto = 'receita' | 'custo_fixo' | 'custo_variavel' | 'investimento';

export type CentroDeCusto = {
    id: string;
    empresa_id: string;
    parent_id: string | null;
    codigo: string | null;
    nome: string;
    tipo: TipoCentroCusto;
    nivel: number;
    ordem: number;
    ativo: boolean;
    observacoes: string | null;
    created_at: string;
    updated_at: string;
    // Campos virtuais retornados pelo GET details
    parent_nome?: string;
    has_children?: boolean;
    is_system_root?: boolean;
};

export type CentroDeCustoPayload = Partial<Omit<CentroDeCusto, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'parent_nome' | 'has_children'>> & {
    id?: string;
};

export type CentroDeCustoListItem = {
    id: string;
    parent_id: string | null;
    codigo: string | null;
    nome: string;
    tipo: TipoCentroCusto;
    nivel: number;
    ordem: number;
    ativo: boolean;
    observacoes: string | null;
    is_system_root?: boolean;
    total_count: number;
};

export async function listCentrosDeCusto(options: {
    page: number;
    pageSize: number;
    searchTerm: string;
    status: string | null; // 'ativo' | 'inativo' | null from UI filter
    tipo?: TipoCentroCusto | null;
    sortBy?: { column: string; ascending: boolean };
}): Promise<{ data: CentroDeCustoListItem[]; count: number }> {
    const { page, pageSize, searchTerm, status } = options;
    const offset = (page - 1) * pageSize;
    
    // Map UI status string to boolean
    let ativo: boolean | null = null;
    if (status === 'ativo') ativo = true;
    if (status === 'inativo') ativo = false;

    try {
        const data = await callRpc<CentroDeCustoListItem[]>('financeiro_centros_custos_list', {
            p_limit: pageSize,
            p_offset: offset,
            p_search: searchTerm || null,
            p_ativo: ativo,
            p_tipo: options.tipo ?? null,
        });

        if (!data || data.length === 0) {
            return { data: [], count: 0 };
        }

        const count = Number(data[0].total_count);
        return { data, count };
    } catch (error) {
        console.error('[SERVICE][LIST_CENTROS_DE_CUSTO]', error);
        throw new Error('Não foi possível listar os centros de custo.');
    }
}

export async function listAllCentrosDeCusto(params?: { status?: 'ativo' | 'inativo' | null; tipo?: TipoCentroCusto | null }): Promise<CentroDeCustoListItem[]> {
  const status = params?.status ?? null;
  const tipo = params?.tipo ?? null;
  const pageSize = 200;
  const out: CentroDeCustoListItem[] = [];

  let page = 1;
  let total = 0;
  do {
    const { data, count } = await listCentrosDeCusto({ page, pageSize, searchTerm: '', status, tipo });
    out.push(...data);
    total = count;
    page += 1;
  } while (out.length < total);

  return out;
}

export async function getCentroDeCustoDetails(id: string): Promise<CentroDeCusto> {
    try {
        return await callRpc<CentroDeCusto>('financeiro_centros_custos_get', { p_id: id });
    } catch (error) {
        console.error('[SERVICE][GET_CENTRO_DE_CUSTO_DETAILS]', error);
        throw new Error('Erro ao buscar detalhes do centro de custo.');
    }
}

export async function saveCentroDeCusto(payload: CentroDeCustoPayload): Promise<CentroDeCusto> {
    try {
        return await callRpc<CentroDeCusto>('financeiro_centros_custos_upsert', { p_payload: payload });
    } catch (error: any) {
        console.error('[SERVICE][SAVE_CENTRO_DE_CUSTO]', error);
        if (error.message && error.message.includes('fin_ccustos_empresa_codigo_uk')) {
            throw new Error('Já existe um centro de custo com este código.');
        }
        if (error.message && error.message.includes('fin_ccustos_empresa_nome_parent_uk')) {
            throw new Error('Já existe um centro de custo com este nome neste nível.');
        }
        throw new Error(error.message || 'Erro ao salvar o centro de custo.');
    }
}

export async function deleteCentroDeCusto(id: string): Promise<void> {
    try {
        await callRpc('financeiro_centros_custos_delete', { p_id: id });
    } catch (error: any) {
        console.error('[SERVICE][DELETE_CENTRO_DE_CUSTO]', error);
        throw new Error(error.message || 'Erro ao excluir o centro de custo.');
    }
}

export async function searchCentrosDeCusto(query: string): Promise<CentroDeCustoListItem[]> {
    try {
        const { data } = await listCentrosDeCusto({
            page: 1,
            pageSize: 20,
            searchTerm: query,
            status: 'ativo',
        });
        return data;
    } catch (error) {
        console.error('[SERVICE][SEARCH_CENTROS]', error);
        return [];
    }
}

export async function seedCentrosDeCusto(): Promise<void> {
  const existing = await listAllCentrosDeCusto({ status: 'ativo' });
  const byCode = new Map<string, CentroDeCustoListItem>();
  for (const r of existing) {
    const c = String(r.codigo ?? '').trim();
    if (!c) continue;
    byCode.set(c, r);
  }

  const roots = ['1', '2', '3', '4'].map((c) => byCode.get(c)).filter(Boolean) as CentroDeCustoListItem[];
  if (roots.length !== 4) throw new Error('Raízes padrão (1/2/3/4) não encontradas.');

  const usedCodes = new Set(existing.map((r) => String(r.codigo ?? '').trim()).filter(Boolean));
  const makeCode = (rootCode: string) => {
    for (let i = 0; i < 20; i += 1) {
      const code = `${rootCode}.${faker.string.numeric(2)}.${faker.string.numeric(2)}`;
      if (!usedCodes.has(code)) return code;
    }
    return `${rootCode}.${Date.now()}`;
  };

  const promises = Array.from({ length: 5 }).map(async () => {
    const root = faker.helpers.arrayElement(roots);
    const rootCode = String(root.codigo ?? '').trim() || '3';
    const codigo = makeCode(rootCode);
    usedCodes.add(codigo);

    const payload: CentroDeCustoPayload = {
      parent_id: root.id,
      nome: faker.commerce.department(),
      codigo,
      ativo: true,
      observacoes: faker.lorem.sentence(),
    };
    return saveCentroDeCusto(payload);
  });
  await Promise.all(promises);
}

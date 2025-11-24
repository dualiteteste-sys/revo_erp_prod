import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getProducts } from './products';
import { getPartners } from './partners';

export type MaterialClienteListItem = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  produto_id: string;
  produto_nome: string;
  codigo_cliente: string | null;
  nome_cliente: string | null;
  unidade: string | null;
  ativo: boolean;
  total_count: number;
};

export type MaterialClienteDetails = {
  id: string;
  empresa_id: string;
  cliente_id: string;
  cliente_nome: string;
  produto_id: string;
  produto_nome: string;
  codigo_cliente: string | null;
  nome_cliente: string | null;
  unidade: string | null;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialClientePayload = Partial<Omit<MaterialClienteDetails, 'cliente_nome' | 'produto_nome' | 'created_at' | 'updated_at' | 'empresa_id'>>;

export async function listMateriaisCliente(
  search?: string,
  clienteId?: string,
  ativo?: boolean,
  page = 1,
  pageSize = 50
): Promise<{ data: MaterialClienteListItem[]; count: number }> {
  const offset = (page - 1) * pageSize;
  const data = await callRpc<MaterialClienteListItem[]>('industria_materiais_cliente_list', {
    p_search: search || null,
    p_cliente_id: clienteId || null,
    p_ativo: ativo ?? null,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (!data || data.length === 0) {
    return { data: [], count: 0 };
  }

  const count = Number(data[0].total_count);
  return { data, count };
}

export async function getMaterialClienteDetails(id: string): Promise<MaterialClienteDetails> {
  return callRpc<MaterialClienteDetails>('industria_materiais_cliente_get', { p_id: id });
}

export async function saveMaterialCliente(payload: MaterialClientePayload): Promise<MaterialClienteDetails> {
  return callRpc<MaterialClienteDetails>('industria_materiais_cliente_upsert', { p_payload: payload });
}

export async function deleteMaterialCliente(id: string): Promise<void> {
  await callRpc('industria_materiais_cliente_delete', { p_id: id });
}

export async function seedMateriaisCliente(): Promise<void> {
  // 1. Fetch dependencies
  const { data: partners } = await getPartners({ page: 1, pageSize: 100, searchTerm: '', filterType: 'cliente', sortBy: { column: 'nome', ascending: true } });
  const { data: products } = await getProducts({ page: 1, pageSize: 100, searchTerm: '', status: 'ativo', sortBy: { column: 'nome', ascending: true } });

  if (partners.length === 0) throw new Error('Crie clientes antes de gerar materiais de cliente.');
  if (products.length === 0) throw new Error('Crie produtos antes de gerar materiais de cliente.');

  // 2. Generate 5 Materials
  for (let i = 0; i < 5; i++) {
    const client = faker.helpers.arrayElement(partners);
    const product = faker.helpers.arrayElement(products);

    const payload: MaterialClientePayload = {
      cliente_id: client.id,
      produto_id: product.id,
      codigo_cliente: `CLI-${faker.string.numeric(4)}`,
      nome_cliente: `Ref. Cliente - ${product.nome}`,
      unidade: product.unidade || 'un',
      ativo: true,
      observacoes: faker.lorem.sentence(),
    };

    await saveMaterialCliente(payload);
  }
}

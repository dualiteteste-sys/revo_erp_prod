import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getProducts } from './products';

export type BomType = 'producao' | 'beneficiamento' | 'ambos';

export type BomListItem = {
  id: string;
  produto_final_id: string;
  produto_nome: string;
  tipo_bom: BomType;
  codigo: string | null;
  versao: number;
  ativo: boolean;
  padrao_para_producao: boolean;
  padrao_para_beneficiamento: boolean;
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
};

export type BomComponente = {
  id: string;
  bom_id: string;
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  perda_percentual: number;
  obrigatorio: boolean;
  observacoes: string | null;
};

export type BomDetails = {
  id: string;
  empresa_id: string;
  produto_final_id: string;
  produto_nome: string;
  tipo_bom: BomType;
  codigo: string | null;
  descricao: string | null;
  versao: number;
  ativo: boolean;
  padrao_para_producao: boolean;
  padrao_para_beneficiamento: boolean;
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  componentes: BomComponente[];
};

export type BomPayload = Partial<Omit<BomDetails, 'produto_nome' | 'componentes' | 'created_at' | 'updated_at' | 'empresa_id'>>;

export async function listBoms(
  search?: string,
  produtoId?: string,
  tipoBom?: BomType,
  ativo?: boolean
): Promise<BomListItem[]> {
  return callRpc<BomListItem[]>('industria_bom_list', {
    p_search: search || null,
    p_produto_id: produtoId || null,
    p_tipo_bom: tipoBom || null,
    p_ativo: ativo ?? null,
  });
}

export async function getBomDetails(id: string): Promise<BomDetails> {
  return callRpc<BomDetails>('industria_bom_get_details', { p_id: id });
}

export async function saveBom(payload: BomPayload): Promise<BomDetails> {
  return callRpc<BomDetails>('industria_bom_upsert', { p_payload: payload });
}

export async function deleteBom(id: string): Promise<void> {
  await callRpc('industria_bom_delete', { p_id: id });
}

export async function manageBomComponente(
  bomId: string,
  componenteId: string | null,
  produtoId: string,
  quantidade: number,
  unidade: string,
  perdaPercentual: number,
  obrigatorio: boolean,
  observacoes: string | null,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_bom_manage_componente', {
    p_bom_id: bomId,
    p_componente_id: componenteId,
    p_produto_id: produtoId,
    p_quantidade: quantidade,
    p_unidade: unidade,
    p_perda_percentual: perdaPercentual,
    p_obrigatorio: obrigatorio,
    p_observacoes: observacoes,
    p_action: action,
  });
}

export async function aplicarBomProducao(
  bomId: string,
  ordemId: string,
  modo: 'substituir' | 'adicionar' = 'substituir'
): Promise<void> {
  await callRpc('industria_aplicar_bom_em_ordem_producao', {
    p_bom_id: bomId,
    p_ordem_id: ordemId,
    p_modo: modo,
  });
}

export async function aplicarBomBeneficiamento(
  bomId: string,
  ordemId: string,
  modo: 'substituir' | 'adicionar' = 'substituir'
): Promise<void> {
  await callRpc('industria_aplicar_bom_em_ordem_beneficiamento', {
    p_bom_id: bomId,
    p_ordem_id: ordemId,
    p_modo: modo,
  });
}

export async function seedBoms(): Promise<void> {
  // 1. Fetch potential products
  const { data: products } = await getProducts({ page: 1, pageSize: 100, searchTerm: '', status: 'ativo', sortBy: { column: 'nome', ascending: true } });

  if (products.length < 2) throw new Error('Necessário pelo menos 2 produtos cadastrados para criar uma BOM (1 pai, 1 filho).');

  // 2. Generate 5 BOMs
  for (let i = 0; i < 5; i++) {
    // Pick a random parent product
    const parent = faker.helpers.arrayElement(products);
    // Filter out parent to get potential children
    const potentialChildren = products.filter(p => p.id !== parent.id);
    if (potentialChildren.length === 0) continue;

    const tipo = faker.helpers.arrayElement(['producao', 'beneficiamento', 'ambos']) as BomType;

    const payload: BomPayload = {
      produto_final_id: parent.id,
      tipo_bom: tipo,
      codigo: `FT-${faker.string.numeric(4)}`,
      descricao: `Ficha Técnica v${faker.number.int({ min: 1, max: 9 })}`,
      versao: faker.number.int({ min: 1, max: 10 }),
      ativo: true,
      padrao_para_producao: tipo === 'producao' || tipo === 'ambos',
      padrao_para_beneficiamento: tipo === 'beneficiamento' || tipo === 'ambos',
      data_inicio_vigencia: new Date().toISOString(),
      observacoes: faker.lorem.sentence(),
    };

    const savedBom = await saveBom(payload);

    // 3. Add 2-5 components
    const numComponents = faker.number.int({ min: 2, max: Math.min(5, potentialChildren.length) });
    const children = faker.helpers.arrayElements(potentialChildren, numComponents);

    for (const child of children) {
      await manageBomComponente(
        savedBom.id,
        null,
        child.id,
        faker.number.float({ min: 0.1, max: 10, precision: 0.01 }),
        child.unidade || 'un',
        faker.number.int({ min: 0, max: 5 }), // perda
        faker.datatype.boolean(), // obrigatorio
        null, // obs
        'upsert'
      );
    }
  }
}

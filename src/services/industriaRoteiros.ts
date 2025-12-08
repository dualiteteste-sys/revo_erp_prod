import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getProducts } from './products';
import { listCentrosTrabalho } from './industriaCentros';

export type TipoBom = 'producao' | 'beneficiamento';
export type TipoOperacao = 'setup' | 'producao' | 'inspecao' | 'embalagem' | 'outro';

export type RoteiroListItem = {
  id: string;
  produto_id: string;
  produto_nome: string;
  tipo_bom: TipoBom;
  codigo: string | null;
  descricao: string | null;
  versao: number;
  ativo: boolean;
  padrao_para_producao: boolean;
  padrao_para_beneficiamento: boolean;
  observacoes?: string | null;
};

export type RoteiroEtapa = {
  id: string;
  sequencia: number;
  centro_trabalho_id: string;
  centro_trabalho_nome?: string;
  tipo_operacao: TipoOperacao;
  tempo_setup_min: number | null;
  tempo_ciclo_min_por_unidade: number | null;
  permitir_overlap: boolean;
  observacoes: string | null;
};

export type RoteiroDetails = RoteiroListItem & {
  etapas: RoteiroEtapa[];
};

export type RoteiroPayload = Partial<Omit<RoteiroDetails, 'produto_nome' | 'etapas'>> & { id?: string };
export type RoteiroEtapaPayload = Partial<Omit<RoteiroEtapa, 'centro_trabalho_nome'>> & { id?: string };

export async function listRoteiros(
  search?: string,
  produtoId?: string,
  tipoBom?: TipoBom,
  ativo?: boolean
): Promise<RoteiroListItem[]> {
  return callRpc<RoteiroListItem[]>('industria_roteiros_list', {
    p_search: search || null,
    p_produto_id: produtoId || null,
    p_tipo_bom: tipoBom || null,
    p_ativo: ativo ?? null,
  });
}

export async function getRoteiroDetails(id: string): Promise<RoteiroDetails> {
  return callRpc<RoteiroDetails>('industria_roteiros_get_details', { p_id: id });
}

export async function saveRoteiro(payload: RoteiroPayload): Promise<RoteiroDetails> {
  return callRpc<RoteiroDetails>('industria_roteiros_upsert', { p_payload: payload });
}

export async function deleteRoteiro(id: string): Promise<void> {
  return callRpc<void>('industria_roteiros_delete', { p_id: id });
}

export async function manageRoteiroEtapa(
  roteiroId: string,
  etapaId: string | null,
  payload: RoteiroEtapaPayload,
  action: 'upsert' | 'delete' = 'upsert'
): Promise<void> {
  await callRpc('industria_roteiros_manage_etapa', {
    p_roteiro_id: roteiroId,
    p_etapa_id: etapaId,
    p_payload: payload,
    p_action: action,
  });
}

export async function seedRoteiros(): Promise<void> {
  // 1. Fetch dependencies
  const { data: products } = await getProducts({ page: 1, pageSize: 100, searchTerm: '', status: 'ativo', sortBy: { column: 'nome', ascending: true } });
  const centros = await listCentrosTrabalho(undefined, true);

  if (products.length === 0) throw new Error('Crie produtos antes de gerar roteiros.');
  if (centros.length === 0) throw new Error('Crie centros de trabalho antes de gerar roteiros.');

  // 2. Generate 5 Roteiros
  for (let i = 0; i < 5; i++) {
    const product = faker.helpers.arrayElement(products);
    const tipo = faker.helpers.arrayElement(['producao', 'beneficiamento']) as TipoBom;

    const payload: RoteiroPayload = {
      produto_id: product.id,
      tipo_bom: tipo,
      codigo: `ROT-${faker.string.numeric(4)}`,
      descricao: `Roteiro Padrão - ${faker.date.recent().getFullYear()}`,
      versao: faker.number.int({ min: 1, max: 5 }),
      ativo: true,
      padrao_para_producao: tipo === 'producao',
      padrao_para_beneficiamento: tipo === 'beneficiamento',
      observacoes: faker.lorem.sentence(),
    };

    const savedRoteiro = await saveRoteiro(payload);

    // 3. Add 2-4 steps for each Roteiro
    const numSteps = faker.number.int({ min: 2, max: 4 });
    for (let j = 0; j < numSteps; j++) {
      const centro = faker.helpers.arrayElement(centros);
      const etapaPayload: RoteiroEtapaPayload = {
        sequencia: (j + 1) * 10,
        centro_trabalho_id: centro.id,
        tipo_operacao: faker.helpers.arrayElement(['setup', 'producao', 'inspecao', 'embalagem']),
        tempo_setup_min: faker.number.int({ min: 10, max: 60 }),
        tempo_ciclo_min_por_unidade: faker.number.float({ min: 0.5, max: 10, precision: 0.1 }),
        permitir_overlap: faker.datatype.boolean(),
        observacoes: faker.lorem.sentence(),
      };
      await manageRoteiroEtapa(savedRoteiro.id, null, etapaPayload, 'upsert');
    }
  }
}

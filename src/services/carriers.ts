import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';

// Tipos alinhados com a tabela public.logistica_transportadoras
export type Carrier = {
  id: string;
  nome: string;
  codigo: string | null;
  tipo_pessoa: 'pf' | 'pj' | 'nao_definido';
  documento: string | null;
  ie_rg: string | null;
  isento_ie: boolean;
  telefone: string | null;
  email: string | null;
  contato_principal: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  pais: string | null;
  modal_principal: 'rodoviario' | 'aereo' | 'maritimo' | 'ferroviario' | 'courier' | 'outro';
  frete_tipo_padrao: 'cif' | 'fob' | 'terceiros' | 'nao_definido';
  prazo_medio_dias: number | null;
  exige_agendamento: boolean;
  observacoes: string | null;
  ativo: boolean;
  padrao_para_frete: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CarrierListItem = {
  id: string;
  nome: string;
  codigo: string | null;
  documento: string | null;
  cidade: string | null;
  uf: string | null;
  modal_principal: string;
  frete_tipo_padrao: string;
  prazo_medio_dias: number | null;
  exige_agendamento: boolean;
  ativo: boolean;
  padrao_para_frete: boolean;
  total_count?: number;
};

export type CarrierPayload = Partial<Omit<Carrier, 'id' | 'created_at' | 'updated_at'>> & {
  id?: string;
};

export async function getCarriers(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  filterStatus: string | null;
  sortBy: { column: keyof CarrierListItem; ascending: boolean };
}): Promise<{ data: CarrierListItem[]; count: number }> {
  const { page, pageSize, searchTerm, filterStatus } = options;
  const offset = (page - 1) * pageSize;

  let ativo: boolean | null = null;
  if (filterStatus === 'ativa') ativo = true;
  if (filterStatus === 'inativa') ativo = false;

  try {
    const data = await callRpc<CarrierListItem[]>('logistica_transportadoras_list', {
      p_search: searchTerm || null,
      p_ativo: ativo,
      p_limit: pageSize,
      p_offset: offset,
    });

    // Use total_count from the first record if available, otherwise 0
    const count = data && data.length > 0 ? Number(data[0].total_count) : 0;

    return { data: data ?? [], count };
  } catch (error) {
    console.error('[SERVICE][GET_CARRIERS]', error);
    throw new Error('Não foi possível listar as transportadoras.');
  }
}

export async function getCarrierDetails(id: string): Promise<Carrier | null> {
  return callRpc<Carrier>('logistica_transportadoras_get', { p_id: id });
}

export async function saveCarrier(payload: CarrierPayload): Promise<Carrier> {
  // Sanitização
  const cleanPayload = {
    ...payload,
    documento: payload.documento ? payload.documento.replace(/\D/g, '') : null,
    cep: payload.cep ? payload.cep.replace(/\D/g, '') : null,
  };

  return callRpc<Carrier>('logistica_transportadoras_upsert', { p_payload: cleanPayload });
}

export async function deleteCarrier(id: string): Promise<void> {
  await callRpc('logistica_transportadoras_delete', { p_id: id });
}

export async function seedCarriers(): Promise<void> {
  const promises = Array.from({ length: 5 }).map(() => {
    const isPj = faker.datatype.boolean();
    const payload: CarrierPayload = {
      nome: faker.company.name() + ' Transportes',
      codigo: `TR-${faker.string.numeric(3)}`,
      tipo_pessoa: isPj ? 'pj' : 'pf',
      documento: isPj ? faker.string.numeric(14) : faker.string.numeric(11),
      email: faker.internet.email(),
      telefone: faker.phone.number(),
      cidade: faker.location.city(),
      uf: faker.location.state({ abbreviated: true }),
      logradouro: faker.location.street(),
      numero: faker.location.buildingNumber(),
      bairro: faker.location.secondaryAddress(),
      cep: faker.location.zipCode(),
      modal_principal: faker.helpers.arrayElement(['rodoviario', 'aereo', 'maritimo']),
      ativo: true,
      prazo_medio_dias: faker.number.int({ min: 1, max: 15 }),
      frete_tipo_padrao: faker.helpers.arrayElement(['cif', 'fob']),
    };
    return saveCarrier(payload);
  });
  await Promise.all(promises);
}

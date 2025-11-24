import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';
import { getPartners } from './partners';

export type CrmOportunidade = {
  id: string;
  titulo: string;
  valor: number;
  cliente_id: string | null;
  cliente_nome?: string;
  status: 'aberto' | 'ganho' | 'perdido';
  prioridade: 'baixa' | 'media' | 'alta';
  data_fechamento: string | null;
  etapa_id?: string; 
  funil_id?: string; 
  observacoes?: string;
};

export type CrmEtapa = {
  id: string;
  nome: string;
  ordem: number;
  cor: string;
  probabilidade: number;
  oportunidades: CrmOportunidade[];
};

export type CrmKanbanData = {
  funil_id: string | null;
  etapas: CrmEtapa[];
};

export type OportunidadePayload = Partial<Omit<CrmOportunidade, 'cliente_nome'>> & {
  funil_id?: string;
  etapa_id?: string;
  origem?: string;
  responsavel_id?: string;
};

export async function ensureDefaultPipeline(): Promise<void> {
  await callRpc('crm_ensure_default_pipeline');
}

export async function getCrmKanbanData(funilId?: string): Promise<CrmKanbanData | null> {
  const data = await callRpc<CrmKanbanData>('crm_get_kanban_data', { p_funil_id: funilId || null });
  return data;
}

export async function moveOportunidade(oportunidadeId: string, novaEtapaId: string): Promise<void> {
  await callRpc('crm_move_oportunidade', { 
    p_oportunidade_id: oportunidadeId, 
    p_nova_etapa_id: novaEtapaId 
  });
}

export async function saveOportunidade(payload: OportunidadePayload): Promise<void> {
  await callRpc('crm_upsert_oportunidade', { p_payload: payload });
}

export async function deleteOportunidade(id: string): Promise<void> {
  await callRpc('crm_delete_oportunidade', { p_id: id });
}

export async function seedCrm(): Promise<void> {
  // 1. Garantir funil
  await ensureDefaultPipeline();
  const kanban = await getCrmKanbanData();
  
  if (!kanban || !kanban.etapas || kanban.etapas.length === 0) {
    throw new Error('Falha ao carregar etapas do funil.');
  }

  // 2. Buscar clientes
  const { data: partners } = await getPartners({ 
    page: 1, 
    pageSize: 100, 
    searchTerm: '', 
    filterType: 'cliente', 
    sortBy: { column: 'nome', ascending: true } 
  });

  if (partners.length === 0) throw new Error('Cadastre clientes antes de gerar oportunidades.');

  // 3. Gerar Oportunidades
  const promises = Array.from({ length: 5 }).map(() => {
    const client = faker.helpers.arrayElement(partners);
    const etapa = faker.helpers.arrayElement(kanban.etapas);
    
    const payload: OportunidadePayload = {
      funil_id: kanban.funil_id!,
      etapa_id: etapa.id,
      cliente_id: client.id,
      titulo: `Oportunidade ${faker.company.buzzNoun()} - ${client.nome.split(' ')[0]}`,
      valor: parseFloat(faker.finance.amount(1000, 50000, 2)),
      status: 'aberto',
      prioridade: faker.helpers.arrayElement(['baixa', 'media', 'alta']),
      data_fechamento: faker.date.soon({ days: 60 }).toISOString().split('T')[0],
      observacoes: faker.lorem.sentence(),
      origem: faker.helpers.arrayElement(['Site', 'Indicação', 'Email', 'Telefone']),
    };
    
    return saveOportunidade(payload);
  });

  await Promise.all(promises);
}

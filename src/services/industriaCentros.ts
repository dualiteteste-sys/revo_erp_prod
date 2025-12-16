import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';

export type TipoUsoCentro = 'producao' | 'beneficiamento' | 'ambos';

export type CentroTrabalho = {
  id: string;
  nome: string;
  codigo: string | null;
  descricao: string | null;
  ativo: boolean;
  capacidade_unidade_hora: number | null;
  capacidade_horas_dia?: number | null;
  tipo_uso: TipoUsoCentro;
  tempo_setup_min: number | null;
  requer_inspecao_final: boolean;
};

export type CentroTrabalhoPayload = Partial<Omit<CentroTrabalho, 'id'>> & { id?: string };

export type CentroCalendarioDia = {
  dow: number; // 0=Dom .. 6=Sáb
  capacidade_horas: number;
};

export type CentroApsConfig = {
  freeze_dias: number;
};

export async function listCentrosTrabalho(search?: string, ativo?: boolean): Promise<CentroTrabalho[]> {
  return callRpc<CentroTrabalho[]>('industria_centros_trabalho_list', {
    p_search: search || null,
    p_ativo: ativo ?? null,
  });
}

export async function saveCentroTrabalho(payload: CentroTrabalhoPayload): Promise<CentroTrabalho> {
  return callRpc<CentroTrabalho>('industria_centros_trabalho_upsert', { p_payload: payload });
}

export async function deleteCentroTrabalho(id: string): Promise<void> {
  return callRpc<void>('industria_centros_trabalho_delete', { p_id: id });
}

export async function getCentroCalendarioSemanal(centroTrabalhoId: string): Promise<CentroCalendarioDia[]> {
  return callRpc<CentroCalendarioDia[]>('industria_ct_calendario_get', { p_centro_id: centroTrabalhoId });
}

export async function upsertCentroCalendarioSemanal(
  centroTrabalhoId: string,
  calendario: CentroCalendarioDia[],
): Promise<void> {
  await callRpc('industria_ct_calendario_upsert', { p_centro_id: centroTrabalhoId, p_payload: calendario });
}

export async function getCentroApsConfig(centroTrabalhoId: string): Promise<CentroApsConfig> {
  const rows = await callRpc<CentroApsConfig[]>('industria_ct_aps_config_get', { p_centro_id: centroTrabalhoId });
  return rows?.[0] ?? { freeze_dias: 0 };
}

export async function upsertCentroApsConfig(centroTrabalhoId: string, freezeDias: number): Promise<void> {
  await callRpc('industria_ct_aps_config_upsert', {
    p_centro_id: centroTrabalhoId,
    p_freeze_dias: freezeDias,
  });
}

export async function seedCentrosTrabalho(): Promise<CentroTrabalho[]> {
  const promises = Array.from({ length: 5 }).map(() => {
    const payload: CentroTrabalhoPayload = {
      nome: `CT ${faker.commerce.department()} ${faker.string.alpha(3).toUpperCase()}`,
      codigo: `CT-${faker.string.numeric(3)}`,
      descricao: faker.lorem.sentence(),
      ativo: true,
      capacidade_unidade_hora: faker.number.int({ min: 10, max: 500 }),
      capacidade_horas_dia: faker.number.int({ min: 6, max: 12 }),
      tipo_uso: faker.helpers.arrayElement(['producao', 'beneficiamento', 'ambos']) as TipoUsoCentro,
    };
    return saveCentroTrabalho(payload);
  });

  return Promise.all(promises);
}

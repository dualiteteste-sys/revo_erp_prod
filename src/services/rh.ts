import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';

// --- Types ---

export type Cargo = {
  id: string;
  nome: string;
  descricao: string | null;
  responsabilidades: string | null;
  autoridades: string | null;
  setor: string | null;
  ativo: boolean;
  total_colaboradores?: number;
  total_competencias?: number;
};

export type Competencia = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: 'tecnica' | 'comportamental' | 'certificacao' | 'idioma' | 'outros';
  critico_sgq: boolean;
  ativo: boolean;
};

export type CargoCompetencia = {
  id?: string;
  competencia_id: string;
  nome?: string;
  tipo?: string;
  nivel_requerido: number;
  obrigatorio: boolean;
};

export type CargoDetails = Cargo & {
  competencias: CargoCompetencia[];
};

export type Colaborador = {
  id: string;
  nome: string;
  email: string | null;
  documento: string | null;
  data_admissao: string | null;
  cargo_id: string | null;
  cargo_nome: string | null;
  ativo: boolean;
  total_competencias_avaliadas?: number;
};

export type ColaboradorCompetencia = {
  competencia_id: string;
  nome: string;
  tipo: string;
  nivel_requerido: number; // Do cargo
  nivel_atual: number;     // Do colaborador
  gap: number;             // Calculado (atual - requerido)
  obrigatorio: boolean;
  data_avaliacao: string | null;
  origem: string | null;
};

export type ColaboradorDetails = Colaborador & {
  competencias: ColaboradorCompetencia[];
};

export type MatrixCompetencia = {
  id: string;
  nome: string;
  tipo: string;
  nivel_requerido: number;
  nivel_atual: number;
  gap: number;
  obrigatorio: boolean;
};

export type MatrixRow = {
  colaborador_id: string;
  colaborador_nome: string;
  cargo_nome: string;
  competencias: MatrixCompetencia[];
};

// --- Treinamentos Types ---

export type Treinamento = {
  id: string;
  nome: string;
  tipo: 'interno' | 'externo' | 'online' | 'on_the_job';
  status: 'planejado' | 'agendado' | 'em_andamento' | 'concluido' | 'cancelado';
  data_inicio: string | null;
  instrutor: string | null;
  total_participantes: number;
};

export type TreinamentoParticipante = {
  id: string;
  colaborador_id: string;
  nome: string; // nome do colaborador
  cargo: string | null;
  status: 'inscrito' | 'confirmado' | 'concluido' | 'reprovado' | 'ausente';
  nota_final: number | null;
  certificado_url: string | null;
  eficacia_avaliada: boolean;
  parecer_eficacia?: string | null;
};

export type TreinamentoDetails = {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  tipo: 'interno' | 'externo' | 'online' | 'on_the_job';
  status: 'planejado' | 'agendado' | 'em_andamento' | 'concluido' | 'cancelado';
  data_inicio: string | null;
  data_fim: string | null;
  carga_horaria_horas: number | null;
  instrutor: string | null;
  localizacao: string | null;
  custo_estimado: number | null;
  custo_real: number | null;
  objetivo: string | null;
  created_at: string;
  updated_at: string;
  participantes: TreinamentoParticipante[];
};

export type RHDashboardStats = {
  total_colaboradores: number;
  total_cargos: number;
  gaps_identificados: number;
  treinamentos_concluidos: number;
  investimento_treinamento: number;
  top_gaps: { nome: string; total_gaps: number }[];
  status_treinamentos: { status: string; total: number }[];
};

export type CargoPayload = Partial<Omit<CargoDetails, 'total_colaboradores' | 'total_competencias'>>;
export type CompetenciaPayload = Partial<Competencia>;
export type ColaboradorPayload = Partial<Omit<ColaboradorDetails, 'total_competencias_avaliadas' | 'cargo_nome'>>;
export type TreinamentoPayload = Partial<Omit<TreinamentoDetails, 'participantes' | 'created_at' | 'updated_at' | 'empresa_id'>>;

// --- Services ---

// Cargos
export async function listCargos(search?: string, ativoOnly?: boolean): Promise<Cargo[]> {
  return callRpc<Cargo[]>('rh_list_cargos', { 
    p_search: search || null, 
    p_ativo_only: ativoOnly || false 
  });
}

export async function getCargoDetails(id: string): Promise<CargoDetails> {
  return callRpc<CargoDetails>('rh_get_cargo_details', { p_id: id });
}

export async function saveCargo(payload: CargoPayload): Promise<CargoDetails> {
  return callRpc<CargoDetails>('rh_upsert_cargo', { p_payload: payload });
}

export async function seedCargos(): Promise<void> {
  const promises = Array.from({ length: 5 }).map(() => {
    const payload: CargoPayload = {
      nome: faker.person.jobTitle(),
      setor: faker.commerce.department(),
      ativo: true,
      descricao: faker.lorem.sentence(),
      responsabilidades: faker.lorem.paragraph(),
      autoridades: faker.lorem.sentence(),
      competencias: []
    };
    return saveCargo(payload);
  });
  await Promise.all(promises);
}

// Competências
export async function listCompetencias(search?: string): Promise<Competencia[]> {
  return callRpc<Competencia[]>('rh_list_competencias', { p_search: search || null });
}

export async function saveCompetencia(payload: CompetenciaPayload): Promise<Competencia> {
  return callRpc<Competencia>('rh_upsert_competencia', { p_payload: payload });
}

export async function seedCompetencias(): Promise<void> {
  const promises = Array.from({ length: 5 }).map(() => {
    const payload: CompetenciaPayload = {
      nome: faker.word.words(2),
      tipo: faker.helpers.arrayElement(['tecnica', 'comportamental', 'idioma']),
      descricao: faker.lorem.sentence(),
      critico_sgq: faker.datatype.boolean(),
      ativo: true,
    };
    return saveCompetencia(payload);
  });
  await Promise.all(promises);
}

// Colaboradores
export async function listColaboradores(search?: string, cargoId?: string): Promise<Colaborador[]> {
  return callRpc<Colaborador[]>('rh_list_colaboradores', { 
    p_search: search || null, 
    p_cargo_id: cargoId || null,
    p_ativo_only: false 
  });
}

export async function getColaboradorDetails(id: string): Promise<ColaboradorDetails> {
  return callRpc<ColaboradorDetails>('rh_get_colaborador_details', { p_id: id });
}

export async function saveColaborador(payload: ColaboradorPayload): Promise<ColaboradorDetails> {
  return callRpc<ColaboradorDetails>('rh_upsert_colaborador', { p_payload: payload });
}

export async function seedColaboradores(): Promise<void> {
  const cargos = await listCargos(undefined, true);
  if (cargos.length === 0) throw new Error('Crie cargos antes de gerar colaboradores.');

  const promises = Array.from({ length: 5 }).map(() => {
    const cargo = faker.helpers.arrayElement(cargos);
    const payload: ColaboradorPayload = {
      nome: faker.person.fullName(),
      email: faker.internet.email(),
      documento: faker.string.numeric(11),
      data_admissao: faker.date.past().toISOString(),
      cargo_id: cargo.id,
      ativo: true,
      competencias: []
    };
    return saveColaborador(payload);
  });
  await Promise.all(promises);
}

// Matriz
export async function getCompetencyMatrix(cargoId?: string): Promise<MatrixRow[]> {
  return callRpc<MatrixRow[]>('rh_get_competency_matrix', { p_cargo_id: cargoId || null });
}

// Treinamentos
export async function listTreinamentos(search?: string, status?: string): Promise<Treinamento[]> {
  return callRpc<Treinamento[]>('rh_list_treinamentos', {
    p_search: search || null,
    p_status: status || null
  });
}

export async function getTreinamentoDetails(id: string): Promise<TreinamentoDetails> {
  return callRpc<TreinamentoDetails>('rh_get_treinamento_details', { p_id: id });
}

export async function saveTreinamento(payload: TreinamentoPayload): Promise<TreinamentoDetails> {
  return callRpc<TreinamentoDetails>('rh_upsert_treinamento', { p_payload: payload });
}

export async function seedTreinamentos(): Promise<void> {
  const promises = Array.from({ length: 5 }).map(() => {
    const payload: TreinamentoPayload = {
      nome: `Treinamento de ${faker.word.words(2)}`,
      tipo: faker.helpers.arrayElement(['interno', 'externo', 'online']),
      status: faker.helpers.arrayElement(['planejado', 'agendado', 'concluido']),
      instrutor: faker.person.fullName(),
      data_inicio: faker.date.soon().toISOString(),
      data_fim: faker.date.soon({ days: 5 }).toISOString(),
      carga_horaria_horas: faker.number.int({ min: 2, max: 40 }),
      custo_estimado: faker.number.float({ min: 0, max: 2000, precision: 0.01 }),
      objetivo: faker.lorem.sentence(),
      descricao: faker.lorem.paragraph(),
    };
    return saveTreinamento(payload);
  });
  await Promise.all(promises);
}

export async function manageParticipante(
  treinamentoId: string,
  colaboradorId: string,
  action: 'add' | 'remove' | 'update',
  data?: { 
    status?: string; 
    nota?: number; 
    certificado_url?: string;
    parecer_eficacia?: string;
    eficacia_avaliada?: boolean;
  }
): Promise<void> {
  return callRpc('rh_manage_participante', {
    p_treinamento_id: treinamentoId,
    p_colaborador_id: colaboradorId,
    p_action: action,
    p_status: data?.status || 'inscrito',
    p_nota: data?.nota || null,
    p_certificado_url: data?.certificado_url || null,
    p_parecer_eficacia: data?.parecer_eficacia || null,
    p_eficacia_avaliada: data?.eficacia_avaliada || false,
  });
}

// Dashboard
export async function getDashboardStats(): Promise<RHDashboardStats> {
  return callRpc<RHDashboardStats>('get_rh_dashboard_stats');
}

// Seed
export async function seedRhData(): Promise<void> {
  return callRpc('seed_rh_module');
}

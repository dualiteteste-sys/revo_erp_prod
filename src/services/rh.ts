import { callRpc, isRpcMissingError } from '@/lib/api';
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
  telefone?: string | null;
  matricula?: string | null;
  data_admissao: string | null;
  cargo_id: string | null;
  cargo_nome: string | null;
  ativo: boolean;
  status?: 'ativo' | 'afastado' | 'ferias' | 'licenca' | 'desligado';
  afastado_desde?: string | null;
  afastado_ate?: string | null;
  afastamento_motivo?: string | null;
  data_demissao?: string | null;
  observacoes?: string | null;
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

export type ColaboradorTreinamento = {
  treinamento_id: string;
  treinamento_nome: string;
  treinamento_status: string;
  treinamento_tipo: string;
  data_inicio: string | null;
  data_fim: string | null;
  participante_status: string;
  nota_final: number | null;
  eficacia_avaliada: boolean;
  parecer_eficacia: string | null;
  validade_ate?: string | null;
  proxima_reciclagem?: string | null;
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

export type CargoTreinamentoRequirement = {
  id: string;
  treinamento_id: string;
  treinamento_nome: string;
  obrigatorio: boolean;
  validade_meses: number | null;
};

export type TrainingComplianceItem = {
  colaborador_id: string;
  colaborador_nome: string;
  cargo_nome: string;
  treinamento_id: string;
  treinamento_nome: string;
  participante_status: string;
  validade_ate: string | null;
  proxima_reciclagem: string | null;
  compliance_status: 'ok' | 'due_soon' | 'overdue' | 'missing' | 'pending';
};

export type TrainingComplianceSummary = {
  total_required: number;
  ok: number;
  due_soon: number;
  overdue: number;
  missing: number;
};

export type TrainingComplianceResponse = {
  summary: TrainingComplianceSummary;
  items: TrainingComplianceItem[];
};

let rhTrainingComplianceAvailable: boolean | null = null;

export type PlanoAcaoCompetencia = {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  cargo_nome: string;
  competencia_id: string;
  competencia_nome: string;
  status: 'aberto' | 'em_andamento' | 'concluido' | 'cancelado';
  prioridade: number;
  due_date: string | null;
  responsavel: string | null;
  notas: string | null;
  updated_at: string;
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
  validade_ate?: string | null;
  proxima_reciclagem?: string | null;
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
  validade_meses?: number | null;
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

export async function setCargoAtivo(id: string, ativo: boolean): Promise<void> {
  return callRpc('rh_set_cargo_ativo', { p_id: id, p_ativo: ativo });
}

export async function setColaboradorAtivo(id: string, ativo: boolean): Promise<void> {
  return callRpc('rh_set_colaborador_ativo', { p_id: id, p_ativo: ativo });
}

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
  try {
    return await callRpc<Competencia[]>('rh_list_competencias_v2', {
      p_search: search || null,
      p_ativo_only: false,
    });
  } catch {
    return callRpc<Competencia[]>('rh_list_competencias', { p_search: search || null });
  }
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
export async function listColaboradores(search?: string, cargoId?: string, ativoOnly: boolean = false): Promise<Colaborador[]> {
  return callRpc<Colaborador[]>('rh_list_colaboradores', { 
    p_search: search || null, 
    p_cargo_id: cargoId || null,
    p_ativo_only: ativoOnly
  });
}

export async function getColaboradorDetails(id: string): Promise<ColaboradorDetails> {
  return callRpc<ColaboradorDetails>('rh_get_colaborador_details', { p_id: id });
}

export async function saveColaborador(payload: ColaboradorPayload): Promise<ColaboradorDetails> {
  return callRpc<ColaboradorDetails>('rh_upsert_colaborador', { p_payload: payload });
}

export async function listTreinamentosPorColaborador(colaboradorId: string): Promise<ColaboradorTreinamento[]> {
  return callRpc<ColaboradorTreinamento[]>('rh_list_treinamentos_por_colaborador', {
    p_colaborador_id: colaboradorId,
  });
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
  type MatrixRowApi = Omit<MatrixRow, 'competencias'> & {
    competencias: MatrixCompetencia[] | null;
  };

  const data = await callRpc<MatrixRowApi[]>('rh_get_competency_matrix', { p_cargo_id: cargoId || null });

  return (data || []).map((row) => ({
    ...row,
    competencias: Array.isArray(row.competencias) ? row.competencias : [],
  }));
}

export async function listCargoTreinamentos(cargoId: string): Promise<CargoTreinamentoRequirement[]> {
  return callRpc<CargoTreinamentoRequirement[]>('rh_list_cargo_treinamentos', { p_cargo_id: cargoId });
}

export async function upsertCargoTreinamento(params: {
  cargoId: string;
  treinamentoId: string;
  obrigatorio: boolean;
  validadeMeses?: number | null;
}): Promise<string> {
  return callRpc<string>('rh_upsert_cargo_treinamento', {
    p_cargo_id: params.cargoId,
    p_treinamento_id: params.treinamentoId,
    p_obrigatorio: params.obrigatorio,
    p_validade_meses: params.validadeMeses ?? null,
  });
}

export async function deleteCargoTreinamento(id: string): Promise<void> {
  return callRpc('rh_delete_cargo_treinamento', { p_id: id });
}

export async function getTrainingCompliance(daysAhead = 30): Promise<TrainingComplianceResponse> {
  if (rhTrainingComplianceAvailable === false) {
    return {
      summary: { total_required: 0, ok: 0, due_soon: 0, overdue: 0, missing: 0 },
      items: [],
    };
  }
  try {
    const data = await callRpc<TrainingComplianceResponse>('rh_training_compliance_summary', { p_days_ahead: daysAhead });
    rhTrainingComplianceAvailable = true;
    return data;
  } catch (err) {
    // Compat: RH-STA-01/02 pode ainda não estar aplicado em alguns ambientes.
    if (isRpcMissingError(err)) {
      rhTrainingComplianceAvailable = false;
      return {
        summary: { total_required: 0, ok: 0, due_soon: 0, overdue: 0, missing: 0 },
        items: [],
      };
    }
    throw err;
  }
}

export async function listPlanosAcaoCompetencias(cargoId?: string): Promise<PlanoAcaoCompetencia[]> {
  return callRpc<PlanoAcaoCompetencia[]>('rh_list_planos_acao_competencias', { p_cargo_id: cargoId ?? null });
}

export async function upsertPlanoAcaoCompetencia(payload: {
  colaborador_id: string;
  competencia_id: string;
  status?: PlanoAcaoCompetencia['status'];
  prioridade?: number;
  due_date?: string | null;
  responsavel?: string | null;
  notas?: string | null;
}): Promise<string> {
  return callRpc<string>('rh_upsert_plano_acao_competencia', { p_payload: payload });
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

// Afastamentos (básico)
export type ColaboradorAfastamento = {
  id: string;
  tipo: 'ferias' | 'licenca' | 'atestado' | 'outros';
  motivo: string | null;
  data_inicio: string;
  data_fim: string | null;
};

export async function listAfastamentos(colaboradorId: string): Promise<ColaboradorAfastamento[]> {
  return callRpc<ColaboradorAfastamento[]>('rh_list_afastamentos', { p_colaborador_id: colaboradorId });
}

export async function addAfastamento(params: {
  colaboradorId: string;
  tipo: ColaboradorAfastamento['tipo'];
  motivo?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}): Promise<string> {
  return callRpc<string>('rh_add_afastamento', {
    p_colaborador_id: params.colaboradorId,
    p_tipo: params.tipo,
    p_motivo: params.motivo ?? null,
    p_data_inicio: params.dataInicio ?? null,
    p_data_fim: params.dataFim ?? null,
  });
}

export async function encerrarAfastamento(afastamentoId: string, dataFim?: string | null): Promise<void> {
  return callRpc('rh_encerrar_afastamento', { p_afastamento_id: afastamentoId, p_data_fim: dataFim ?? null });
}

// Dashboard
export async function getDashboardStats(): Promise<RHDashboardStats> {
  return callRpc<RHDashboardStats>('get_rh_dashboard_stats');
}

// Seed
export async function seedRhData(): Promise<void> {
  return callRpc('seed_rh_module');
}

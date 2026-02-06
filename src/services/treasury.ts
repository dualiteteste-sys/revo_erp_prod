import { callRpc } from '@/lib/api';
import { faker } from '@faker-js/faker';

// --- Types ---

export type ContaCorrente = {
  id: string;
  empresa_id: string;
  nome: string;
  apelido: string | null;
  banco_codigo: string | null;
  banco_nome: string | null;
  agencia: string | null;
  conta: string | null;
  digito: string | null;
  tipo_conta: 'corrente' | 'poupanca' | 'carteira' | 'caixa' | 'outro';
  moeda: string;
  saldo_inicial: number;
  data_saldo_inicial: string | null;
  limite_credito: number;
  permite_saldo_negativo: boolean;
  ativo: boolean;
  padrao_para_pagamentos: boolean;
  padrao_para_recebimentos: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  saldo_atual?: number; // Campo calculado
};

export type ContaCorrentePayload = Partial<Omit<ContaCorrente, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'saldo_atual'>> & {
  id?: string;
};

export type Movimentacao = {
  id: string;
  empresa_id: string;
  conta_corrente_id: string;
  data_movimento: string;
  data_competencia: string | null;
  tipo_mov: 'entrada' | 'saida';
  valor: number;
  descricao: string | null;
  documento_ref: string | null;
  origem_tipo: string | null;
  origem_id: string | null;
  categoria: string | null;
  centro_custo: string | null;
  centro_de_custo_id: string | null;
  conciliado: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  // Campos calculados da lista
  valor_entrada?: number;
  valor_saida?: number;
  saldo_acumulado?: number;
};

export type MovimentacaoPayload = Partial<Omit<Movimentacao, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'conciliado' | 'valor_entrada' | 'valor_saida' | 'saldo_acumulado'>> & {
  id?: string;
};

export type ExtratoItem = {
  id: string;
  data_lancamento: string;
  descricao: string;
  documento_ref: string | null;
  tipo_lancamento: 'credito' | 'debito';
  valor: number;
  saldo_apos_lancamento: number | null;
  conciliado: boolean;
  movimentacao_id: string | null;
  movimentacao_data: string | null;
  movimentacao_descricao: string | null;
  movimentacao_valor: number | null;
};

export type ImportarExtratoPayload = {
  data_lancamento: string;
  descricao: string;
  documento_ref?: string;
  tipo_lancamento: 'credito' | 'debito';
  valor: number;
  saldo_apos_lancamento?: number;
  sequencia_importacao?: number;
  identificador_banco?: string;
  hash_importacao?: string;
  linha_bruta?: string;
};

// --- Contas Correntes ---

export async function listContasCorrentes(options: {
  page: number;
  pageSize: number;
  searchTerm: string;
  ativo: boolean | null;
}): Promise<{ data: ContaCorrente[]; count: number }> {
  const { page, pageSize, searchTerm, ativo } = options;
  const offset = (page - 1) * pageSize;

  const data = await callRpc<any[]>('financeiro_contas_correntes_list', {
    p_search: searchTerm || null,
    p_ativo: ativo,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (!data || data.length === 0) {
    return { data: [], count: 0 };
  }

  const count = Number(data[0].total_count);
  return { data: data as ContaCorrente[], count };
}

export async function getContaCorrente(id: string): Promise<ContaCorrente> {
  return callRpc<ContaCorrente>('financeiro_contas_correntes_get', { p_id: id });
}

export async function saveContaCorrente(payload: ContaCorrentePayload): Promise<ContaCorrente> {
  return callRpc<ContaCorrente>('financeiro_contas_correntes_upsert', { p_payload: payload });
}

export async function setContaCorrentePadrao(params: {
  id: string;
  para: 'pagamentos' | 'recebimentos';
  value?: boolean;
}): Promise<ContaCorrente> {
  return callRpc<ContaCorrente>('financeiro_contas_correntes_set_padrao', {
    p_id: params.id,
    p_para: params.para,
    p_value: params.value ?? true,
  });
}

export async function deleteContaCorrente(id: string): Promise<void> {
  return callRpc('financeiro_contas_correntes_delete', { p_id: id });
}

// --- Movimentações ---

export async function listMovimentacoes(options: {
  contaCorrenteId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  tipoMov?: 'entrada' | 'saida' | null;
  searchTerm?: string;
  page: number;
  pageSize: number;
}): Promise<{ data: Movimentacao[]; count: number }> {
  const { contaCorrenteId, startDate, endDate, tipoMov, searchTerm, page, pageSize } = options;
  const offset = (page - 1) * pageSize;

  const data = await callRpc<any[]>('financeiro_movimentacoes_list', {
    p_conta_corrente_id: contaCorrenteId,
    p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
    p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
    p_tipo_mov: tipoMov || null,
    p_q: searchTerm || null,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (!data || data.length === 0) {
    return { data: [], count: 0 };
  }

  const count = Number(data[0].total_count);
  return { data: data as Movimentacao[], count };
}

export async function getMovimentacao(id: string): Promise<Movimentacao> {
  return callRpc<Movimentacao>('financeiro_movimentacoes_get', { p_id: id });
}

export async function saveMovimentacao(payload: MovimentacaoPayload): Promise<Movimentacao> {
  return callRpc<Movimentacao>('financeiro_movimentacoes_upsert', { p_payload: payload });
}

export async function deleteMovimentacao(id: string): Promise<void> {
  return callRpc('financeiro_movimentacoes_delete', { p_id: id });
}

// --- Extratos & Conciliação ---

export async function listExtratos(options: {
  contaCorrenteId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  conciliado?: boolean | null;
  searchTerm?: string;
  page: number;
  pageSize: number;
}): Promise<{ data: ExtratoItem[]; count: number }> {
  const { contaCorrenteId, startDate, endDate, conciliado, searchTerm, page, pageSize } = options;
  const offset = (page - 1) * pageSize;

  const data = await callRpc<any[]>('financeiro_extratos_bancarios_list', {
    p_conta_corrente_id: contaCorrenteId,
    p_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
    p_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
    p_conciliado: conciliado,
    p_q: searchTerm || null,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (!data || data.length === 0) {
    return { data: [], count: 0 };
  }

  const count = Number(data[0].total_count);
  return { data: data as ExtratoItem[], count };
}

export async function importarExtrato(contaCorrenteId: string, itens: ImportarExtratoPayload[]): Promise<number> {
  return callRpc<number>('financeiro_extratos_bancarios_importar', {
    p_conta_corrente_id: contaCorrenteId,
    p_itens: itens,
  });
}

export async function conciliarExtrato(extratoId: string, movimentacaoId: string): Promise<void> {
  return callRpc('financeiro_extratos_bancarios_vincular_movimentacao', {
    p_extrato_id: extratoId,
    p_movimentacao_id: movimentacaoId,
  });
}

export async function desconciliarExtrato(extratoId: string): Promise<void> {
  return callRpc('financeiro_extratos_bancarios_desvincular', {
    p_extrato_id: extratoId,
  });
}

export type ReverterConciliacaoExtratoResult = {
  kind: 'noop' | 'unlinked_only' | 'deleted_movimentacao';
  message: string;
  movimentacao_id?: string | null;
};

export async function reverterConciliacaoExtrato(extratoId: string): Promise<ReverterConciliacaoExtratoResult> {
  return callRpc<ReverterConciliacaoExtratoResult>('financeiro_extratos_bancarios_reverter_conciliacao', {
    p_extrato_id: extratoId,
  });
}

export async function seedExtratos(contaCorrenteId: string): Promise<void> {
  const itens: ImportarExtratoPayload[] = Array.from({ length: 10 }).map(() => {
    const isCredit = faker.datatype.boolean();
    return {
      data_lancamento: faker.date.recent({ days: 30 }).toISOString().split('T')[0],
      descricao: isCredit ? `Depósito ${faker.person.firstName()}` : `Pagto ${faker.company.name()}`,
      tipo_lancamento: isCredit ? 'credito' : 'debito',
      valor: parseFloat(faker.finance.amount(50, 2000, 2)),
      documento_ref: faker.string.numeric(6),
      identificador_banco: faker.string.uuid(),
    };
  });
  
  await importarExtrato(contaCorrenteId, itens);
}

// src/services/services.ts
import { callRpc } from '@/lib/api';

/** Modelo de Serviço no domínio */
export type Service = {
  id: string;
  empresa_id: string;
  descricao: string;
  codigo: string | null;
  preco_venda: string | number | null;
  unidade: string | null;
  status: 'ativo' | 'inativo';
  codigo_servico: string | null;
  nbs: string | null;
  nbs_ibpt_required: boolean | null;
  descricao_complementar: string | null;
  observacoes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ListServicesParams = {
  offset?: number;
  limit?: number;
  search?: string | null;
  orderBy?: string | null;   // ex: 'descricao'
  orderDir?: 'asc' | 'desc' | null;
};

/** Lista serviços paginados do tenant atual */
export async function listServices(params: ListServicesParams = {}): Promise<Service[]> {
  const { offset = 0, limit = 25, search = null, orderBy = null, orderDir = 'asc' } = params;

  // Os nomes aqui devem bater com a assinatura da RPC no banco
  return callRpc<Service[]>('list_services_for_current_user', {
    p_offset: offset,
    p_limit: limit,
    p_search: search && search.trim() ? search : null,
    p_order_by: orderBy,
    p_order_dir: orderDir,
  });
}

/** Busca um serviço por ID (escopo da empresa atual) */
export async function getService(id: string): Promise<Service> {
  return callRpc<Service>('get_service_by_id_for_current_user', { p_id: id });
}

/** Cria um novo serviço para a empresa atual */
export async function createService(payload: Partial<Service>): Promise<Service> {
  // payload validado na RPC; não enviamos empresa_id do frontend
  return callRpc<Service>('create_service_for_current_user', { payload });
}

/** Atualiza um serviço existente (pelo ID) */
export async function updateService(id: string, payload: Partial<Service>): Promise<Service> {
  return callRpc<Service>('update_service_for_current_user', { p_id: id, payload });
}

/** Exclui um serviço do tenant atual */
export async function deleteService(id: string): Promise<void> {
  return callRpc<void>('delete_service_for_current_user', { p_id: id });
}

/** Clona um serviço existente com possíveis overrides em campos simples */
export async function cloneService(
  id: string,
  overrides?: { descricao?: string; codigo?: string }
): Promise<Service> {
  return callRpc<Service>('create_service_clone_for_current_user', {
    p_source_service_id: id,
    p_overrides: overrides || {},
  });
}

/** Semeia serviços padrão (seed) no tenant atual */
export async function seedDefaultServices(): Promise<Service[]> {
  return callRpc<Service[]>('seed_services_for_current_user');
}

import { callRpc } from '@/lib/api';

export type EmpresaContextDiagnostics = {
  ok: boolean;
  reason?: string;
  user_id?: string;
  user_email?: string | null;
  guc_current_empresa_id?: string | null;
  guc_current_empresa_name?: string | null;
  current_empresa_id?: string | null;
  current_empresa_name?: string | null;
  user_active_empresa_id?: string | null;
  user_active_empresa_name?: string | null;
  memberships_count?: number;
  now?: string;
};

export type ProdutosEmpresaIdRow = {
  id: string;
  empresa_id: string;
};

export type ProdutosEmpresaDetailsRow = {
  id: string;
  empresa_id: string;
  produto_nome: string | null;
  sku: string | null;
  empresa_nome: string | null;
};

export async function getEmpresaContextDiagnostics(): Promise<EmpresaContextDiagnostics> {
  return callRpc<EmpresaContextDiagnostics>('dev_empresa_context_diagnostics', {});
}

export async function opsDebugProdutosEmpresaIds(productIds: string[]): Promise<ProdutosEmpresaIdRow[]> {
  if (!productIds.length) return [];
  return callRpc<ProdutosEmpresaIdRow[]>('ops_debug_produtos_empresa_ids', { p_ids: productIds });
}

export async function opsDebugProdutosEmpresaDetails(productIds: string[]): Promise<ProdutosEmpresaDetailsRow[]> {
  if (!productIds.length) return [];
  return callRpc<ProdutosEmpresaDetailsRow[]>('ops_debug_produtos_empresa_details', { p_ids: productIds });
}

import { callRpc } from '@/lib/api';

export type ServicosContratoTemplateAdmin = {
  id: string;
  empresa_id: string;
  slug: string;
  titulo: string;
  corpo: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listContratoTemplatesAdmin(params?: { includeInactive?: boolean }): Promise<ServicosContratoTemplateAdmin[]> {
  const { includeInactive = true } = params ?? {};
  const rows = await callRpc<any>('servicos_contratos_templates_list', { p_active_only: !includeInactive });
  return (rows ?? []) as any;
}

export async function upsertContratoTemplateAdmin(
  payload: Partial<ServicosContratoTemplateAdmin> & { slug: string; titulo: string; corpo: string },
): Promise<ServicosContratoTemplateAdmin> {
  const row = await callRpc<any>('servicos_contratos_templates_upsert', { p_payload: payload as any });
  return row as any;
}

export async function deleteContratoTemplateAdmin(id: string): Promise<void> {
  await callRpc<any>('servicos_contratos_templates_delete', { p_id: id });
}

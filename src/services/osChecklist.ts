import { callRpc } from '@/lib/api';

export type OsChecklistTemplate = {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  steps: any[];
  active: boolean;
  updated_at: string;
};

export type OsChecklistItem = {
  step_id: string;
  pos: number;
  titulo: string;
  descricao: string | null;
  auto_rule: any | null;
  auto_done: boolean;
  manual_override: boolean;
  done: boolean;
  done_at: string | null;
};

export type OsChecklistProgress = {
  total: number;
  done: number;
  pct: number;
};

export type OsChecklistPayload = {
  template: { id: string; slug: string; titulo: string; descricao: string | null } | null;
  progress: OsChecklistProgress;
  items: OsChecklistItem[];
};

export async function listOsChecklistTemplates(params?: { q?: string | null; limit?: number }): Promise<OsChecklistTemplate[]> {
  const payload = await callRpc<any>('os_checklist_templates_list', {
    p_q: params?.q ?? null,
    p_limit: params?.limit ?? 50,
  });
  return Array.isArray(payload) ? (payload as OsChecklistTemplate[]) : [];
}

export async function getOsChecklist(osId: string): Promise<OsChecklistPayload> {
  const payload = await callRpc<any>('os_checklist_get', { p_os_id: osId });
  if (!payload || typeof payload !== 'object') {
    throw new Error('Resposta inválida ao carregar checklist.');
  }
  return payload as OsChecklistPayload;
}

export async function setOsChecklistTemplate(osId: string, templateSlug: string): Promise<void> {
  await callRpc('os_checklist_set_template', { p_os_id: osId, p_template_slug: templateSlug });
}

export async function toggleOsChecklistItem(osId: string, stepId: string, done: boolean): Promise<void> {
  await callRpc('os_checklist_toggle', { p_os_id: osId, p_step_id: stepId, p_done: done });
}

export async function recomputeOsChecklist(osId: string): Promise<void> {
  await callRpc('os_checklist_recompute', { p_os_id: osId });
}


import { callRpc } from '@/lib/api';

export type OpsAccountDeletionPreviewUser = {
  user_id: string;
  email: string | null;
  memberships_total: number;
  will_delete_auth: boolean;
};

export type OpsAccountDeletionTableCount = {
  table_name: string;
  rows: number;
};

export type OpsAccountDeletionPreview = {
  empresa_id: string;
  empresa_nome: string;
  empresa_slug: string | null;
  memberships_count: number;
  auth_users_delete_count: number;
  scoped_tables_count: number;
  scoped_rows_total: number;
  required_confirmation: string;
  users: OpsAccountDeletionPreviewUser[];
  table_counts: OpsAccountDeletionTableCount[];
};

export type OpsAccountDeletionResult = {
  audit_id: string;
  empresa_id: string;
  deleted_tables: Record<string, number>;
  deleted_storage_objects: number;
  deleted_empresas_rows: number;
  deleted_memberships_candidates: number;
  deleted_profiles_rows: number;
  deleted_identities_rows: number;
  deleted_sessions_rows: number;
  deleted_refresh_tokens_rows: number;
  deleted_auth_users_rows: number;
};

export type OpsAccountDeletionAuditRow = {
  id: string;
  target_empresa_id: string;
  requested_by: string;
  reason: string | null;
  status: 'running' | 'success' | 'failed';
  result: Record<string, unknown>;
  error_message: string | null;
  executed_at: string;
  created_at: string;
};

export async function getOpsAccountDeletionPreview() {
  return callRpc<OpsAccountDeletionPreview>('ops_account_delete_preview_current_empresa');
}

export async function executeOpsAccountDeletion(params: { confirmation: string; reason?: string }) {
  return callRpc<OpsAccountDeletionResult>('ops_account_delete_current_empresa', {
    p_confirmation: params.confirmation,
    p_reason: params.reason?.trim() || null,
  });
}

export async function listOpsAccountDeletionAudit(limit = 10) {
  return callRpc<OpsAccountDeletionAuditRow[]>('ops_account_deletion_audit_list', { p_limit: limit });
}

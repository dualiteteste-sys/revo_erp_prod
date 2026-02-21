import { callRpc } from '@/lib/api';

export type UserPermissionOverrideHistoryRow = {
  id: string;
  changed_at: string;
  changed_by: string | null;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  permission_id: string | null;
  permission_module: string | null;
  permission_action: string | null;
  before_allow: boolean | null;
  after_allow: boolean | null;
};

export async function listUserPermissionOverrideHistory(
  userId: string,
  limit = 50,
): Promise<UserPermissionOverrideHistoryRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rows = await callRpc<UserPermissionOverrideHistoryRow[]>(
    'user_permission_overrides_history_for_current_empresa',
    { p_user_id: userId, p_limit: safeLimit },
  );
  return Array.isArray(rows) ? rows : [];
}

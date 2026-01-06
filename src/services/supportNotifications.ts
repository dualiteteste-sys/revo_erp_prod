import { callRpc } from '@/lib/api';

export type SupportNotification = {
  id: string;
  created_at: string;
  category: 'sistema' | 'integracao' | 'fiscal' | 'financeiro' | 'incidente';
  severity: 'info' | 'warn' | 'error';
  title: string;
  body: string | null;
  source: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
};

export async function listSupportNotifications(params?: { onlyUnread?: boolean; limit?: number; offset?: number }): Promise<SupportNotification[]> {
  return callRpc<SupportNotification[]>('support_notifications_list', {
    p_only_unread: params?.onlyUnread ?? false,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}

export async function markNotificationsRead(ids: string[]): Promise<number> {
  return callRpc<number>('support_notifications_mark_read', { p_ids: ids });
}

export async function markAllNotificationsRead(): Promise<number> {
  return callRpc<number>('support_notifications_mark_all_read', {});
}


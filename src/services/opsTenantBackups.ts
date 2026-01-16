import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

export type OpsTenantBackupRow = {
  id: string;
  created_at: string;
  empresa_id: string;
  target: 'prod' | 'dev' | 'verify';
  r2_bucket: string;
  r2_key: string;
  bytes: number;
  sha256: string;
  status: 'uploaded' | 'failed' | 'restored' | 'deleted';
};

export async function listOpsTenantBackups(params?: { target?: OpsTenantBackupRow['target'] | null; limit?: number; offset?: number }) {
  return callRpc<OpsTenantBackupRow[]>('ops_tenant_backups_list', {
    p_target: params?.target ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}

export async function dispatchTenantBackup(params: { target: OpsTenantBackupRow['target']; label?: string }) {
  const { data, error } = await supabase.functions.invoke('ops-tenant-backups', {
    body: { action: 'backup', target: params.target, label: params.label ?? '' },
  });
  if (error) throw error;
  return data as { ok: boolean; run_url?: string | null };
}

export async function dispatchTenantRestore(params: {
  target: OpsTenantBackupRow['target'];
  r2_key: string;
  confirm?: string;
}) {
  const { data, error } = await supabase.functions.invoke('ops-tenant-backups', {
    body: { action: 'restore', target: params.target, r2_key: params.r2_key, confirm: params.confirm ?? '' },
  });
  if (error) throw error;
  return data as { ok: boolean; run_url?: string | null };
}

export async function dispatchTenantRestoreLatest(params?: {
  source_target?: OpsTenantBackupRow['target'];
  target?: OpsTenantBackupRow['target'];
  confirm?: string;
}) {
  const { data, error } = await supabase.functions.invoke('ops-tenant-backups', {
    body: {
      action: 'restore_latest',
      source_target: params?.source_target ?? 'prod',
      target: params?.target ?? 'verify',
      confirm: params?.confirm ?? '',
    },
  });
  if (error) throw error;
  return data as { ok: boolean; run_url?: string | null; r2_key?: string | null };
}

import { callRpc } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

export type OpsDbBackupRow = {
  id: string;
  created_at: string;
  target: 'prod' | 'dev' | 'verify';
  mode: 'full' | 'schema-only';
  r2_bucket: string;
  r2_key: string;
  sha256: string;
  bytes: number;
  git_sha: string | null;
  status: 'uploaded' | 'failed' | 'restored' | 'deleted';
};

export async function listOpsDbBackups(params?: { target?: OpsDbBackupRow['target'] | null; limit?: number; offset?: number }) {
  return callRpc<OpsDbBackupRow[]>('ops_db_backups_list', {
    p_target: params?.target ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });
}

export async function dispatchDbBackup(params: { target: OpsDbBackupRow['target']; mode: OpsDbBackupRow['mode']; label?: string }) {
  const { data, error } = await supabase.functions.invoke('ops-backups', {
    body: { action: 'backup', target: params.target, mode: params.mode, label: params.label ?? '' },
  });
  if (error) throw error;
  return data as { ok: boolean; run_url?: string | null };
}

export async function dispatchDbRestore(params: {
  target: OpsDbBackupRow['target'];
  r2_key: string;
  confirm?: string;
}) {
  const { data, error } = await supabase.functions.invoke('ops-backups', {
    body: { action: 'restore', target: params.target, r2_key: params.r2_key, confirm: params.confirm ?? '' },
  });
  if (error) throw error;
  return data as { ok: boolean; run_url?: string | null };
}

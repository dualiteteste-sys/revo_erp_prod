import { callRpc } from '@/lib/api';

export type OpsContextSnapshot = {
  at: string;
  user_id: string | null;
  empresa_id: string | null;
  role: string | null;
  plano_mvp: string | null;
  max_users: number | null;
};

export async function getOpsContextSnapshot(): Promise<OpsContextSnapshot> {
  return callRpc<OpsContextSnapshot>('ops_context_snapshot');
}


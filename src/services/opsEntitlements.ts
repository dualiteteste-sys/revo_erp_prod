import { callRpc } from '@/lib/api';

export type PlanSlug = 'ESSENCIAL' | 'PRO' | 'MAX' | 'INDUSTRIA' | 'SCALE';
export type PlanoMvp = 'servicos' | 'industria' | 'ambos';

export type BillingPlanEntitlements = {
  plano_mvp: PlanoMvp;
  max_users: number;
  max_nfe_monthly: number;
};

export type OpsBillingPlanEntitlementsOverride = {
  plan_slug: PlanSlug;
  plano_mvp: PlanoMvp;
  max_users: number;
  max_nfe_monthly: number;
  created_at: string;
  updated_at: string;
};

export async function getBillingPlanEntitlements(planSlug: PlanSlug): Promise<BillingPlanEntitlements | null> {
  const rows = await callRpc<Array<{ plano_mvp: PlanoMvp; max_users: number; max_nfe_monthly: number }>>('billing_plan_entitlements', {
    p_plan_slug: planSlug,
  });
  const row = rows?.[0];
  if (!row) return null;
  return { plano_mvp: row.plano_mvp, max_users: row.max_users, max_nfe_monthly: row.max_nfe_monthly };
}

export async function listOpsBillingPlanEntitlementsOverrides(): Promise<OpsBillingPlanEntitlementsOverride[]> {
  return callRpc<OpsBillingPlanEntitlementsOverride[]>('ops_billing_plan_entitlements_list', {});
}

export async function upsertOpsBillingPlanEntitlementsOverride(input: {
  plan_slug: PlanSlug;
  plano_mvp: PlanoMvp;
  max_users: number;
  max_nfe_monthly: number;
}): Promise<void> {
  await callRpc('ops_billing_plan_entitlements_upsert', {
    p_plan_slug: input.plan_slug,
    p_plano_mvp: input.plano_mvp,
    p_max_users: input.max_users,
    p_max_nfe_monthly: input.max_nfe_monthly,
  });
}

export async function deleteOpsBillingPlanEntitlementsOverride(planSlug: PlanSlug): Promise<void> {
  await callRpc('ops_billing_plan_entitlements_delete', { p_plan_slug: planSlug });
}


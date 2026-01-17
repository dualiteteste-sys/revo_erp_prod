import { supabase } from '@/lib/supabaseClient';

export type OpsStripeCustomerSummary = {
  id: string;
  name: string | null;
  email: string | null;
  created: number;
  metadata: Record<string, string> | null;
  subscription: {
    id: string;
    status: string;
    current_period_end: number | null;
    price_id: string | null;
    interval: string | null;
  } | null;
};

export type OpsStripeDedupeInspectResponse = {
  empresa: { id: string; stripe_customer_id: string | null; cnpj: string | null } | null;
  query: { empresa_id: string | null; email: string | null; cnpj: string | null };
  customers: OpsStripeCustomerSummary[];
  recommended_customer_id: string | null;
  duplicates?: {
    by_email: Array<{ key: string; count: number; customer_ids: string[] }>;
    by_cnpj: Array<{ key: string; count: number; customer_ids: string[] }>;
    by_empresa_id: Array<{ key: string; count: number; customer_ids: string[] }>;
  };
};

export async function opsStripeDedupeInspect(params: {
  empresa_id: string;
  email?: string | null;
  cnpj?: string | null;
}): Promise<OpsStripeDedupeInspectResponse> {
  const { data, error } = await supabase.functions.invoke('ops-stripe-dedupe', {
    body: {
      action: 'inspect',
      empresa_id: params.empresa_id,
      email: params.email ?? null,
      cnpj: params.cnpj ?? null,
    },
  });
  if (error) throw error;
  return data as OpsStripeDedupeInspectResponse;
}

export async function opsStripeDedupeLink(params: {
  empresa_id: string;
  customer_id?: string | null;
  email?: string | null;
  cnpj?: string | null;
  dry_run?: boolean;
}): Promise<{ linked: boolean; synced?: boolean; message?: string }> {
  const { data, error } = await supabase.functions.invoke('ops-stripe-dedupe', {
    body: {
      action: 'link',
      empresa_id: params.empresa_id,
      customer_id: params.customer_id ?? null,
      email: params.email ?? null,
      cnpj: params.cnpj ?? null,
      dry_run: params.dry_run ?? false,
    },
  });
  if (error) throw error;
  return data as any;
}

export async function opsStripeDedupeDelete(params: {
  empresa_id: string;
  customer_id: string;
  email?: string | null;
  cnpj?: string | null;
  dry_run?: boolean;
}): Promise<{ deleted: boolean; safety?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('ops-stripe-dedupe', {
    body: {
      action: 'delete',
      empresa_id: params.empresa_id,
      customer_id: params.customer_id,
      email: params.email ?? null,
      cnpj: params.cnpj ?? null,
      dry_run: params.dry_run ?? false,
    },
  });
  if (error) throw error;
  return data as any;
}

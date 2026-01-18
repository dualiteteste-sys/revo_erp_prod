import { callRpc } from "@/lib/api";

export type PlanoMvp = "servicos" | "industria" | "ambos";

export type EmpresaFeaturesRow = {
  revo_send_enabled: boolean;
  nfe_emissao_enabled: boolean;
  plano_mvp: PlanoMvp;
  max_users: number;
  max_nfe_monthly: number;
  servicos_enabled: boolean;
  industria_enabled: boolean;
  updated_at: string | null;
};

export async function empresaFeaturesGet(): Promise<EmpresaFeaturesRow | null> {
  const rows = await callRpc<EmpresaFeaturesRow[]>("empresa_features_get", {});
  return rows?.[0] ?? null;
}

export async function empresaFeaturesSet(patch: Partial<EmpresaFeaturesRow>): Promise<EmpresaFeaturesRow | null> {
  const rows = await callRpc<EmpresaFeaturesRow[]>("empresa_features_set", { p_patch: patch as any });
  return rows?.[0] ?? null;
}


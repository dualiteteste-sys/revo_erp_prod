import { callRpc } from "@/lib/api";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabaseClient";

type PendingMarketingPlan = "essencial" | "pro" | "max" | "industria" | "scale";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPendingMarketingPlan(): { slug: PendingMarketingPlan; cycle?: string } | null {
  try {
    const raw = localStorage.getItem("pending_plan_slug");
    if (!raw) return null;
    const slug = raw.toLowerCase() as PendingMarketingPlan;
    if (!["essencial", "pro", "max", "industria", "scale"].includes(slug)) return null;
    const cycle = localStorage.getItem("pending_plan_cycle") ?? undefined;
    return { slug, cycle };
  } catch {
    return null;
  }
}

async function applyMarketingPlanEntitlements(empresaId: string) {
  const pending = readPendingMarketingPlan();
  if (!pending) return;

  const map: Record<
    PendingMarketingPlan,
    { plano_mvp: "servicos" | "industria" | "ambos"; max_users: number; max_nfe_monthly: number }
  > = {
    essencial: { plano_mvp: "servicos", max_users: 2, max_nfe_monthly: 150 },
    pro: { plano_mvp: "servicos", max_users: 5, max_nfe_monthly: 500 },
    max: { plano_mvp: "servicos", max_users: 10, max_nfe_monthly: 1200 },
    industria: { plano_mvp: "industria", max_users: 10, max_nfe_monthly: 300 },
    scale: { plano_mvp: "ambos", max_users: 999, max_nfe_monthly: 5000 },
  };

  const next = map[pending.slug];
  try {
    const idempotencyKey = `plan_intent:${empresaId}:${pending.slug}:${pending.cycle ?? ''}`;
    await callRpc("empresa_entitlements_upsert_for_current_empresa", {
      p_plano_mvp: next.plano_mvp,
      p_max_users: next.max_users,
      p_max_nfe_monthly: next.max_nfe_monthly,
      p_idempotency_key: idempotencyKey,
    });

    logger.info("[PlanIntent] Applied marketing plan entitlements", { empresaId, ...next, cycle: pending.cycle });
  } catch (error) {
    logger.warn("[PlanIntent] Failed to apply marketing plan entitlements", { empresaId, error });
  }
}

/**
 * Executa a RPC bootstrap_empresa_for_current_user para garantir:
 * - Se já há empresa ativa: retorna { empresa_id, status: 'already_active' }
 * - Se é membro de alguma: ativa uma existente: 'activated_existing'
 * - Caso contrário: cria, vincula e ativa: 'created_new'
 *
 * Observação: Deve ser chamada APÓS o usuário estar autenticado.
 */
export async function bootstrapEmpresaParaUsuarioAtual(opts?: {
  razao_social?: string | null;
  fantasia?: string | null;
}): Promise<{ empresa_id: string; status: string }> {
  try {
    const data = await callRpc<unknown>("secure_bootstrap_empresa_for_current_user", {
      p_razao_social: opts?.razao_social ?? null,
      p_fantasia: opts?.fantasia ?? null,
    });

    // A função retorna table(empresa_id uuid, status text); PostgREST entrega array
    // Em alguns ambientes (schema mais novo), ela retorna VOID. Nesse caso, buscamos a empresa ativa após o bootstrap.

    // Caso 1: Retorno direto de string (UUID)
    if (typeof data === 'string') {
      logger.info("[RPC][bootstrap_empresa_for_current_user] String returned", { data });
      return { empresa_id: data, status: 'unknown' };
    }

    // Caso 2: Retorno de array/objeto
    const row = Array.isArray(data) ? data[0] : data;
    const rowEmpresaId = (row as any)?.empresa_id ?? null;
    const rowStatus = (row as any)?.status ?? 'unknown';

    // Caso 2.1: Retorno moderno (void/null) → buscar empresa ativa após bootstrap (com retry curto)
    if (!rowEmpresaId) {
      for (let attempt = 0; attempt < 5; attempt++) {
        // 1) Já existe empresa ativa? (RPC-first)
        try {
          const empresaId = await callRpc<string | null>("active_empresa_get_for_current_user", {});
          if (empresaId) {
            logger.info("[RPC][bootstrap_empresa_for_current_user] Fetched active empresa after void bootstrap", {
              empresaId,
              attempt,
            });
            await applyMarketingPlanEntitlements(empresaId);
            return { empresa_id: empresaId, status: "unknown" };
          }
        } catch {
          // ignore (retry)
        }

        // 2) fallback: tenta achar o vínculo mais recente (RPC-first)
        try {
          const empresas = await callRpc<any[]>("empresas_list_for_current_user", { p_limit: 2 });
          const ids = (empresas ?? []).map((e) => e?.id).filter(Boolean);
          if (ids.length === 1) {
            const empresaId = String(ids[0]);
            try {
              await (supabase as any).rpc("set_active_empresa_for_current_user", { p_empresa_id: empresaId });
            } catch {
              // best-effort
            }
            await applyMarketingPlanEntitlements(empresaId);
            return { empresa_id: empresaId, status: "unknown" };
          }
        } catch {
          // ignore (retry)
        }

        await sleep(250 + attempt * 150);
      }
    }

    if (!row || !rowEmpresaId) {
      logger.error("[RPC][bootstrap_empresa_for_current_user] Invalid data returned", null, { data });
      throw new Error("Falha ao preparar sua empresa. Tente novamente.");
    }

    logger.info("[RPC][bootstrap_empresa_for_current_user] OK", { row });
    // If the user came from landing pricing, apply the chosen plan limits/modules now (best-effort).
    await applyMarketingPlanEntitlements(rowEmpresaId);
    return { empresa_id: rowEmpresaId, status: rowStatus };
  } catch (error) {
    logger.error("[RPC][bootstrap_empresa_for_current_user] Error", error);
    throw error;
  }
}

/**
 * whoami simples para debug/telemetria.
 * Lê a sessão e retorna o user id/email atuais.
 */
export async function whoAmI(): Promise<{ user_id: string | null; email: string | null }> {
  try {
    const data = await callRpc<{ user_id: string, email: string }>('whoami');
    return data;
  } catch (error) {
    logger.error("[RPC][whoami] Error", error);
    return { user_id: null, email: null };
  }
}

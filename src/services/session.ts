import { callRpc } from "@/lib/api";
import { logger } from "@/lib/logger";

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
    const data = await callRpc<{ empresa_id: string; status: string }[]>("bootstrap_empresa_for_current_user", {
      p_razao_social: opts?.razao_social ?? null,
      p_fantasia: opts?.fantasia ?? null,
    });

    // A função retorna table(empresa_id uuid, status text); PostgREST entrega array
    // MAS se o retorno for apenas um UUID (string), tratamos aqui.

    // Caso 1: Retorno direto de string (UUID)
    if (typeof data === 'string') {
      logger.info("[RPC][bootstrap_empresa_for_current_user] String returned", { data });
      return { empresa_id: data, status: 'unknown' };
    }

    // Caso 2: Retorno de array/objeto
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || !row.empresa_id) {
      logger.error("[RPC][bootstrap_empresa_for_current_user] Invalid data returned", null, { data });
      throw new Error("Falha ao bootstrapar empresa.");
    }

    logger.info("[RPC][bootstrap_empresa_for_current_user] OK", { row });
    return { empresa_id: row.empresa_id, status: row.status };
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

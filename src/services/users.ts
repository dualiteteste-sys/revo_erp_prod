// src/services/users.ts
// Serviços de Usuários: listar/contar (RPC), ativar/desativar (RPC),
// remover convite (RPC), atualizar papel (RPC), convidar (Edge opcional),
// reenviar convite via cliente (OTP/Reset) — single-try, sem backoff.
// Logs: [USERS] [RPC][DEACTIVATE] [RPC][REACTIVATE] [RPC][DELETE_INVITE] [RPC][UPDATE_ROLE] [INVITE] [RESEND-CLIENT]

import { supabase } from "@/lib/supabaseClient";
import type { UsersFilters, UserRole, UserStatus } from "@/features/users/types";

/** Modelo exibido na UI */
export type ListedUser = {
  user_id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  status: string;
  invited_at: string | null;
  last_sign_in_at: string | null;
};

/* ==================== Utils ==================== */
function arrOrNull<T>(v?: T[] | null): T[] | null {
  return v && v.length ? v : null;
}
function siteUrl(): string {
  return (import.meta as any)?.env?.VITE_SITE_URL || window.location.origin;
}
async function getCurrentEmpresaId(): Promise<string> {
  const { data, error } = await supabase.rpc("current_empresa_id");
  if (error) throw error;
  const id = typeof data === "string" ? data : (data?.id ?? data);
  if (!id) throw new Error("NO_ACTIVE_TENANT");
  return id;
}
function isRateLimit(err: any): boolean {
  const msg = (err?.message || err?.error_description || "").toString().toLowerCase();
  return err?.status === 429 || msg.includes("rate limit");
}

function normalizeRoleForDb(role: UserRole): Exclude<UserRole, "READONLY"> {
  if (role === "READONLY") return "VIEWER";
  return role;
}

/* ==================== Listagem e contagem ==================== */
export async function listUsers(
  filters: UsersFilters,
  page: number,
  pageSize: number
): Promise<ListedUser[]> {
  const p_limit = pageSize ?? 25;
  const p_offset = Math.max(0, (page - 1) * p_limit);
  const p_q = filters?.q?.trim() || null;
  const p_status = arrOrNull<UserStatus>(filters?.status) as any;
  const p_role = arrOrNull<UserRole>(filters?.role) as any;

  const { data, error } = await supabase.rpc("list_users_for_current_empresa_v2", {
    p_limit,
    p_offset,
    p_q,
    p_status,
    p_role,
  });

  if (error) {
    console.error("[USERS] rpc list_users_for_current_empresa_v2 error", error);
    throw new Error(error.message || "Falha ao listar usuários.");
  }

  return (data ?? []).map((row: any) => ({
    user_id: row.user_id,
    email: row.email ?? null,
    name: row.name ?? null,
    role: row.role ?? null,
    status: row.status ?? "ACTIVE",
    invited_at: row.invited_at ?? null,
    last_sign_in_at: row.last_sign_in_at ?? null,
  }));
}

export async function countUsers(filters: UsersFilters): Promise<number> {
  const p_q = filters?.q?.trim() || null;
  const p_status = arrOrNull<UserStatus>(filters?.status) as any;
  const p_role = arrOrNull<UserRole>(filters?.role) as any;

  const { data, error } = await supabase.rpc("count_users_for_current_empresa", {
    p_q,
    p_status,
    p_role,
  });

  if (error) {
    console.error("[USERS] rpc count_users_for_current_empresa error", error);
    throw new Error(error.message || "Falha ao contar usuários.");
  }

  const n = typeof data === "number" ? data : Number(data ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* ==================== Ações de usuário (RPCs) ==================== */
export async function deactivateUser(userId: string): Promise<void> {
  console.log("[RPC][DEACTIVATE] deactivate_user_for_current_empresa", { userId });
  const { error } = await supabase.rpc("deactivate_user_for_current_empresa", { p_user_id: userId });
  if (error) {
    console.error("[RPC][DEACTIVATE] error", error);
    throw new Error(error.message || "Falha ao desativar usuário.");
  }
}

export async function reactivateUser(userId: string): Promise<void> {
  console.log("[RPC][REACTIVATE] reactivate_user_for_current_empresa", { userId });
  const { error } = await supabase.rpc("reactivate_user_for_current_empresa", { p_user_id: userId });
  if (error) {
    console.error("[RPC][REACTIVATE] error", error);
    throw new Error(error.message || "Falha ao reativar usuário.");
  }
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const normalized = normalizeRoleForDb(role);
  console.log("[RPC][UPDATE_ROLE] update_user_role_for_current_empresa", { userId, role: normalized });
  const { error } = await supabase.rpc("update_user_role_for_current_empresa", {
    p_role: normalized,
    p_user_id: userId,
  });
  if (error) {
    console.error("[RPC][UPDATE_ROLE] error", error);
    throw new Error(error.message || "Falha ao atualizar papel do usuário.");
  }
}

export async function removePendingInvite(userId: string): Promise<number> {
  console.log("[RPC][DELETE_INVITE] delete_pending_invitation", { userId });
  const { data, error } = await supabase.rpc("delete_pending_invitation", { p_user_id: userId });
  if (error) {
    console.error("[RPC][DELETE_INVITE] error", error);
    const message =
      (error as any)?.hint ||
      (error as any)?.details ||
      (error as any)?.message ||
      "Erro ao remover convite.";
    throw new Error(message);
  }
  const removed = typeof data === "number" ? data : 0;
  console.log("[RPC][DELETE_INVITE] ok", { removed });
  return removed;
}

export const deletePendingInvitation = removePendingInvite;

/* ==================== Invite (Edge opcional) ==================== */
export async function inviteUser(email: string, role?: string, empresa_id?: string): Promise<any>;
export async function inviteUser(params: { email: string; role?: string; empresa_id?: string }): Promise<any>;
export async function inviteUser(arg1: any, arg2?: string, arg3?: string): Promise<any> {
  const email: string | undefined = typeof arg1 === "string" ? arg1 : arg1?.email;
  const role: string = (typeof arg1 === "object" ? arg1?.role : arg2) ?? "ADMIN";
  const empresa_id: string | undefined = typeof arg1 === "object" ? arg1?.empresa_id : arg3;

  const normalizedRole = role === "READONLY" ? "VIEWER" : role;
  console.log("[INVITE] (edge) invoke invite-user", { email, role: normalizedRole, empresa_id });
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { email, role: normalizedRole, ...(empresa_id ? { empresa_id } : {}) },
  });
  if (error) {
    let detail: string | undefined = (error as any)?.message;
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.text === "function") {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw);
          detail = parsed?.detail || parsed?.error || raw;
        } catch { detail = raw; }
      }
    } catch { /* ignore */ }
    console.error("[INVITE] error", error, detail);
    throw new Error(detail || (error as any).message || "Falha ao enviar convite.");
  }
  return data;
}

/* ==================== RESEND (Edge) ==================== */
export async function resendInviteEdge(params: { email?: string; user_id?: string; empresa_id?: string; link_only?: boolean }) {
  console.log("[RESEND] (edge) invoke resend-invite", params);
  const { data, error } = await supabase.functions.invoke("resend-invite", { body: params });
  if (error) {
    let detail: string | undefined = (error as any)?.message;
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.text === "function") {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw);
          detail = parsed?.detail || parsed?.error || raw;
        } catch { detail = raw; }
      }
    } catch { /* ignore */ }
    console.error("[RESEND] error", error, detail);
    throw new Error(detail || (error as any).message || "Falha ao reenviar convite.");
  }
  return data;
}

export const resendInvite = resendInviteEdge;

/* ==================== CREATE (manual) ==================== */
export async function manualCreateUser(params: {
  email: string;
  password: string;
  role: string;
  empresa_id?: string;
}): Promise<
  | {
      ok: true;
      user_id: string;
      email: string;
      empresa_id: string;
      role: string;
      status: "PENDING" | "ACTIVE" | "INACTIVE" | "SUSPENDED";
      must_change_password: boolean;
    }
  | { ok: false; error: string; detail?: string }
> {
  const payload = {
    email: params.email,
    password: params.password,
    role: params.role,
    ...(params.empresa_id ? { empresa_id: params.empresa_id } : {}),
  };

  const { data, error } = await supabase.functions.invoke("manual-create-user", { body: payload });
  if (error) {
    let detail: string | undefined = (error as any)?.message;
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.text === "function") {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw);
          detail = parsed?.detail || parsed?.error || raw;
        } catch {
          detail = raw;
        }
      }
    } catch {
      /* ignore */
    }
    console.error("[USERS][MANUAL_CREATE] error", error, detail);
    return { ok: false, error: "UNEXPECTED_ERROR", detail };
  }

  return (data ?? { ok: false, error: "EMPTY_RESPONSE" }) as any;
}

/* ==================== RESEND via cliente (legado/rápido) ==================== */
/**
 * Tenta reenviar e-mail (OTP primeiro; se falhar, Reset Password).
 * Sem backoff: retorna rápido para a UI reabilitar os botões.
 * Em caso de 429, devolve erro claro para o toast.
 */
export async function resendInviteClient(params: { email: string; empresaId?: string }) {
  const email = params.email.trim().toLowerCase();
  const empresaId = params.empresaId || (await getCurrentEmpresaId());
  const redirect = `${siteUrl()}/auth/callback?empresa_id=${encodeURIComponent(empresaId)}`;

  console.log("[RESEND-CLIENT] start", { email, redirect });

  // 1) OTP (magic link)
  const otp = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (!otp.error) {
    console.log("[RESEND-CLIENT] OTP sent");
    return { ok: true as const, action: "otp" as const, email };
  }

  // 2) Reset password (fallback)
  const reset = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
  if (!reset.error) {
    console.log("[RESEND-CLIENT] reset sent");
    return { ok: true as const, action: "reset" as const, email };
  }

  // 3) Erro → normalizar mensagem
  const err = otp.error || reset.error;
  if (isRateLimit(err)) {
    throw new Error("Limite de e-mails atingido. Tente novamente em ~1–2 minutos.");
  }
  throw new Error(err?.message || "Falha ao reenviar convite.");
}

// Alias compat legado
export const resendInviteLegacy = resendInviteClient;

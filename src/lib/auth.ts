import { supabase } from './supabaseClient';
import { logger } from './logger';

function authSiteUrl(): string {
  const origin = window.location.origin;
  const envSite = (import.meta as any)?.env?.VITE_SITE_URL;
  if (/localhost|127\.0\.0\.1/i.test(origin)) return origin;
  return envSite || origin;
}

function emailConfirmRedirect(opts?: { plan?: string | null; cycle?: string | null }): string {
  const url = new URL(`${authSiteUrl()}/auth/confirmed`);
  try {
    const fromArgsPlan = (opts?.plan ?? '').trim();
    const fromArgsCycle = (opts?.cycle ?? '').trim();
    const pendingPlan = fromArgsPlan || (localStorage.getItem('pending_plan_slug') ?? '').trim();
    const pendingCycle = fromArgsCycle || (localStorage.getItem('pending_plan_cycle') ?? '').trim();
    if (pendingPlan) url.searchParams.set('plan', pendingPlan);
    if (pendingCycle) url.searchParams.set('cycle', pendingCycle);
  } catch {
    // ignore
  }
  return url.toString();
}

/**
 * Faz signup por e-mail/senha.
 * O e-mail de confirmação será enviado para a URL de produção.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  companyName?: string,
  opts?: { plan?: string | null; cycle?: string | null },
) {
  logger.info("[AUTH] signUpWithEmail", { email });
  const company = (companyName ?? "").trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: emailConfirmRedirect(opts),
      data: company ? { company_name: company } : undefined,
    },
  });
  if (error) {
    logger.error("[AUTH] signUp error", error);
    throw error;
  }
  return data;
}

/**
 * Login via OTP (magic link).
 * O e-mail de confirmação será enviado para a URL de produção.
 */
export async function signInWithEmail(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: emailConfirmRedirect(),
    },
  });
  if (error) {
    logger.error('[AUTH][SIGNIN][ERR]', error);
    throw error;
  }
  return data;
}

export async function sendPasswordResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${authSiteUrl()}/auth/update-password`,
  });
  if (error) {
    logger.error('[AUTH] resetPasswordForEmail error', error);
    throw error;
  }
}

export async function resendSignupConfirmation(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: emailConfirmRedirect() },
  });
  if (error) {
    logger.error('[AUTH] resend(signup) error', error);
    throw error;
  }
  return { ok: true as const };
}

export async function signOut() {
  await supabase.auth.signOut();
}

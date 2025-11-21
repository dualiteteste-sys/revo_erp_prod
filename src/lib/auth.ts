import { supabase } from './supabaseClient';

/**
 * Faz signup por e-mail/senha.
 * O e-mail de confirmação será enviado para a URL de produção.
 */
export async function signUpWithEmail(email: string, password: string) {
  console.log("[AUTH] signUpWithEmail", { email });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/confirmed`,
    },
  });
  if (error) {
    console.error("[AUTH] signUp error", error);
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
      emailRedirectTo: `${window.location.origin}/auth/confirmed`,
    },
  });
  if (error) {
    console.error('[AUTH][SIGNIN][ERR]', error);
    throw error;
  }
  return data;
}

export async function sendPasswordResetEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    if (error) {
      console.error('[AUTH] resetPasswordForEmail error', error);
      throw error;
    }
}

export async function signOut() {
    await supabase.auth.signOut();
}

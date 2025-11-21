import { supabase } from '@/lib/supabaseClient';
import { callRpc } from '@/lib/api';

export async function ensureSessionAndActiveEmpresa(empresaId: string) {
  console.log('[AUTH] ensureSessionAndActiveEmpresa:init', { empresaId });
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[AUTH] getSession error', error);
    throw error;
  }
  if (!data?.session) {
    console.warn('[AUTH] Sem sessão. Aborte a configuração de empresa ativa.');
    throw new Error('Sem sessão. Usuário precisa estar autenticado.');
  }
  console.log('[AUTH] Session OK', { user: data.session.user?.id });

  try {
    await callRpc('set_active_empresa_for_current_user', {
        p_empresa_id: empresaId,
    });
    console.log('[RPC][set_active_empresa_for_current_user][OK]', { empresaId });
  } catch (rpcErr) {
    console.error('[RPC][set_active_empresa_for_current_user][ERR]', rpcErr);
    throw rpcErr;
  }
}

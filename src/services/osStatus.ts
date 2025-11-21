import { supabase } from '@/lib/supabaseClient';

export async function setStatus(osId: string, next: 'orcamento'|'aberta'|'concluida'|'cancelada', opts?: { force?: boolean }) {
  const { data, error } = await supabase.rpc('os_set_status_for_current_user', {
    p_os_id: osId,
    p_next: next,
    p_opts: opts ? JSON.parse(JSON.stringify(opts)) : {}
  });
  if (error) {
    console.error('[RPC][ERROR] os_set_status_for_current_user', error);
    throw error;
  }
  return data as any; // public.ordem_servicos
}

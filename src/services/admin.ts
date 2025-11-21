import { supabase } from '@/lib/supabaseClient';
import { UserStatus } from '@/features/users/types';

export interface CleanupUser {
  user_id: string;
  email: string;
  status: UserStatus;
  empresa_id: string;
}

export async function previewTenantCleanup(keepEmail: string, removeActive: boolean): Promise<CleanupUser[]> {
  const { data, error } = await supabase.functions.invoke('tenant-cleanup', {
    body: {
      keep_email: keepEmail,
      remove_active: removeActive,
      dry_run: true,
    },
  });

  if (error) {
    const errorMessage = (error as any).context?.body?.message || error.message || 'Falha ao pré-visualizar a limpeza.';
    throw new Error(errorMessage);
  }
  return data as CleanupUser[];
}

export async function executeTenantCleanup(keepEmail: string, removeActive: boolean): Promise<CleanupUser[]> {
    const { data, error } = await supabase.functions.invoke('tenant-cleanup', {
        body: {
          keep_email: keepEmail,
          remove_active: removeActive,
          dry_run: false,
        },
      });
    
      if (error) {
        const errorMessage = (error as any).context?.body?.message || error.message || 'Falha ao executar a limpeza.';
        throw new Error(errorMessage);
      }
      return data as CleanupUser[];
}

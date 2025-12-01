import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { Database } from '@/types/database.types';

type Empresa = Database['public']['Tables']['empresas']['Row'];

export const EMPRESAS_KEYS = {
    all: ['empresas'] as const,
    list: () => [...EMPRESAS_KEYS.all, 'list'] as const,
    active: () => [...EMPRESAS_KEYS.all, 'active'] as const,
};

export function useEmpresas(userId: string | null) {
    return useQuery({
        queryKey: EMPRESAS_KEYS.list(),
        queryFn: async () => {
            if (!userId) return [];

            logger.debug('[QUERY][empresas] fetching list');
            const { data, error } = await supabase
                .from("empresa_usuarios")
                .select("empresa:empresas(*)")
                .order("created_at", { ascending: false });

            if (error) {
                logger.error('[QUERY][empresas] list error', error);
                throw error;
            }

            return (data ?? [])
                .map((r: any) => r.empresa)
                .filter((e: any) => e !== null) as Empresa[];
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useActiveEmpresaId(userId: string | null) {
    return useQuery({
        queryKey: EMPRESAS_KEYS.active(),
        queryFn: async () => {
            if (!userId) return null;

            logger.debug('[QUERY][active_empresa] fetching');
            const { data, error } = await supabase
                .from("user_active_empresa")
                .select("empresa_id")
                .single();

            if (error) {
                // PGRST116 = JSON object requested, multiple (or no) rows returned
                if (error.code === 'PGRST116') return null;

                logger.warn('[QUERY][active_empresa] error', error);
                return null;
            }

            // @ts-ignore - Table types might be missing or generic
            return data?.empresa_id as string | null;
        },
        enabled: !!userId,
    });
}

export function useBootstrapEmpresa() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            logger.info("[MUTATION][bootstrap] start");
            // @ts-ignore - RPC types mismatch
            const { data, error } = await supabase.rpc("secure_bootstrap_empresa_for_current_user", {
                p_razao_social: "Empresa sem Nome",
                p_fantasia: null,
            });

            if (error) {
                logger.error("[MUTATION][bootstrap] error", error);
                throw error;
            }

            return data;
        },
        onSuccess: () => {
            logger.info("[MUTATION][bootstrap] success");
            queryClient.invalidateQueries({ queryKey: EMPRESAS_KEYS.all });
        },
    });
}

export function useSetActiveEmpresa() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (empresaId: string) => {
            logger.info("[MUTATION][set_active] start", { empresaId });
            // @ts-ignore - RPC types mismatch
            const { error } = await supabase.rpc('set_active_empresa_for_current_user', {
                p_empresa_id: empresaId
            });

            if (error) {
                logger.error("[MUTATION][set_active] error", error);
                throw error;
            }
        },
        onSuccess: (_, empresaId) => {
            logger.info("[MUTATION][set_active] success");
            // Update the cache immediately
            queryClient.setQueryData(EMPRESAS_KEYS.active(), empresaId);
            queryClient.invalidateQueries({ queryKey: EMPRESAS_KEYS.active() });
        },
    });
}

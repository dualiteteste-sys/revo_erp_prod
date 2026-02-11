import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { Database } from '@/types/database.types';
import { callRpc } from '@/lib/api';

type Empresa = Database['public']['Tables']['empresas']['Row'];

export const EMPRESAS_KEYS = {
    all: ['empresas'] as const,
    list: (userId: string | null) => [...EMPRESAS_KEYS.all, 'list', userId ?? 'anon'] as const,
    active: (userId: string | null) => [...EMPRESAS_KEYS.all, 'active', userId ?? 'anon'] as const,
};

function isTransientNetworkError(error: unknown): boolean {
    const msg = String((error as any)?.message ?? error ?? '').toLowerCase();
    const status = (error as any)?.status ?? (error as any)?.statusCode ?? null;
    if (status === 0) return true;
    if (typeof status === 'number' && status >= 500) return true;
    return (
        msg.includes('failed to fetch') ||
        msg.includes('load failed') ||
        msg.includes('networkerror') ||
        msg.includes('timeout') ||
        msg.includes('ecconnreset')
    );
}

export function useEmpresas(userId: string | null) {
    return useQuery({
        queryKey: EMPRESAS_KEYS.list(userId),
        queryFn: async () => {
            if (!userId) return [];

            logger.debug('[QUERY][empresas] fetching list');
            const data = await callRpc<Empresa[]>('empresas_list_for_current_user', { p_limit: 200 });
            return (data ?? []) as Empresa[];
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5, // 5 minutes
        // Security: never keep previous tenant/user data when userId is absent.
        placeholderData: (prev) => (userId ? prev : []),
        retry: (failureCount, error) => isTransientNetworkError(error) && failureCount < 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    });
}

export function useActiveEmpresaId(userId: string | null) {
    return useQuery({
        queryKey: EMPRESAS_KEYS.active(userId),
        queryFn: async () => {
            if (!userId) return null;

            logger.debug('[QUERY][active_empresa] fetching');
            const empresaId = await callRpc<string | null>('active_empresa_get_for_current_user', {});
            return (empresaId ?? null) as string | null;
        },
        enabled: !!userId,
        staleTime: 1000 * 30,
        // Security: never keep previous tenant/user data when userId is absent.
        placeholderData: (prev) => (userId ? prev : null),
        retry: (failureCount, error) => isTransientNetworkError(error) && failureCount < 3,
        retryDelay: (attemptIndex) => Math.min(750 * 2 ** attemptIndex, 6000),
    });
}

export function useBootstrapEmpresa() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            logger.info("[MUTATION][bootstrap] start");
            let companyName: string | null = null;
            try {
                const { data } = await supabase.auth.getUser();
                const meta: any = (data?.user as any)?.user_metadata ?? {};
                if (typeof meta.company_name === "string" && meta.company_name.trim()) {
                    companyName = meta.company_name.trim();
                }
            } catch {
                // ignore
            }
            // @ts-ignore - RPC types mismatch
            const { data, error } = await supabase.rpc("secure_bootstrap_empresa_for_current_user", {
                p_razao_social: companyName || "Empresa sem Nome",
                p_fantasia: companyName || null,
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
            // Invalida para todos os usuários/sessões (chave inclui userId).
            queryClient.invalidateQueries({ queryKey: EMPRESAS_KEYS.all });
        },
    });
}

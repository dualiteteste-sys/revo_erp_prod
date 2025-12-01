import {
    useQuery,
    useMutation,
    useQueryClient,
    UseQueryOptions,
    UseMutationOptions,
    QueryKey
} from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { PostgrestError } from '@supabase/supabase-js';
import { logger } from './logger';

// Generic types for Supabase responses
type DbResult<T> = T;
type DbError = PostgrestError;

/**
 * Creates a standardized hook for fetching a list of items from a Supabase table.
 */
export function createListQueryHook<T>(
    tableName: string,
    queryKeyPrefix: string,
    select = '*'
) {
    return (options?: UseQueryOptions<T[], DbError>) => {
        return useQuery({
            queryKey: [queryKeyPrefix, 'list'],
            queryFn: async () => {
                logger.debug(`[QUERY][${tableName}] fetching list`);
                const { data, error } = await supabase
                    .from(tableName)
                    .select(select);

                if (error) {
                    logger.error(`[QUERY][${tableName}] list error`, error);
                    throw error;
                }

                return data as T[];
            },
            ...options,
        });
    };
}

/**
 * Creates a standardized hook for fetching a single item by ID.
 */
export function createGetQueryHook<T>(
    tableName: string,
    queryKeyPrefix: string,
    select = '*'
) {
    return (id: string | null | undefined, options?: UseQueryOptions<T, DbError>) => {
        return useQuery({
            queryKey: [queryKeyPrefix, 'detail', id],
            queryFn: async () => {
                if (!id) throw new Error('ID is required');

                logger.debug(`[QUERY][${tableName}] fetching detail`, { id });
                const { data, error } = await supabase
                    .from(tableName)
                    .select(select)
                    .eq('id', id)
                    .single();

                if (error) {
                    logger.error(`[QUERY][${tableName}] detail error`, error);
                    throw error;
                }

                return data as T;
            },
            enabled: !!id && (options?.enabled ?? true),
            ...options,
        });
    };
}

/**
 * Creates a standardized hook for creating items.
 */
export function createCreateMutationHook<T, TInput>(
    tableName: string,
    queryKeyPrefix: string
) {
    return (options?: UseMutationOptions<T, DbError, TInput>) => {
        const queryClient = useQueryClient();

        return useMutation({
            mutationFn: async (newItem: TInput) => {
                logger.debug(`[MUTATION][${tableName}] creating`, newItem as any);
                const { data, error } = await supabase
                    .from(tableName)
                    .insert(newItem as any)
                    .select()
                    .single();

                if (error) {
                    logger.error(`[MUTATION][${tableName}] create error`, error);
                    throw error;
                }

                return data as T;
            },
            onSuccess: (data, variables, context) => {
                // Invalidate list cache
                queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, 'list'] });
                // @ts-ignore - Context type inference issue
                options?.onSuccess?.(data, variables, context);
            },
            ...options,
        });
    };
}

/**
 * Creates a standardized hook for updating items.
 */
export function createUpdateMutationHook<T, TInput extends { id: string }>(
    tableName: string,
    queryKeyPrefix: string
) {
    return (options?: UseMutationOptions<T, DbError, TInput>) => {
        const queryClient = useQueryClient();

        return useMutation({
            mutationFn: async (item: TInput) => {
                const { id, ...updates } = item;
                logger.debug(`[MUTATION][${tableName}] updating`, { id, updates });

                const { data, error } = await supabase
                    .from(tableName)
                    .update(updates as any)
                    .eq('id', id)
                    .select()
                    .single();

                if (error) {
                    logger.error(`[MUTATION][${tableName}] update error`, error);
                    throw error;
                }

                return data as T;
            },
            onSuccess: (data, variables, context) => {
                queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, 'list'] });
                queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, 'detail', variables.id] });
                // @ts-ignore - Context type inference issue
                options?.onSuccess?.(data, variables, context);
            },
            ...options,
        });
    };
}

/**
 * Creates a standardized hook for deleting items.
 */
export function createDeleteMutationHook(
    tableName: string,
    queryKeyPrefix: string
) {
    return (options?: UseMutationOptions<void, DbError, string>) => {
        const queryClient = useQueryClient();

        return useMutation({
            mutationFn: async (id: string) => {
                logger.debug(`[MUTATION][${tableName}] deleting`, { id });
                const { error } = await supabase
                    .from(tableName)
                    .delete()
                    .eq('id', id);

                if (error) {
                    logger.error(`[MUTATION][${tableName}] delete error`, error);
                    throw error;
                }
            },
            onSuccess: (data, variables, context) => {
                queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, 'list'] });
                queryClient.removeQueries({ queryKey: [queryKeyPrefix, 'detail', variables] });
                // @ts-ignore - Context type inference issue
                options?.onSuccess?.(data, variables, context);
            },
            ...options,
        });
    };
}

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import type { AuditEvent, LogsFilters } from '../types';
import mockEvents from '../__mocks__/events.json';

type State = {
  data: AuditEvent[];
  isLoading: boolean;
  isError: boolean;
  errorMsg?: string;
  isLoadingMore: boolean;
  cursorAfter: string | null;
};

const DEFAULT_LIMIT = 50;

function mapFiltersToParams(filters: LogsFilters, after: string | null) {
  const p_from  = filters.from ? filters.from.toISOString() : undefined;
  const p_to    = filters.to   ? filters.to.toISOString()   : undefined;
  const p_limit = filters.limit ?? DEFAULT_LIMIT;

  const normalizeMultiSelect = (values?: (string | 'ALL')[] | null) => {
    if (!values || values.length === 0 || values.includes('ALL')) {
      return null;
    }
    return values.filter(v => v !== 'ALL');
  };

  return {
    p_from,
    p_to,
    p_source: normalizeMultiSelect(filters.source),
    p_table : normalizeMultiSelect(filters.table),
    p_op    : normalizeMultiSelect(filters.op as string[]),
    p_q     : filters.q?.trim() ? filters.q.trim().slice(0, 256) : null,
    p_after : after,
    p_limit : p_limit,
  };
}

export function useLogsQuery(initialFilters: LogsFilters = {}) {
  const supabase = useSupabase();
  const [state, setState] = useState<State>({
    data: [],
    isLoading: false,
    isError: false,
    errorMsg: undefined,
    isLoadingMore: false,
    cursorAfter: null,
  });

  const filtersRef = useRef<LogsFilters>(initialFilters);

  const setFilters = useCallback((next: LogsFilters) => {
    filtersRef.current = next;
  }, []);

  const reset = useCallback(() => {
    setState({
      data: [],
      isLoading: false,
      isError: false,
      errorMsg: undefined,
      isLoadingMore: false,
      cursorAfter: null,
    });
  }, []);

  const fetchFirstPage = useCallback(async () => {
    reset();

    if (!supabase) {
      console.warn('[RPC][LOGS] Modo de demonstração ativado.');
      setState(s => ({ 
        ...s, 
        isLoading: false, 
        data: mockEvents as AuditEvent[], 
        cursorAfter: null // No pagination for demo
      }));
      return;
    }

    setState(s => ({ ...s, isLoading: true, isError: false, errorMsg: undefined }));

    try {
      const params = mapFiltersToParams(filtersRef.current, null);
      const { data, error } = await supabase.rpc('list_events_for_current_user', params);

      if (error) {
        console.error('[RPC][LOGS][ERROR] list_events_for_current_user', error);
        setState(s => ({ ...s, isLoading: false, isError: true, errorMsg: error.message || 'Erro ao carregar logs' }));
        return;
      }

      const rows = (data ?? []) as AuditEvent[];
      const nextCursor = rows.length === params.p_limit ? rows[rows.length - 1]?.occurred_at : null;

      setState(s => ({
        ...s,
        isLoading: false,
        data: rows,
        cursorAfter: nextCursor,
      }));
    } catch (e: any) {
      console.error('[RPC][LOGS][EXCEPTION]', e);
      setState(s => ({
        ...s,
        isLoading: false,
        isError: true,
        errorMsg: e?.message || 'Falha de rede ao buscar logs',
      }));
    }
  }, [reset, supabase]);

  const loadMore = useCallback(async () => {
    if (!state.cursorAfter || !supabase) return;

    setState(s => ({ ...s, isLoadingMore: true }));

    try {
      const params = mapFiltersToParams(filtersRef.current, state.cursorAfter);
      const { data, error } = await supabase.rpc('list_events_for_current_user', params);

      if (error) {
        console.error('[RPC][LOGS][ERROR][MORE] list_events_for_current_user', error);
        setState(s => ({ ...s, isLoadingMore: false, isError: true, errorMsg: error.message || 'Erro ao carregar mais logs' }));
        return;
      }

      const newRows = (data ?? []) as AuditEvent[];
      const nextCursor = newRows.length === params.p_limit ? newRows.length > 0 ? newRows[newRows.length - 1]?.occurred_at : null : null;

      setState(s => ({
        ...s,
        isLoadingMore: false,
        data: s.data.concat(newRows),
        cursorAfter: nextCursor,
      }));
    } catch (e: any) {
      console.error('[RPC][LOGS][EXCEPTION][MORE]', e);
      setState(s => ({
        ...s,
        isLoadingMore: false,
        isError: true,
        errorMsg: e?.message || 'Falha de rede ao carregar mais logs',
      }));
    }
  }, [state.cursorAfter, supabase]);

  const hasMore = !!state.cursorAfter;

  const value = useMemo(() => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    errorMsg: state.errorMsg,
    isLoadingMore: state.isLoadingMore,
    hasMore,
    loadMore,
    fetchFirstPage,
    reset,
    setFilters,
  }), [state, hasMore, loadMore, fetchFirstPage, reset, setFilters]);

  return value;
}

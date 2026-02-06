import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './useDebounce';
import * as financeiroService from '../services/financeiro';
import { useAuth } from '../contexts/AuthProvider';

export const useContasPagar = () => {
    const { activeEmpresa } = useAuth();
    const empresaId = activeEmpresa?.id ?? null;
    const lastEmpresaIdRef = useRef<string | null>(empresaId);
    const fetchTokenRef = useRef(0);
    const [contas, setContas] = useState<financeiroService.ContaPagar[]>([]);
    const [summary, setSummary] = useState<financeiroService.ContasPagarSummary>({
        total_pendente: 0, // Mantendo compatibilidade se a UI usar nomes antigos, mas o serviço retorna abertas/vencidas/etc
        abertas: 0,
        parciais: 0,
        pagas: 0,
        vencidas: 0,
    } as any);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [count, setCount] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const [filterStatus, setFilterStatus] = useState<string | null>(null);
    const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
    const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
    
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [sortBy, setSortBy] = useState<{ column: string; ascending: boolean }>({
        column: 'data_vencimento',
        ascending: true,
    });

    useEffect(() => {
        const prev = lastEmpresaIdRef.current;
        if (prev === empresaId) return;

        // Multi-tenant safety: limpar imediatamente o estado ao trocar de empresa.
        setContas([]);
        setSummary({
            total_pendente: 0,
            abertas: 0,
            parciais: 0,
            pagas: 0,
            vencidas: 0,
        } as any);
        setError(null);
        setCount(0);
        setPage(1);
        setLoading(false);

        lastEmpresaIdRef.current = empresaId;
    }, [empresaId]);

    const fetchContas = useCallback(async () => {
        if (!activeEmpresa) {
            setContas([]);
            setSummary({
                total_pendente: 0,
                abertas: 0,
                parciais: 0,
                pagas: 0,
                vencidas: 0,
            } as any);
            setCount(0);
            return;
        }

        const token = ++fetchTokenRef.current;
        const empresaIdSnapshot = activeEmpresa.id;
        setLoading(true);
        setError(null);
        try {
            const [{ data, count }, summaryData] = await Promise.all([
                financeiroService.listContasPagar({
                    page,
                    pageSize,
                    searchTerm: debouncedSearchTerm,
                    status: filterStatus,
                    startDate: filterStartDate,
                    endDate: filterEndDate,
                    sortBy,
                }),
                financeiroService.getContasPagarSummary(filterStartDate, filterEndDate),
            ]);
            if (token !== fetchTokenRef.current) return;
            if (empresaIdSnapshot !== lastEmpresaIdRef.current) return;
            setContas(data);
            setCount(count);
            setSummary(summaryData);
        } catch (e: any) {
            if (token !== fetchTokenRef.current) return;
            setError(e.message);
            setContas([]);
            setCount(0);
        } finally {
            if (token !== fetchTokenRef.current) return;
            setLoading(false);
        }
    }, [page, pageSize, debouncedSearchTerm, filterStatus, filterStartDate, filterEndDate, sortBy, activeEmpresa]);

    useEffect(() => {
        fetchContas();
    }, [fetchContas]);

    const refresh = () => {
        fetchContas();
    };

    return {
        contas,
        summary,
        loading,
        error,
        count,
        page,
        pageSize,
        searchTerm,
        filterStatus,
        filterStartDate,
        filterEndDate,
        sortBy,
        setPage,
        setPageSize,
        setSearchTerm,
        setFilterStatus,
        setFilterStartDate,
        setFilterEndDate,
        setSortBy,
        refresh,
    };
};

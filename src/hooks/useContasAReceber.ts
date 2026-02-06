import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './useDebounce';
import * as contasAReceberService from '../services/contasAReceber';
import { useAuth } from '../contexts/AuthProvider';

export const useContasAReceber = () => {
    const { activeEmpresa } = useAuth();
    const empresaId = activeEmpresa?.id ?? null;
    const lastEmpresaIdRef = useRef<string | null>(empresaId);
    const fetchTokenRef = useRef(0);
    const [contas, setContas] = useState<contasAReceberService.ContaAReceber[]>([]);
    const [summary, setSummary] = useState<contasAReceberService.ContasAReceberSummary>({
        total_pendente: 0,
        total_pago_mes: 0,
        total_vencido: 0,
    });
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
            total_pago_mes: 0,
            total_vencido: 0,
        });
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
                total_pago_mes: 0,
                total_vencido: 0,
            });
            setCount(0);
            return;
        }

        const token = ++fetchTokenRef.current;
        const empresaIdSnapshot = activeEmpresa.id;
        setLoading(true);
        setError(null);
        try {
            const [{ data, count }, summaryData] = await Promise.all([
                contasAReceberService.listContasAReceber({
                    page,
                    pageSize,
                    searchTerm: debouncedSearchTerm,
                    status: filterStatus,
                    startDate: filterStartDate,
                    endDate: filterEndDate,
                    sortBy,
                }),
                contasAReceberService.getContasAReceberSummary(filterStartDate, filterEndDate),
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

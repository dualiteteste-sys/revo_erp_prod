import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as financeiroService from '../services/financeiro';
import { useAuth } from '../contexts/AuthProvider';

export const useContasPagar = () => {
    const { activeEmpresa } = useAuth();
    const [contas, setContas] = useState<financeiroService.ContaPagar[]>([]);
    const [summary, setSummary] = useState<financeiroService.ContasPagarSummary>({
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
    const [page, setPage] = useState(1);
    const [pageSize] = useState(15);

    const [sortBy, setSortBy] = useState<{ column: string; ascending: boolean }>({
        column: 'data_vencimento',
        ascending: true,
    });

    const fetchContas = useCallback(async () => {
        if (!activeEmpresa) {
            setContas([]);
            setCount(0);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [{ data, count }, summaryData] = await Promise.all([
                financeiroService.listContasPagar({
                    page,
                    pageSize,
                    searchTerm: debouncedSearchTerm,
                    status: filterStatus,
                    sortBy,
                }),
                financeiroService.getContasPagarSummary(),
            ]);
            setContas(data);
            setCount(count);
            setSummary(summaryData);
        } catch (e: any) {
            setError(e.message);
            setContas([]);
            setCount(0);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, debouncedSearchTerm, filterStatus, sortBy, activeEmpresa]);

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
        sortBy,
        setPage,
        setSearchTerm,
        setFilterStatus,
        setSortBy,
        refresh,
    };
};

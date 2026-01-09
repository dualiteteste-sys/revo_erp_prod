import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as salesGoalsService from '../services/salesGoals';
import { useAuth } from '../contexts/AuthProvider';

export const useSalesGoals = () => {
    const { activeEmpresa } = useAuth();
    const [goals, setGoals] = useState<salesGoalsService.SalesGoal[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [count, setCount] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const [filterStatus, setFilterStatus] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [sortBy, setSortBy] = useState<{ column: string; ascending: boolean }>({
        column: 'data_inicio',
        ascending: false,
    });

    const fetchGoals = useCallback(async () => {
        if (!activeEmpresa) {
            setGoals([]);
            setCount(0);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, count } = await salesGoalsService.listSalesGoals({
                page,
                pageSize,
                searchTerm: debouncedSearchTerm,
                status: filterStatus,
                sortBy,
            });
            setGoals(data);
            setCount(count);
        } catch (e: any) {
            setError(e.message);
            setGoals([]);
            setCount(0);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, debouncedSearchTerm, filterStatus, sortBy, activeEmpresa]);

    useEffect(() => {
        fetchGoals();
    }, [fetchGoals]);

    const refresh = () => {
        fetchGoals();
    };

    return {
        goals,
        loading,
        error,
        count,
        page,
        pageSize,
        searchTerm,
        filterStatus,
        sortBy,
        setPage,
        setPageSize,
        setSearchTerm,
        setFilterStatus,
        setSortBy,
        refresh,
    };
};

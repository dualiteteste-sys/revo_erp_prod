import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import * as centrosDeCustoService from '../services/centrosDeCusto';
import { useAuth } from '../contexts/AuthProvider';

export const useCentrosDeCusto = () => {
    const { activeEmpresa } = useAuth();
    const [centros, setCentros] = useState<centrosDeCustoService.CentroDeCustoListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [count, setCount] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const [filterStatus, setFilterStatus] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(15);

    const [sortBy, setSortBy] = useState<{ column: string; ascending: boolean }>({
        column: 'nome',
        ascending: true,
    });

    const fetchCentros = useCallback(async () => {
        if (!activeEmpresa) {
            setCentros([]);
            setCount(0);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, count } = await centrosDeCustoService.listCentrosDeCusto({
                page,
                pageSize,
                searchTerm: debouncedSearchTerm,
                status: filterStatus,
                sortBy,
            });
            setCentros(data);
            setCount(count);
        } catch (e: any) {
            setError(e.message);
            setCentros([]);
            setCount(0);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, debouncedSearchTerm, filterStatus, sortBy, activeEmpresa]);

    useEffect(() => {
        fetchCentros();
    }, [fetchCentros]);

    const refresh = () => {
        fetchCentros();
    };

    return {
        centros,
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

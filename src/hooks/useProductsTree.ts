import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthProvider';
import { useDebounce } from '@/hooks/useDebounce';
import { getProductParents, listVariantsForParent, ProductParentRow, ProductVariantRow } from '@/services/productsTree';

export type ProductsTreeRow =
  | ({ rowType: 'parent'; level: 0 } & ProductParentRow)
  | ({ rowType: 'variant'; level: 1; parent_id: string } & ProductVariantRow);

export const PRODUCTS_TREE_KEYS = {
  all: ['productsTree'] as const,
  parents: (filters: any) => [...PRODUCTS_TREE_KEYS.all, 'parents', filters] as const,
  variants: (parentId: string, empresaId?: string | null) =>
    [...PRODUCTS_TREE_KEYS.all, 'variants', empresaId ?? 'no-empresa', parentId] as const,
};

export function useProductsTree() {
  const { activeEmpresa } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [filterStatus, setFilterStatus] = useState<'ativo' | 'inativo' | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<{ column: 'nome' | 'created_at'; ascending: boolean }>({
    column: 'nome',
    ascending: true,
  });

  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(new Set());
  const [highlightedChildIds, setHighlightedChildIds] = useState<Set<string>>(new Set());

  const queryOptions = useMemo(
    () => ({
      page,
      pageSize,
      searchTerm: debouncedSearchTerm,
      status: filterStatus,
      sortBy,
    }),
    [page, pageSize, debouncedSearchTerm, filterStatus, sortBy]
  );

  const parentsQuery = useQuery({
    queryKey: PRODUCTS_TREE_KEYS.parents({ ...queryOptions, empresaId: activeEmpresa?.id }),
    queryFn: () => getProductParents(queryOptions),
    placeholderData: keepPreviousData,
    enabled: !!activeEmpresa,
  });

  // Estado da arte: quando buscar por termo, expandir automaticamente (página atual) para revelar variações.
  useEffect(() => {
    const term = debouncedSearchTerm?.trim();
    const parents = parentsQuery.data?.data ?? [];

    if (!term) {
      setExpandedParentIds(new Set());
      return;
    }

    const next = new Set<string>();
    for (const p of parents) {
      if ((p.children_count ?? 0) > 0) next.add(p.id);
    }
    setExpandedParentIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, parentsQuery.data?.data?.map((p) => p.id).join('|')]);

  const toggleParentExpanded = (parentId: string) => {
    setExpandedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const expandedIds = useMemo(() => Array.from(expandedParentIds), [expandedParentIds]);

  const variantsQueries = useQueries({
    queries: expandedIds.map((parentId) => ({
      queryKey: PRODUCTS_TREE_KEYS.variants(parentId, activeEmpresa?.id),
      queryFn: () => listVariantsForParent(parentId),
      enabled: !!activeEmpresa && expandedParentIds.has(parentId),
      staleTime: 30_000,
    })),
  });

  const variantsSnapshotKey = useMemo(() => {
    const idsKey = expandedIds.join('|');
    const dataKey = variantsQueries.map((q) => q.dataUpdatedAt ?? 0).join('|');
    return `${idsKey}::${dataKey}`;
  }, [expandedIds, variantsQueries]);

  const variantsByParentId = useMemo(() => {
    const map = new Map<string, ProductVariantRow[]>();
    for (let i = 0; i < expandedIds.length; i++) {
      const parentId = expandedIds[i];
      const q = variantsQueries[i];
      if (q?.data) map.set(parentId, q.data);
    }
    return map;
    // NOTE: variantsQueries is referentially unstable; use a stable snapshot key to avoid render loops.
  }, [expandedIds, variantsSnapshotKey]);

  // Quando buscar por uma variação, realçar o(s) filho(s) por um curto período.
  const highlightMatchesKey = useMemo(() => {
    const term = debouncedSearchTerm?.trim().toLowerCase() ?? '';
    if (!term) return '';

    const matches: string[] = [];
    for (const variants of variantsByParentId.values()) {
      for (const v of variants) {
        const nome = (v.nome ?? '').toLowerCase();
        const sku = (v.sku ?? '').toLowerCase();
        if (nome.includes(term) || sku.includes(term)) matches.push(v.id);
      }
    }
    matches.sort();
    return matches.join('|');
  }, [debouncedSearchTerm, variantsByParentId]);

  // Quando buscar por uma variação, realçar o(s) filho(s) por um curto período.
  useEffect(() => {
    const term = debouncedSearchTerm?.trim().toLowerCase() ?? '';
    if (!term) {
      setHighlightedChildIds(new Set());
      return;
    }
    if (!highlightMatchesKey) return;

    const matches = new Set(highlightMatchesKey.split('|'));
    setHighlightedChildIds(matches);
    const t = window.setTimeout(() => setHighlightedChildIds(new Set()), 2000);
    return () => window.clearTimeout(t);
  }, [debouncedSearchTerm, highlightMatchesKey]);

  const flatRows: ProductsTreeRow[] = useMemo(() => {
    const parents = parentsQuery.data?.data ?? [];
    const rows: ProductsTreeRow[] = [];
    for (const p of parents) {
      rows.push({ ...(p as any), rowType: 'parent', level: 0 });

      if (!expandedParentIds.has(p.id)) continue;

      const children = variantsByParentId.get(p.id) ?? [];
      for (const c of children) {
        rows.push({ ...(c as any), rowType: 'variant', level: 1, parent_id: p.id });
      }
    }
    return rows;
  }, [parentsQuery.data?.data, expandedParentIds, variantsByParentId, debouncedSearchTerm]);

  return {
    rows: flatRows,
    parents: parentsQuery.data?.data ?? [],
    loading: parentsQuery.isLoading,
    error: parentsQuery.isError ? (parentsQuery.error as Error).message : null,
    count: parentsQuery.data?.count ?? 0,
    page,
    pageSize,
    searchTerm,
    filterStatus,
    sortBy,
    expandedParentIds,
    highlightedChildIds,
    setPage,
    setPageSize,
    setSearchTerm,
    setFilterStatus,
    setSortBy,
    toggleParentExpanded,
    searchHighlightTerm: debouncedSearchTerm,
  };
}

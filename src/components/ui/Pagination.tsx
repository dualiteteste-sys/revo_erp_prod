import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalCount?: number | null;
  pageSize: number;
  itemsOnPage?: number;
  hasNextPage?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalCount,
  pageSize,
  itemsOnPage,
  hasNextPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 50, 100, 200],
  className,
}) => {
  const safeTotalCount = typeof totalCount === 'number' && Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : null;
  const totalPageCount = safeTotalCount !== null ? Math.ceil(safeTotalCount / pageSize) : null;

  if (totalPageCount !== null && totalPageCount <= 1 && !onPageSizeChange) {
    return null;
  }

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (totalPageCount !== null) {
      if (currentPage < totalPageCount) onPageChange(currentPage + 1);
      return;
    }

    if (hasNextPage) onPageChange(currentPage + 1);
  };

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem =
    safeTotalCount !== null
      ? Math.min(currentPage * pageSize, safeTotalCount)
      : startItem + Math.max(0, (itemsOnPage ?? 0) - 1);

  const canPrevious = currentPage > 1;
  const canNext = totalPageCount !== null ? currentPage < totalPageCount : !!hasNextPage;
  const shouldShowNav = totalPageCount !== null ? totalPageCount > 1 : canPrevious || canNext;

  return (
    <div className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-600">
        <div>
          Mostrando <span className="font-medium">{startItem}</span> a <span className="font-medium">{endItem}</span>
          {safeTotalCount !== null ? (
            <>
              {' '}
              de <span className="font-medium">{safeTotalCount}</span> resultados
            </>
          ) : (
            <span className="ml-2 text-gray-400">(total indisponível)</span>
          )}
        </div>

        {onPageSizeChange ? (
          <label className="flex items-center gap-2">
            <span className="text-gray-500">Por página</span>
            <select
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {shouldShowNav ? (
        <div className="flex items-center gap-2">
        <button
          onClick={handlePrevious}
          disabled={!canPrevious}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm text-gray-700">
          Página <span className="font-medium">{currentPage}</span>
          {totalPageCount !== null ? (
            <>
              {' '}
              de <span className="font-medium">{totalPageCount}</span>
            </>
          ) : null}
        </span>
        <button
          onClick={handleNext}
          disabled={!canNext}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Próxima página"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        </div>
      ) : null}
    </div>
  );
};

export default Pagination;

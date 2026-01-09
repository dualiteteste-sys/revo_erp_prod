import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 50, 100, 200],
  className,
}) => {
  const totalPageCount = Math.ceil(totalCount / pageSize);

  if (totalPageCount <= 1 && !onPageSizeChange) {
    return null;
  }

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPageCount) {
      onPageChange(currentPage + 1);
    }
  };

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-600">
        <div>
          Mostrando <span className="font-medium">{startItem}</span> a <span className="font-medium">{endItem}</span> de{' '}
          <span className="font-medium">{totalCount}</span> resultados
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

      {totalPageCount > 1 ? (
        <div className="flex items-center gap-2">
        <button
          onClick={handlePrevious}
          disabled={currentPage === 1}
          className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm text-gray-700">
          Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPageCount}</span>
        </span>
        <button
          onClick={handleNext}
          disabled={currentPage === totalPageCount}
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

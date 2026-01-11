import React from 'react';
import { ArrowUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

export type SortState<Id extends string = string> = {
  column: Id;
  direction: SortDir;
} | null;

type Props<Id extends string> = {
  columnId: Id;
  label: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';

  sortable?: boolean;
  sort?: SortState<Id>;
  onSort?: (columnId: Id) => void;
  renderSortIndicator?: (ctx: { isSorted: boolean; direction: SortDir | null }) => React.ReactNode;

  resizable?: boolean;
  onResizeStart?: (columnId: Id, startX: number) => void;
};

export default function ResizableSortableTh<Id extends string>({
  columnId,
  label,
  className,
  align = 'left',
  sortable = true,
  sort,
  onSort,
  renderSortIndicator,
  resizable = true,
  onResizeStart,
}: Props<Id>) {
  const isSorted = !!sort && sort.column === columnId;
  const ariaSort = !sortable
    ? undefined
    : !isSorted
      ? 'none'
      : sort?.direction === 'asc'
        ? 'ascending'
        : 'descending';

  const justify =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      scope="col"
      aria-sort={ariaSort as any}
      className={[
        'relative px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider',
        sortable ? 'cursor-pointer hover:bg-gray-100' : '',
        className || '',
      ].join(' ')}
      onClick={() => {
        if (!sortable) return;
        onSort?.(columnId);
      }}
    >
      <div className={`flex items-center gap-2 ${justify}`}>
        <span className="truncate">{label}</span>
        {renderSortIndicator ? (
          renderSortIndicator({ isSorted, direction: isSorted ? sort?.direction ?? null : null })
        ) : isSorted ? (
          <ArrowUpDown size={14} className={`text-blue-500 ${sort?.direction === 'asc' ? '' : 'rotate-180'}`} />
        ) : null}
      </div>

      {resizable ? (
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize group"
          title="Arraste para ajustar a coluna"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart?.(columnId, e.clientX);
          }}
        >
          <div className="absolute right-0 top-0 h-full w-px bg-transparent group-hover:bg-blue-300" />
        </div>
      ) : null}
    </th>
  );
}

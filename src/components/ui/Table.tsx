import React, { forwardRef, HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table ref={ref} className={cn('w-full caption-bottom text-xs text-left', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn('bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800', className)}
      {...props}
    />
  )
);
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('divide-y divide-slate-100 dark:divide-slate-800/60', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn('bg-slate-50 dark:bg-slate-800/60 font-medium border-t border-slate-200 dark:border-slate-800', className)}
      {...props}
    />
  )
);
TableFooter.displayName = 'TableFooter';

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 data-[state=selected]:bg-slate-100 dark:data-[state=selected]:bg-slate-800',
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, children, sortable, sortDirection, onSort, ...props }, ref) => (
    <th
      ref={ref}
      onClick={sortable ? onSort : undefined}
      className={cn(
        'h-9 px-3.5 text-left align-middle font-semibold text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider select-none',
        sortable && 'cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 transition-colors',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        <span>{children}</span>
        {sortable && (
          <span className="text-slate-400 dark:text-slate-500">
            {sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            ) : sortDirection === 'desc' ? (
              <ArrowDown className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            ) : (
              <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
            )}
          </span>
        )}
      </div>
    </th>
  )
);
TableHead.displayName = 'TableHead';

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('p-3.5 align-middle text-slate-700 dark:text-slate-300 font-normal leading-normal', className)}
      {...props}
    />
  )
);
TableCell.displayName = 'TableCell';

export const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-3 text-xs text-slate-400 dark:text-slate-500', className)} {...props} />
  )
);
TableCaption.displayName = 'TableCaption';

/**
 * Table Loading Wrapper
 */
export const TableLoadingRow: React.FC<{ colSpan: number; message?: string }> = ({
  colSpan,
  message = 'Loading table records...',
}) => (
  <tr>
    <td colSpan={colSpan} className="py-12 text-center">
      <LoadingState message={message} size="md" />
    </td>
  </tr>
);

/**
 * Table Empty State Wrapper
 */
export const TableEmptyRow: React.FC<{
  colSpan: number;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ colSpan, title = 'No records found', description = 'There are no items matching this criteria.', action }) => (
  <tr>
    <td colSpan={colSpan} className="py-8">
      <EmptyState title={title} description={description} action={action} />
    </td>
  </tr>
);

/**
 * Table Pagination Foundation Skeleton
 */
export interface TablePaginationProps {
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  className,
}) => {
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 px-3.5 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 rounded-b-md',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span>
          Showing <span className="font-medium text-slate-700 dark:text-slate-300">{startItem}</span> to{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{endItem}</span> of{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{totalItems}</span> results
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1 ml-3">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange && onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex items-center justify-center h-7 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="ml-1 hidden sm:inline">Prev</span>
        </button>

        <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
          Page {currentPage} of {totalPages || 1}
        </span>

        <button
          onClick={() => onPageChange && onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center justify-center h-7 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
          aria-label="Next page"
        >
          <span className="mr-1 hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

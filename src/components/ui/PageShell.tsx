import React from 'react';
import { cn } from '@/lib/utils';

type PageShellProps = {
  header: React.ReactNode;
  summary?: React.ReactNode;
  filters?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  stickyFooter?: boolean;
};

export default function PageShell({
  header,
  summary,
  filters,
  children,
  footer,
  className,
  contentClassName,
  stickyFooter = true,
}: PageShellProps) {
  return (
    <div className={cn('p-1 min-h-full flex flex-col overflow-x-hidden max-w-full', className)}>
      <div className="mb-6 flex-shrink-0">{header}</div>
      {summary ? <div className="mb-6 flex-shrink-0">{summary}</div> : null}
      {filters ? <div className="mb-4 flex-shrink-0">{filters}</div> : null}
      <div className={cn('flex-grow min-h-0', footer && stickyFooter ? 'pb-20' : null, contentClassName)}>{children}</div>
      {footer ? (
        <div
          className={cn(
            'flex-shrink-0',
            stickyFooter ? 'sticky bottom-0 z-20 -mx-1 px-1 pt-3' : 'mt-4',
          )}
        >
          <div
            className={cn(
              stickyFooter
                ? 'border-t border-gray-100 bg-white/95 px-3 sm:px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80'
                : null,
            )}
          >
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}

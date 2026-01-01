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
};

export default function PageShell({
  header,
  summary,
  filters,
  children,
  footer,
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <div className={cn('p-1 h-full flex flex-col', className)}>
      <div className="mb-6 flex-shrink-0">{header}</div>
      {summary ? <div className="mb-6 flex-shrink-0">{summary}</div> : null}
      {filters ? <div className="mb-4 flex-shrink-0">{filters}</div> : null}
      <div className={cn('flex-grow min-h-0', contentClassName)}>{children}</div>
      {footer ? <div className="mt-4 flex-shrink-0">{footer}</div> : null}
    </div>
  );
}


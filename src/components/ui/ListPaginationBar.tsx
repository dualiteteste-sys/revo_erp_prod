import React from 'react';
import { cn } from '@/lib/utils';

type ListPaginationBarProps = {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  sticky?: boolean;
};

export default function ListPaginationBar({
  children,
  className,
  innerClassName,
  sticky = true,
}: ListPaginationBarProps) {
  return (
    <div className={cn('flex-shrink-0', sticky ? 'sticky bottom-0 z-20' : 'mt-4', className)}>
      <div
        className={cn(
          'border-t border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80',
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}


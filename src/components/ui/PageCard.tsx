import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type PageCardProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

const PageCard = forwardRef<HTMLDivElement, PageCardProps>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('bg-white rounded-lg shadow overflow-hidden border border-gray-100', className)}
      {...props}
    >
      {children}
    </div>
  );
});

PageCard.displayName = 'PageCard';

export default PageCard;


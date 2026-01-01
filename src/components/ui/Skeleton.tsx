import React from 'react';
import { cn } from '@/lib/utils';

export default function Skeleton(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('animate-pulse rounded-md bg-muted/60', props.className)}
    />
  );
}


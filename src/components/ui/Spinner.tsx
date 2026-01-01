import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Spinner(props: { className?: string; size?: number; label?: string }) {
  const size = props.size ?? 18;
  return (
    <span className={cn('inline-flex items-center gap-2', props.className)}>
      <Loader2 className="animate-spin" width={size} height={size} aria-hidden />
      {props.label ? <span className="text-sm text-muted-foreground">{props.label}</span> : null}
    </span>
  );
}


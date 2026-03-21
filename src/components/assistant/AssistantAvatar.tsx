import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AssistantAvatarState } from '@/lib/assistant/assistantTypes';

const AVATAR_PATHS: Record<AssistantAvatarState, string> = {
  neutral: '/assistant/isa-neutral.png',
  analyzing: '/assistant/isa-analyzing.png',
  explaining: '/assistant/isa-explaining.png',
  success: '/assistant/isa-success.png',
};

const FALLBACK_STYLES: Record<AssistantAvatarState, string> = {
  neutral: 'from-slate-100 via-amber-50 to-slate-100',
  analyzing: 'from-amber-100 via-white to-slate-100',
  explaining: 'from-sky-100 via-white to-blue-50',
  success: 'from-emerald-100 via-white to-teal-50',
};

type Props = {
  state?: AssistantAvatarState;
  size?: 'sm' | 'md' | 'lg';
};

const SIZE_CLASSES = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-14 w-14 text-base',
  lg: 'h-16 w-16 text-lg',
};

export default function AssistantAvatar({ state = 'neutral', size = 'md' }: Props) {
  const [hasError, setHasError] = useState(false);
  const src = useMemo(() => AVATAR_PATHS[state], [state]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/60 shadow-sm',
        SIZE_CLASSES[size],
      )}
      aria-hidden="true"
    >
      {!hasError ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center bg-gradient-to-br font-semibold text-slate-700',
            FALLBACK_STYLES[state],
          )}
        >
          Isa
        </div>
      )}
    </div>
  );
}

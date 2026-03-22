import React, { useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssistantAvatarState } from '@/lib/assistant/assistantTypes';

const AVATAR_PATHS: Record<AssistantAvatarState, string> = {
  neutral: '/assistant/isa-neutral.png',
  analyzing: '/assistant/isa-analyzing.png',
  explaining: '/assistant/isa-explaining.png',
  success: '/assistant/isa-success.png',
};

const FALLBACK_STYLES: Record<AssistantAvatarState, string> = {
  neutral: 'from-[#eef4ff] via-[#f9fbff] to-[#e8f0ff]',
  analyzing: 'from-[#fff3dd] via-[#fffaf2] to-[#f3f0ff]',
  explaining: 'from-[#e7f7ff] via-[#f8fdff] to-[#edf6ff]',
  success: 'from-[#e6f8ee] via-[#f5fff9] to-[#eafcf5]',
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
          alt="Avatar da Isa"
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <div
          className={cn(
            'relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br text-slate-700',
            FALLBACK_STYLES[state],
          )}
        >
          <div className="absolute inset-x-0 -bottom-4 h-12 rounded-full bg-white/70 blur-md" />
          <div className="relative flex h-[72%] w-[72%] items-center justify-center rounded-full border border-white/80 bg-white/85 shadow-sm">
            <UserRound className={cn(size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-6 w-6' : 'h-7 w-7')} />
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { MessageSquareText } from 'lucide-react';
import AssistantAvatar from '@/components/assistant/AssistantAvatar';
import { cn } from '@/lib/utils';
import { useAssistant } from '@/contexts/AssistantProvider';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AssistantLauncher() {
  const { open, context } = useAssistant();
  const isMobile = useIsMobile();

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'fixed z-40 flex items-center gap-3 border border-white/50 bg-white/90 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:bg-white',
        isMobile ? 'bottom-24 right-4 left-4 justify-between rounded-full px-3 py-3' : 'bottom-6 left-6 rounded-2xl px-2.5 py-2.5',
      )}
      aria-label="Abrir assistente Isa"
    >
      <div className="flex items-center gap-3">
        <AssistantAvatar state="neutral" size="sm" />
        {isMobile ? (
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-900">Isa</div>
            <div className="text-xs text-slate-600">{context.routeLabel}</div>
          </div>
        ) : null}
      </div>
      <span className={cn('inline-flex items-center gap-2 bg-slate-900 text-xs font-medium text-white', isMobile ? 'rounded-full px-3 py-2' : 'rounded-xl px-2.5 py-2')}>
        <MessageSquareText className="h-4 w-4" />
        {isMobile ? 'Abrir' : null}
      </span>
    </button>
  );
}

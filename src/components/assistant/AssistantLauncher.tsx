import React from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';
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
        'fixed z-40 flex items-center gap-3 border border-white/60 bg-gradient-to-br from-[#f9fcff]/95 via-white/95 to-[#edf4ff]/95 shadow-xl backdrop-blur transition hover:-translate-y-0.5',
        isMobile
          ? 'bottom-24 right-4 left-4 justify-between rounded-3xl px-3 py-3'
          : 'bottom-6 right-6 rounded-3xl px-3 py-3',
      )}
      aria-label="Abrir assistente Isa"
    >
      <div className="flex items-center gap-3">
        <AssistantAvatar state="neutral" size="sm" />
        <div className="text-left">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            Espaço Isa
          </div>
          <div className="text-xs text-slate-500">{context.routeLabel}</div>
        </div>
      </div>
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-gradient-to-br from-[#e9f2ff] to-[#dfeeff] px-3 py-2 text-xs font-semibold text-blue-700',
          isMobile ? '' : 'px-2.5',
        )}
      >
        <MessageSquareText className="h-4 w-4" />
        Abrir
      </span>
    </button>
  );
}

import React, { useCallback, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import SideSheet from '@/components/ui/SideSheet';
import AssistantHeader from '@/components/assistant/AssistantHeader';
import AssistantMessageList from '@/components/assistant/AssistantMessageList';
import AssistantComposer from '@/components/assistant/AssistantComposer';
import { useAssistant } from '@/contexts/AssistantProvider';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AssistantPanel() {
  const { isOpen, close, context, messages, submitMessage, isThinking, currentAvatarState, clearMessages } = useAssistant();
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on open and when messages change
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom();
    }
  }, [isOpen, messages.length, scrollToBottom]);

  return (
    <SideSheet
      isOpen={isOpen}
      onClose={close}
      title="Isa"
      description={`${context.routeLabel} • ${context.activeEmpresaNome ?? 'Empresa não definida'}`}
      widthClassName={isMobile ? 'w-full' : 'w-[min(520px,92vw)]'}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <AssistantHeader context={context} avatarState={currentAvatarState} />
          </div>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={clearMessages}
              className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/60 bg-white/70 text-slate-400 backdrop-blur-sm transition-all hover:border-red-200 hover:bg-red-50/80 hover:text-red-500"
              title="Limpar conversa"
              aria-label="Limpar conversa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AssistantMessageList messages={messages} onSuggestionClick={submitMessage} />
        </div>

        <AssistantComposer disabled={isThinking} onSubmit={submitMessage} />
      </div>
    </SideSheet>
  );
}

import React, { useCallback, useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
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
        <AssistantHeader context={context} avatarState={currentAvatarState} />

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AssistantMessageList messages={messages} onSuggestionClick={submitMessage} />
        </div>

        {messages.length > 1 && (
          <button
            type="button"
            onClick={clearMessages}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200/50 bg-white/60 px-3 py-2 text-xs font-medium text-slate-500 backdrop-blur-sm transition-all hover:border-slate-300 hover:bg-white/80 hover:text-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nova conversa
          </button>
        )}

        <AssistantComposer disabled={isThinking} onSubmit={submitMessage} />
      </div>
    </SideSheet>
  );
}

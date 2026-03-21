import React from 'react';
import SideSheet from '@/components/ui/SideSheet';
import AssistantHeader from '@/components/assistant/AssistantHeader';
import AssistantMessageList from '@/components/assistant/AssistantMessageList';
import AssistantComposer from '@/components/assistant/AssistantComposer';
import { useAssistant } from '@/contexts/AssistantProvider';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AssistantPanel() {
  const { isOpen, close, context, messages, submitMessage, isThinking, currentAvatarState } = useAssistant();
  const isMobile = useIsMobile();

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

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AssistantMessageList messages={messages} onSuggestionClick={submitMessage} />
        </div>

        <AssistantComposer disabled={isThinking} onSubmit={submitMessage} />
      </div>
    </SideSheet>
  );
}

import React from 'react';
import { Bot, User } from 'lucide-react';
import type { AssistantMessage } from '@/lib/assistant/assistantTypes';
import AssistantAvatar from '@/components/assistant/AssistantAvatar';
import { cn } from '@/lib/utils';

type Props = {
  messages: AssistantMessage[];
  onSuggestionClick: (suggestion: string) => void;
};

export default function AssistantMessageList({ messages, onSuggestionClick }: Props) {
  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const isAssistant = message.role === 'assistant';

        return (
          <div key={message.id} className={cn('flex gap-3', isAssistant ? 'items-start' : 'items-start justify-end')}>
            {isAssistant ? (
              <AssistantAvatar state={message.state ?? 'neutral'} size="sm" />
            ) : null}

            <div
              className={cn(
                'max-w-[88%] rounded-3xl px-4 py-3 shadow-sm',
                isAssistant
                  ? 'border border-slate-200 bg-white/95 text-slate-700'
                  : 'border border-blue-200 bg-gradient-to-br from-[#eaf3ff] to-[#dfeefe] text-blue-800',
              )}
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-70">
                {isAssistant ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                {isAssistant ? 'Isa' : 'Você'}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>

              {isAssistant && message.suggestions && message.suggestions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.suggestions.map((suggestion) => (
                    <button
                      key={`${message.id}-${suggestion}`}
                      type="button"
                      onClick={() => onSuggestionClick(suggestion)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import React from 'react';
import { Sparkles } from 'lucide-react';
import AssistantAvatar from '@/components/assistant/AssistantAvatar';
import { capabilityLevelLabel } from '@/components/assistant/assistantCapabilities';
import type { AssistantContext, AssistantAvatarState } from '@/lib/assistant/assistantTypes';

type Props = {
  context: AssistantContext;
  avatarState: AssistantAvatarState;
};

export default function AssistantHeader({ context, avatarState }: Props) {
  return (
    <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-[#f9fcff] via-[#f4f9ff] to-[#eef5ff] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AssistantAvatar state={avatarState} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span>Isa</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              Assistente ERP
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {context.routeLabel} • {capabilityLevelLabel(context.capabilityLevel)}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">{context.scopeText}</p>
        </div>
      </div>
    </div>
  );
}

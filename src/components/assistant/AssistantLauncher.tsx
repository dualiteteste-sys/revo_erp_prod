import React from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';
import AssistantAvatar from '@/components/assistant/AssistantAvatar';
import { cn } from '@/lib/utils';
import { useAssistant } from '@/contexts/AssistantProvider';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AssistantLauncher() {
  const { open, context } = useAssistant();
  const isMobile = useIsMobile();
  const [isBlockedByModal, setIsBlockedByModal] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const syncBlockedState = () => {
      const hasAriaModal = document.querySelector('[aria-modal="true"]');
      const hasOpenDialog = document.querySelector('[data-radix-portal] [role="dialog"][data-state="open"]');
      setIsBlockedByModal(Boolean(hasAriaModal || hasOpenDialog));
    };

    syncBlockedState();

    const observer = new MutationObserver(syncBlockedState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'data-state', 'role', 'class'],
    });

    window.addEventListener('resize', syncBlockedState);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncBlockedState);
    };
  }, []);

  if (isBlockedByModal) return null;

  return (
    <button
      type="button"
      onClick={open}
      title="Espaço Isa"
      className={cn(
        'fixed z-40 flex items-center border border-white/60 bg-gradient-to-br from-[#f9fcff]/95 via-white/95 to-[#edf4ff]/95 shadow-xl backdrop-blur transition hover:-translate-y-0.5',
        isMobile
          ? 'bottom-24 right-4 left-4 justify-between gap-3 rounded-3xl px-3 py-3'
          : 'bottom-6 left-6 h-[140px] w-[140px] justify-center rounded-full p-0',
      )}
      aria-label="Abrir assistente Isa"
    >
      {isMobile ? (
        <>
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
          <span className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-gradient-to-br from-[#e9f2ff] to-[#dfeeff] px-3 py-2 text-xs font-semibold text-blue-700">
            <MessageSquareText className="h-4 w-4" />
            Abrir
          </span>
        </>
      ) : (
        <span className="relative inline-flex">
          <AssistantAvatar state="neutral" size="lg" />
          <span className="absolute -right-3 -top-3 rounded-full border border-blue-200 bg-white p-2">
            <Sparkles className="h-6 w-6 text-blue-500" />
          </span>
        </span>
      )}
    </button>
  );
}

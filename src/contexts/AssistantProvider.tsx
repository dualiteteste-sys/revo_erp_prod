import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import { useAppContext } from '@/contexts/AppContextProvider';
import { buildAssistantContext } from '@/lib/assistant/assistantContext';
import { createAssistantWelcomeMessage, generateAssistantReply } from '@/lib/assistant/assistantEngine';
import type { AssistantAvatarState, AssistantContext, AssistantMessage } from '@/lib/assistant/assistantTypes';

type AssistantContextValue = {
  isOpen: boolean;
  isThinking: boolean;
  context: AssistantContext;
  messages: AssistantMessage[];
  currentAvatarState: AssistantAvatarState;
  open: () => void;
  close: () => void;
  submitMessage: (value: string) => Promise<void>;
  clearMessages: () => void;
};

const AssistantContextReact = createContext<AssistantContextValue | undefined>(undefined);

const STORAGE_OPEN_KEY = 'isa:open';

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { activeEmpresa } = useAuth();
  const { isAdminLike } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const lastSeedSignatureRef = useRef<string>('');

  useEffect(() => {
    try {
      setIsOpen(localStorage.getItem(STORAGE_OPEN_KEY) === 'true');
    } catch {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_OPEN_KEY, String(isOpen));
    } catch {
      // ignore
    }
  }, [isOpen]);

  const context = useMemo(
    () =>
      buildAssistantContext({
        pathname: location.pathname,
        activeEmpresaId: activeEmpresa?.id ?? null,
        activeEmpresaNome: activeEmpresa?.nome_fantasia ?? activeEmpresa?.nome_razao_social ?? null,
        isAdminLike,
      }),
    [activeEmpresa?.id, activeEmpresa?.nome_fantasia, activeEmpresa?.nome_razao_social, isAdminLike, location.pathname],
  );

  useEffect(() => {
    const signature = `${context.pathname}:${context.activeEmpresaId ?? 'sem-empresa'}`;
    if (lastSeedSignatureRef.current === signature) return;
    lastSeedSignatureRef.current = signature;

    setMessages((current) => {
      if (current.length === 0) {
        return [createAssistantWelcomeMessage(context)];
      }

      return [
        ...current,
        {
          ...createAssistantWelcomeMessage(context),
          content: `Contexto atualizado para ${context.routeLabel}. ${context.scopeText}`,
          suggestions: context.suggestedPrompts.slice(0, 2),
        },
      ];
    });
  }, [context]);

  const currentAvatarState = useMemo<AssistantAvatarState>(() => {
    if (isThinking) return 'analyzing';
    return messages[messages.length - 1]?.state ?? 'neutral';
  }, [isThinking, messages]);

  const submitMessage = async (value: string) => {
    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      content: value,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setIsThinking(true);

    try {
      const reply = await generateAssistantReply({ message: value, context });
      setMessages((current) => [...current, reply]);
    } finally {
      setIsThinking(false);
    }
  };

  const clearMessages = useCallback(() => {
    setMessages([createAssistantWelcomeMessage(context)]);
  }, [context]);

  const value = useMemo<AssistantContextValue>(
    () => ({
      isOpen,
      isThinking,
      context,
      messages,
      currentAvatarState,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      submitMessage,
      clearMessages,
    }),
    [clearMessages, context, currentAvatarState, isOpen, isThinking, messages],
  );

  return <AssistantContextReact.Provider value={value}>{children}</AssistantContextReact.Provider>;
}

export function useAssistant() {
  const context = useContext(AssistantContextReact);
  if (!context) {
    throw new Error('useAssistant must be used within AssistantProvider');
  }
  return context;
}

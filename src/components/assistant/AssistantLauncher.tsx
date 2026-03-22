import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquareText, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AssistantAvatar from '@/components/assistant/AssistantAvatar';
import { cn } from '@/lib/utils';
import { useAssistant } from '@/contexts/AssistantProvider';
import { useIsMobile } from '@/hooks/useIsMobile';

const STORAGE_KEY_POS = 'isa:launcher-pos';
const STORAGE_KEY_HIDDEN = 'isa:launcher-hidden';
const LAUNCHER_SIZE = 98; // 70% of 140px

type Position = { x: number; y: number };

function clampPosition(pos: Position): Position {
  if (typeof window === 'undefined') return pos;
  return {
    x: Math.max(0, Math.min(pos.x, window.innerWidth - LAUNCHER_SIZE)),
    y: Math.max(0, Math.min(pos.y, window.innerHeight - LAUNCHER_SIZE)),
  };
}

function loadPosition(): Position | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return clampPosition(parsed);
  } catch {
    return null;
  }
}

function savePosition(pos: Position) {
  try { localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos)); } catch { /* noop */ }
}

export default function AssistantLauncher() {
  const { open, context } = useAssistant();
  const isMobile = useIsMobile();
  const [isBlockedByModal, setIsBlockedByModal] = useState(false);
  const [isHidden, setIsHidden] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_HIDDEN) === 'true'; } catch { return false; }
  });
  const [showPill, setShowPill] = useState(false);

  // Draggable state (desktop only)
  const [position, setPosition] = useState<Position | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);
  const dragMoved = useRef(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Load saved position on mount
  useEffect(() => {
    if (isMobile) return;
    const saved = loadPosition();
    if (saved) {
      setPosition(saved);
    }
  }, [isMobile]);

  // Clamp on resize
  useEffect(() => {
    if (isMobile) return;
    const onResize = () => {
      setPosition((prev) => (prev ? clampPosition(prev) : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMobile]);

  // Modal blocking detection
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const syncBlockedState = () => {
      const hasAriaModal = document.querySelector('[aria-modal="true"]');
      const hasOpenDialog = document.querySelector('[data-radix-portal] [role="dialog"][data-state="open"]');
      setIsBlockedByModal(Boolean(hasAriaModal || hasOpenDialog));
    };
    syncBlockedState();
    const observer = new MutationObserver(syncBlockedState);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['aria-modal', 'data-state', 'role', 'class'],
    });
    window.addEventListener('resize', syncBlockedState);
    return () => { observer.disconnect(); window.removeEventListener('resize', syncBlockedState); };
  }, []);

  // Drag handlers (desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    const rect = launcherRef.current?.getBoundingClientRect();
    if (!rect) return;
    isDragging.current = true;
    dragMoved.current = false;
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: rect.left,
      posY: rect.top,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !dragStart.current) return;
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
      const newPos = clampPosition({
        x: dragStart.current.posX + dx,
        y: dragStart.current.posY + dy,
      });
      setPosition(newPos);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      if (dragMoved.current) {
        setPosition((p) => {
          if (p) savePosition(p);
          return p;
        });
      }
      dragStart.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [isMobile]);

  const handleClick = useCallback(() => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    open();
  }, [open]);

  const handleHide = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsHidden(true);
    try { localStorage.setItem(STORAGE_KEY_HIDDEN, 'true'); } catch { /* noop */ }
    setShowPill(true);
  }, []);

  const handleShow = useCallback(() => {
    setIsHidden(false);
    setShowPill(false);
    try { localStorage.removeItem(STORAGE_KEY_HIDDEN); } catch { /* noop */ }
  }, []);

  // Show re-appear pill after 2s delay so it doesn't flash
  useEffect(() => {
    if (!isHidden) return;
    const timer = setTimeout(() => setShowPill(true), 400);
    return () => clearTimeout(timer);
  }, [isHidden]);

  if (isBlockedByModal) return null;

  // Minimized pill — appears when Isa is hidden
  if (isHidden) {
    return (
      <AnimatePresence>
        {showPill && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            type="button"
            onClick={handleShow}
            className="fixed z-40 bottom-4 left-4 flex items-center gap-2 rounded-full border border-blue-200/60 bg-white/90 backdrop-blur-sm px-3 py-2 text-xs font-medium text-blue-700 shadow-lg hover:shadow-xl transition-all hover:bg-blue-50"
            title="Mostrar Isa"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Isa
          </motion.button>
        )}
      </AnimatePresence>
    );
  }

  // Mobile: full-width bar
  if (isMobile) {
    return (
      <button
        type="button"
        onClick={open}
        title="Espaço Isa"
        className="fixed z-40 bottom-24 right-4 left-4 flex items-center justify-between gap-3 rounded-3xl border border-white/60 bg-gradient-to-br from-[#f9fcff]/95 via-white/95 to-[#edf4ff]/95 px-3 py-3 shadow-xl backdrop-blur transition hover:-translate-y-0.5"
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
        <span className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-gradient-to-br from-[#e9f2ff] to-[#dfeeff] px-3 py-2 text-xs font-semibold text-blue-700">
          <MessageSquareText className="h-4 w-4" />
          Abrir
        </span>
      </button>
    );
  }

  // Desktop: draggable circular launcher (98px = 70% of 140px)
  const posStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y, bottom: 'auto', right: 'auto' }
    : { left: 24, bottom: 24 };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className="fixed z-40 group"
      style={posStyle}
    >
      {/* Main launcher area */}
      <div
        ref={launcherRef as React.RefObject<HTMLDivElement>}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        className={cn(
          'flex items-center justify-center rounded-full border border-white/60 bg-gradient-to-br from-[#f9fcff]/95 via-white/95 to-[#edf4ff]/95 shadow-xl backdrop-blur transition-shadow select-none',
          'h-[98px] w-[98px] p-0',
          isDragging.current ? 'cursor-grabbing shadow-2xl' : 'cursor-pointer hover:shadow-2xl',
        )}
        aria-label="Abrir assistente Isa"
        title="Arraste para mover · Clique para abrir"
      >
        <span className="relative inline-flex">
          <AssistantAvatar state="neutral" size="md" />
          <span className="absolute -right-2 -top-2 rounded-full border border-blue-200 bg-white p-1.5 shadow-sm">
            <Sparkles className="h-4 w-4 text-blue-500" />
          </span>
        </span>
      </div>

      {/* Close/hide button — outside the main interactive area */}
      <button
        type="button"
        onClick={handleHide}
        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm opacity-0 group-hover:opacity-100 hover:text-red-500 hover:border-red-200 transition-all"
        title="Ocultar Isa"
        aria-label="Ocultar Isa"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

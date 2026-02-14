import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { FloatingErrorsModal } from "@/components/ops/FloatingErrorsModal";

type OpsOverlayContextValue = {
  openFloatingErrors: () => void;
  closeFloatingErrors: () => void;
  isFloatingErrorsOpen: boolean;
};

const OpsOverlayContext = createContext<OpsOverlayContextValue | null>(null);

const HOTKEY_DEBOUNCE_MS = 200;

export function getKeyboardPlatform(): "mac" | "other" {
  if (typeof window === "undefined") return "other";
  const nav = window.navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac/i.test(platform) ? "mac" : "other";
}

export function isFloatingErrorsHotkey(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  platform: "mac" | "other",
) {
  const key = (event.key || "").toLowerCase();
  const code = event.code || "";
  const isE = key === "e" || code === "KeyE";
  if (!isE) return false;
  if (!event.shiftKey) return false;
  if (event.altKey) return false;

  if (platform === "mac") {
    return Boolean(event.metaKey || event.ctrlKey);
  }

  return Boolean(event.ctrlKey || event.metaKey);
}

export function isDebounced(lastTriggeredAt: number, now: number, debounceMs = HOTKEY_DEBOUNCE_MS) {
  return now - lastTriggeredAt < debounceMs;
}

type Props = {
  children: React.ReactNode;
};

export function OpsOverlayProvider({ children }: Props) {
  const [open, setOpen] = useState(false);
  const platformRef = useRef<"mac" | "other">("other");
  const lastTriggeredAtRef = useRef(0);

  useEffect(() => {
    platformRef.current = getKeyboardPlatform();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isFloatingErrorsHotkey(event, platformRef.current)) return;

      const now = Date.now();
      if (isDebounced(lastTriggeredAtRef.current, now)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      lastTriggeredAtRef.current = now;
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const value = useMemo<OpsOverlayContextValue>(
    () => ({
      openFloatingErrors: () => setOpen(true),
      closeFloatingErrors: () => setOpen(false),
      isFloatingErrorsOpen: open,
    }),
    [open],
  );

  return (
    <OpsOverlayContext.Provider value={value}>
      {children}
      <FloatingErrorsModal open={open} onClose={() => setOpen(false)} />
    </OpsOverlayContext.Provider>
  );
}

export function useOpsOverlay() {
  const context = useContext(OpsOverlayContext);
  if (!context) throw new Error("useOpsOverlay must be used within OpsOverlayProvider");
  return context;
}

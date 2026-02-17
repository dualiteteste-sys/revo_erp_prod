import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Eraser, ExternalLink, Pause, Play, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastProvider";
import { clearConsoleRedEvents, getConsoleRedEventsSnapshot, type ConsoleRedEvent } from "@/lib/telemetry/consoleRedBuffer";
import { buildIncidentPrompt, getErrorIncidentsSnapshot } from "@/lib/telemetry/errorBus";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Pos = { x: number; y: number };
type Size = { w: number; h: number };

type Viewport = { w: number; h: number };

const POS_STORAGE_KEY = "revo_errors_floating_modal_pos";
const SIZE_STORAGE_KEY = "revo_errors_floating_modal_size";
const MODAL_MIN_W = 640;
const MODAL_MIN_H = 420;
const MODAL_GAP = 8;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function clampModalPosition(next: Pos, viewport: Viewport, size: Size): Pos {
  const maxX = Math.max(MODAL_GAP, viewport.w - size.w - MODAL_GAP);
  const maxY = Math.max(MODAL_GAP, viewport.h - size.h - MODAL_GAP);
  return {
    x: clamp(next.x, MODAL_GAP, maxX),
    y: clamp(next.y, MODAL_GAP, maxY),
  };
}

function readPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const x = typeof parsed?.x === "number" ? parsed.x : null;
    const y = typeof parsed?.y === "number" ? parsed.y : null;
    if (x == null || y == null) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function writePos(pos: Pos) {
  try {
    localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // noop
  }
}

function normalizeSize(input: Size, viewport: Viewport): Size {
  return {
    w: clamp(input.w, MODAL_MIN_W, Math.max(MODAL_MIN_W, viewport.w - MODAL_GAP * 2)),
    h: clamp(input.h, MODAL_MIN_H, Math.max(MODAL_MIN_H, viewport.h - MODAL_GAP * 2)),
  };
}

function readSize(viewport: Viewport): Size | null {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const w = typeof parsed?.w === "number" ? parsed.w : null;
    const h = typeof parsed?.h === "number" ? parsed.h : null;
    if (w == null || h == null) return null;
    return normalizeSize({ w, h }, viewport);
  } catch {
    return null;
  }
}

function writeSize(size: Size) {
  try {
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // noop
  }
}

function formatDateTimeBR(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

export function shouldStartModalDrag(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  return !target.closest("button, a, input, select, textarea, [role='button'], [data-no-modal-drag]");
}

function useConsoleErrors(paused: boolean) {
  const [events, setEvents] = useState<ConsoleRedEvent[]>(() => getConsoleRedEventsSnapshot());

  useEffect(() => {
    if (paused) return;
    const onConsoleRed = () => setEvents(getConsoleRedEventsSnapshot());
    window.addEventListener("revo:console_red_event", onConsoleRed as EventListener);
    return () => window.removeEventListener("revo:console_red_event", onConsoleRed as EventListener);
  }, [paused]);

  useEffect(() => {
    if (!paused) return;
    setEvents(getConsoleRedEventsSnapshot());
  }, [paused]);

  return {
    events,
    refresh: () => setEvents(getConsoleRedEventsSnapshot()),
  };
}

export function FloatingErrorsModal({ open, onClose }: Props) {
  const { addToast } = useToast();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [level, setLevel] = useState<"all" | "error" | "warn">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { events, refresh } = useConsoleErrors(paused);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return events.filter((event) => {
      if (level !== "all" && event.level !== level) return false;
      if (!q) return true;
      const haystack = `${event.message}\n${event.source}\n${event.route_base ?? ""}\n${event.fingerprint}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [events, filter, level]);

  const selected = useMemo(() => filtered.find((event) => event.id === selectedId) ?? null, [filtered, selectedId]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    raf: number | null;
    nextPos: Pos | null;
  } | null>(null);

  const [pos, setPos] = useState<Pos>(() => readPos() ?? { x: 24, y: 24 });
  const [size, setSize] = useState<Size>(() => {
    if (typeof window === "undefined") return { w: 960, h: 620 };
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    // Default: ~30% do viewport (mas respeita mínimos para manter usabilidade).
    const defaultSize = normalizeSize({ w: Math.round(viewport.w * 0.3), h: Math.round(viewport.h * 0.6) }, viewport);
    return readSize(viewport) ?? defaultSize;
  });

  useEffect(() => {
    if (!open) return;
    const input = document.getElementById("floating-errors-filter") as HTMLInputElement | null;
    input?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const normalized = normalizeSize({ w, h }, viewport);
    setSize(normalized);
    setPos((current) => clampModalPosition(current, viewport, normalized));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      setSize((current) => {
        const next = normalizeSize(current, viewport);
        setPos((pos) => clampModalPosition(pos, viewport, next));
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const element = containerRef.current;
    if (!element || typeof window === "undefined" || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      // Use client sizes (inteiros e estáveis). contentRect pode variar 1px e causar "shrinking" em loop.
      const w = element.clientWidth;
      const h = element.clientHeight;
      const nextSize = normalizeSize({ w, h }, viewport);
      setSize((current) => (current.w === nextSize.w && current.h === nextSize.h ? current : nextSize));
      setPos((current) => clampModalPosition(current, viewport, nextSize));
      writeSize(nextSize);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  const applyClamped = (nextPos: Pos) => {
    setPos(clampModalPosition(nextPos, { w: window.innerWidth, h: window.innerHeight }, size));
  };

  const onPointerDownHeader = (event: React.PointerEvent) => {
    if (!open) return;
    if (event.button !== 0) return;
    if (!shouldStartModalDrag(event.target)) return;
    const element = containerRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      raf: null,
      nextPos: null,
    };

    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerMoveHeader = (event: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    drag.nextPos = {
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    };

    if (drag.raf != null) return;
    drag.raf = window.requestAnimationFrame(() => {
      const latest = dragStateRef.current;
      if (!latest?.nextPos) return;
      applyClamped(latest.nextPos);
      latest.raf = null;
    });
  };

  const endDrag = (event: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    writePos(pos);
  };

  const handleClear = () => {
    clearConsoleRedEvents();
    setSelectedId(null);
    setFilter("");
    refresh();
  };

  const handleCopy = async () => {
    if (!selected) return;
    const incident = getErrorIncidentsSnapshot().find((item) => item.fingerprint === selected.fingerprint);
    if (incident) {
      await navigator.clipboard.writeText(buildIncidentPrompt(incident));
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
  };

  const handleSendToDev = async () => {
    if (!selected) return;
    const incident = getErrorIncidentsSnapshot().find((item) => item.fingerprint === selected.fingerprint);
    const prompt = incident ? buildIncidentPrompt(incident) : JSON.stringify(selected, null, 2);
    await navigator.clipboard.writeText(prompt);
    addToast("Prompt copiado. Cole no chat do agente para análise.", "success");
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        minWidth: MODAL_MIN_W,
        minHeight: MODAL_MIN_H,
        maxWidth: `calc(100vw - ${MODAL_GAP * 2}px)`,
        maxHeight: `calc(100vh - ${MODAL_GAP * 2}px)`,
        resize: "both",
        zIndex: 2147483647,
        pointerEvents: "auto",
      }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      aria-label="Erros (Realtime)"
      role="dialog"
      aria-modal="false"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div
          className="flex cursor-grab select-none items-center gap-2 active:cursor-grabbing"
          onPointerDown={onPointerDownHeader}
          onPointerMove={onPointerMoveHeader}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="text-sm font-semibold text-slate-800">Erros (Realtime)</div>
          <div className="text-xs text-slate-500">{filtered.length} item(ns)</div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setPaused((current) => !current)}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "Retomar" : "Pausar"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleClear}>
            <Eraser size={14} />
            Limpar
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open("/app/desenvolvedor/erros", "_blank", "noopener,noreferrer")}>
            <ExternalLink size={14} />
            Página
          </Button>
          <Button variant="outline" size="sm" className="gap-2" disabled={!selected} onClick={handleSendToDev}>
            <Send size={14} />
            Enviar p/ Dev
          </Button>
          <Button size="sm" className="gap-2" onClick={onClose}>
            <X size={14} />
            Fechar
          </Button>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            id="floating-errors-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtrar... (mensagem, rota, fingerprint)"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as "all" | "error" | "warn")}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">Todos</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
          </select>
          <Button variant="secondary" size="sm" className="gap-2" disabled={!selected} onClick={handleCopy}>
            <Copy size={14} />
            Copiar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ height: size.h - 104 }}>
        <div className="overflow-auto border-r border-slate-200">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Nenhum erro no buffer.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((event) => (
                <li
                  key={event.id}
                  className={`cursor-pointer p-3 hover:bg-slate-50 ${selectedId === event.id ? "bg-slate-100" : ""}`}
                  onClick={() => setSelectedId(event.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs text-slate-600">{formatDateTimeBR(event.at)}</div>
                    <div className="text-[11px] text-slate-500">{event.level}</div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-900">{event.message}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {event.triage.category} - {event.triage.reason}
                  </div>
                  {event.action ? (
                    <div className="mt-1 line-clamp-1 font-mono text-[11px] text-slate-500">{event.action}</div>
                  ) : null}
                  <div className="mt-1 line-clamp-1 font-mono text-[11px] text-slate-500">{event.route_base ?? "-"}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-auto">
          {selected ? (
            <div className="space-y-2 p-3">
              <div className="text-xs text-slate-500">Detalhes</div>
              <div className="text-sm font-semibold text-slate-900">{selected.message}</div>
              <div className="text-xs text-slate-600">
                {selected.source} - {selected.level} - {selected.triage.category}
              </div>
              <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] text-slate-600">
                <div className="font-mono">request_id: {selected.request_id ?? "—"}</div>
                <div className="font-mono">correlation_id: {selected.correlation_id ?? "—"}</div>
                <div className="font-mono">http: {selected.http_status ?? "—"} | code: {selected.code ?? "—"}</div>
                <div className="font-mono">action: {selected.action ?? "—"}</div>
                {selected.request_meta ? <div className="font-mono">meta: {JSON.stringify(selected.request_meta)}</div> : null}
              </div>
              <div className="break-all font-mono text-xs text-slate-600">{selected.route_base ?? "-"}</div>
              <div className="break-all font-mono text-xs text-slate-500">{selected.fingerprint}</div>
              {selected.stack ? (
                <details className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">Stack</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-800">{selected.stack}</pre>
                </details>
              ) : null}
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Payload</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-800">{JSON.stringify(selected, null, 2)}</pre>
              </details>
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-500">Selecione um item para ver detalhes.</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

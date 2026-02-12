import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Eraser, ExternalLink, Pause, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearConsoleRedEvents, getConsoleRedEventsSnapshot, type ConsoleRedEvent } from "@/lib/telemetry/consoleRedBuffer";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Pos = { x: number; y: number };
type Size = { w: number; h: number };

type Viewport = { w: number; h: number };

const STORAGE_KEY = "revo_errors_floating_modal_pos";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function clampModalPosition(next: Pos, viewport: Viewport, size: Size): Pos {
  const maxX = Math.max(8, viewport.w - size.w - 8);
  const maxY = Math.max(8, viewport.h - size.h - 8);
  return {
    x: clamp(next.x, 8, maxX),
    y: clamp(next.y, 8, maxY),
  };
}

function readPos(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // noop
  }
}

function formatDateTimeBR(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
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
  const [size, setSize] = useState<Size>({ w: 560, h: 420 });

  useEffect(() => {
    if (!open) return;
    const input = document.getElementById("floating-errors-filter") as HTMLInputElement | null;
    input?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setSize({ w: rect.width, h: rect.height });
    setPos((current) => clampModalPosition(current, { w: window.innerWidth, h: window.innerHeight }, { w: rect.width, h: rect.height }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      setPos((current) => clampModalPosition(current, { w: window.innerWidth, h: window.innerHeight }, size));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, size]);

  const applyClamped = (nextPos: Pos) => {
    setPos(clampModalPosition(nextPos, { w: window.innerWidth, h: window.innerHeight }, size));
  };

  const onPointerDownHeader = (event: React.PointerEvent) => {
    if (!open) return;
    if (event.button !== 0) return;
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
    await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: 560,
        height: 420,
        zIndex: 2147483647,
        pointerEvents: "auto",
      }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      aria-label="Erros (Realtime)"
      role="dialog"
      aria-modal="false"
    >
      <div
        className="flex cursor-grab select-none items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDownHeader}
        onPointerMove={onPointerMoveHeader}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex items-center gap-2">
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

      <div className="grid h-[calc(420px-104px)] grid-cols-1 md:grid-cols-2">
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

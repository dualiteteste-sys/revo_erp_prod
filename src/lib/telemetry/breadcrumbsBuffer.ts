import { sanitizeLogData } from "@/lib/sanitizeLog";

export type BreadcrumbType = "nav" | "click" | "modal_open" | "modal_close" | "network";

export type BreadcrumbItem = {
  at: string;
  type: BreadcrumbType;
  message: string;
  data?: Record<string, unknown> | null;
};

const LIMIT = 50;
let buffer: BreadcrumbItem[] = [];

let lastKey: string | null = null;
let lastAtMs = 0;

function push(item: BreadcrumbItem) {
  buffer = [...buffer, item].slice(-LIMIT);
}

export function recordBreadcrumb(input: Omit<BreadcrumbItem, "at"> & { at?: string }) {
  try {
    const at = input.at ?? new Date().toISOString();
    const message = String(input.message ?? "").trim().slice(0, 180) || input.type;
    const dataRaw = input.data ?? null;
    const dataSanitized = dataRaw ? (sanitizeLogData(dataRaw) as Record<string, unknown>) : null;

    const key = `${input.type}::${message}`;
    const now = Date.now();
    if (key === lastKey && now - lastAtMs < 350) return; // anti-spam
    lastKey = key;
    lastAtMs = now;

    push({
      at,
      type: input.type,
      message,
      data: dataSanitized,
    });
  } catch {
    // best-effort
  }
}

export function getBreadcrumbsSnapshot(): BreadcrumbItem[] {
  return buffer.map((b) => ({ ...b, data: b.data ? { ...b.data } : b.data }));
}

export function clearBreadcrumbsForTest() {
  buffer = [];
  lastKey = null;
  lastAtMs = 0;
}


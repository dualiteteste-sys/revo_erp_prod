type ModalContextInput = {
  id?: string;
  kind?: string | null;
  name?: string | null;
  logicalRoute?: string | null;
  params?: Record<string, unknown> | null;
  baseRouteAtOpen?: string | null;
};

export type ModalContextEntry = {
  id: string;
  kind: string | null;
  name: string | null;
  logicalRoute: string | null;
  params: Record<string, unknown>;
  openedAt: string;
  baseRouteAtOpen: string | null;
};

const STACK_LIMIT = 10;
let stack: ModalContextEntry[] = [];

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `m_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }
}

function isSensitiveKey(key: string) {
  return /(token|secret|password|authorization|cookie|jwt|bearer|session|api[_-]?key|consumer[_-]?secret)/i.test(key);
}

function looksLikeSecretString(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("eyJ") && v.split(".").length >= 3) return true; // JWT
  if (/^sk_[a-z0-9]{16,}$/i.test(v)) return true;
  return v.length > 160 && /^[A-Za-z0-9+/=_-]+$/.test(v);
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) return "<redacted>";

  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;

  if (typeof value === "string") {
    if (looksLikeSecretString(value)) return "<redacted>";
    return value.replace(/\s+/g, " ").trim().slice(0, 120);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "boolean" || typeof v === "number") return v;
      if (typeof v === "string") return looksLikeSecretString(v) ? "<redacted>" : v.slice(0, 80);
      return "<complex>";
    });
  }

  // Never deep-serialize objects here (PII/size). Keep a hint only.
  return "<object>";
}

export function sanitizeModalParams(params: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const raw = params ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = sanitizeValue(key, value);
  }
  return out;
}

export function pushModalContext(input: ModalContextInput): string {
  const id = input.id ? String(input.id) : newId();
  const entry: ModalContextEntry = {
    id,
    kind: (input.kind ?? null) ? String(input.kind).slice(0, 40) : null,
    name: (input.name ?? null) ? String(input.name).slice(0, 140) : null,
    logicalRoute: (input.logicalRoute ?? null) ? String(input.logicalRoute).slice(0, 200) : null,
    params: sanitizeModalParams(input.params ?? null),
    openedAt: new Date().toISOString(),
    baseRouteAtOpen: (input.baseRouteAtOpen ?? null) ? String(input.baseRouteAtOpen).slice(0, 240) : null,
  };

  stack = [...stack, entry].slice(-STACK_LIMIT);
  return id;
}

export function updateModalContext(
  id: string,
  patch: Partial<Pick<ModalContextEntry, "kind" | "name" | "logicalRoute" | "params" | "baseRouteAtOpen">>,
) {
  stack = stack.map((e) => {
    if (e.id !== id) return e;
    return {
      ...e,
      kind: patch.kind !== undefined ? (patch.kind ? String(patch.kind).slice(0, 40) : null) : e.kind,
      name: patch.name !== undefined ? (patch.name ? String(patch.name).slice(0, 140) : null) : e.name,
      logicalRoute:
        patch.logicalRoute !== undefined ? (patch.logicalRoute ? String(patch.logicalRoute).slice(0, 200) : null) : e.logicalRoute,
      params: patch.params !== undefined ? sanitizeModalParams(patch.params) : e.params,
      baseRouteAtOpen:
        patch.baseRouteAtOpen !== undefined
          ? patch.baseRouteAtOpen
            ? String(patch.baseRouteAtOpen).slice(0, 240)
            : null
          : e.baseRouteAtOpen,
    };
  });
}

export function popModalContext(id: string) {
  stack = stack.filter((e) => e.id !== id);
}

export function getModalContextStackSnapshot(): ModalContextEntry[] {
  return stack.map((e) => ({ ...e, params: { ...e.params } }));
}

export function getModalActiveSnapshot(): ModalContextEntry | null {
  const arr = getModalContextStackSnapshot();
  return arr.length ? arr[arr.length - 1] : null;
}

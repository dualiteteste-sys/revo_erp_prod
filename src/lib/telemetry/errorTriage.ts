export type ErrorTriageCategory = "CLIENT" | "SYSTEM" | "UNKNOWN";

export type ErrorTriageResult = {
  category: ErrorTriageCategory;
  reason: string;
};

function matchAny(input: string, patterns: RegExp[]): RegExp | null {
  for (const p of patterns) {
    if (p.test(input)) return p;
  }
  return null;
}

const CLIENT_PATTERNS: Array<{ reason: string; patterns: RegExp[] }> = [
  {
    reason: "Bloqueado por extensão/cliente (ERR_BLOCKED_BY_CLIENT).",
    patterns: [/\bERR_BLOCKED_BY_CLIENT\b/i],
  },
  {
    reason: "Sem internet / desconectado (ERR_INTERNET_DISCONNECTED).",
    patterns: [/\bERR_INTERNET_DISCONNECTED\b/i],
  },
  {
    reason: "DNS / domínio não resolvido (ERR_NAME_NOT_RESOLVED).",
    patterns: [/\bERR_NAME_NOT_RESOLVED\b/i],
  },
  {
    reason: "Recursos insuficientes no dispositivo (ERR_INSUFFICIENT_RESOURCES / OOM).",
    patterns: [/\bERR_INSUFFICIENT_RESOURCES\b/i, /\bout of memory\b/i],
  },
  {
    reason: "Mensagem típica de extensão do navegador (listener async).",
    patterns: [/A listener indicated an asynchronous response/i],
  },
];

const SYSTEM_PATTERNS: Array<{ reason: string; patterns: RegExp[] }> = [
  {
    reason: "Erro de runtime JS (TypeError/ReferenceError/etc.).",
    patterns: [
      /\bTypeError:/i,
      /\bReferenceError:/i,
      /\bRangeError:/i,
      /\bSyntaxError:/i,
      /\bCannot read properties of undefined\b/i,
      /\bCannot read properties of null\b/i,
    ],
  },
  {
    reason: "Erro PostgREST/RPC (PGRST/23505/42501/etc.).",
    patterns: [
      /\bPGRST\d+\b/i,
      /\bSQLSTATE\b/i,
      /\b23505\b/i,
      /\b42501\b/i,
      /\bP0002\b/i,
      /\bP0001\b/i,
    ],
  },
  {
    reason: "Falha de API/RPC (4xx/5xx).",
    patterns: [/\bHTTP\s*(4\d{2}|5\d{2})\b/i],
  },
  {
    reason: "CORS bloqueando request (configuração/ambiente).",
    patterns: [/blocked by CORS policy/i],
  },
];

export function triageErrorLike(input: {
  message: string | null | undefined;
  stack?: string | null | undefined;
  http_status?: number | null | undefined;
  code?: string | null | undefined;
  url?: string | null | undefined;
  source?: string | null | undefined;
}): ErrorTriageResult {
  const msg = String(input.message ?? "");
  const stack = String(input.stack ?? "");
  const combined = `${msg}\n${stack}`.slice(0, 10_000);

  // Strong signals: explicit browser error codes.
  for (const group of CLIENT_PATTERNS) {
    if (matchAny(combined, group.patterns)) return { category: "CLIENT", reason: group.reason };
  }

  // Strong signals: application/runtime/back-end.
  for (const group of SYSTEM_PATTERNS) {
    if (matchAny(combined, group.patterns)) return { category: "SYSTEM", reason: group.reason };
  }

  // Heuristics from structured fields.
  if (typeof input.http_status === "number") {
    if (input.http_status >= 500) return { category: "SYSTEM", reason: "HTTP >= 500 (provável falha do sistema)." };
    if (input.http_status === 401 || input.http_status === 403) return { category: "SYSTEM", reason: "HTTP 401/403 (auth/RLS/permissão)." };
    if (input.http_status === 404) return { category: "SYSTEM", reason: "HTTP 404 (rota/RPC não encontrada ou drift de schema)." };
  }
  if (input.code && /\b(PGRST|23505|42501|P0{3}\d)\b/i.test(input.code)) {
    return { category: "SYSTEM", reason: `Código ${input.code} (provável falha do sistema).` };
  }

  if (/\bFailed to fetch\b/i.test(combined)) {
    return { category: "UNKNOWN", reason: "Failed to fetch (pode ser rede do cliente ou indisponibilidade do serviço)." };
  }

  return { category: "UNKNOWN", reason: "Sem evidência suficiente para classificar com segurança." };
}

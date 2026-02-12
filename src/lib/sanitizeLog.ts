type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

const MAX_STRING_LEN = 500;
const MAX_ARRAY_LEN = 50;
const MAX_DEPTH = 5;

const SENSITIVE_KEY_RE =
  /(^|_)(password|passwd|secret|token|access_token|refresh_token|id_token|authorization|api(_)?key|stripe(_)?signature|cookie|set-cookie)(_|$)/i;

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const STRIPE_KEY_RE = /\b([rs]k_(live|test)_[A-Za-z0-9]+)\b/;
const PHONE_RE = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/;
const CPF_CNPJ_RE = /\b\d{11}\b|\b\d{14}\b/;
const BEARER_RE = /\b(bearer)\s+[A-Za-z0-9._-]{10,}\b/i;
const SENSITIVE_PARAM_RE = /([?&](?:access_token|refresh_token|token|secret|password|apikey|api_key)=)[^&\s#]+/gi;

function truncate(s: string) {
  if (s.length <= MAX_STRING_LEN) return s;
  return `${s.slice(0, MAX_STRING_LEN)}…(len=${s.length})`;
}

function sanitizeString(raw: string) {
  let s = raw;
  if (JWT_RE.test(s)) return '[REDACTED_JWT]';
  if (STRIPE_KEY_RE.test(s)) s = s.replace(STRIPE_KEY_RE, '[REDACTED_STRIPE_KEY]');
  if (BEARER_RE.test(s)) s = s.replace(BEARER_RE, '$1 [REDACTED_BEARER]');
  if (SENSITIVE_PARAM_RE.test(s)) s = s.replace(SENSITIVE_PARAM_RE, '$1[REDACTED_PARAM]');
  if (EMAIL_RE.test(s)) s = s.replace(EMAIL_RE, '[REDACTED_EMAIL]');
  if (CPF_CNPJ_RE.test(s)) s = s.replace(CPF_CNPJ_RE, '[REDACTED_DOC]');
  if (PHONE_RE.test(s)) s = s.replace(PHONE_RE, '[REDACTED_PHONE]');

  // Evita payloads grandes (ex.: XML, base64, dumps)
  return truncate(s);
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): JsonLike {
  if (value == null) return null;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (value instanceof Error) {
    return sanitizeString(value.stack || value.message || String(value));
  }

  if (depth >= MAX_DEPTH) return '[TRUNCATED_DEPTH]';

  if (Array.isArray(value)) {
    const arr = value.slice(0, MAX_ARRAY_LEN).map((v) => sanitizeValue(v, depth + 1, seen));
    if (value.length > MAX_ARRAY_LEN) arr.push(`[TRUNCATED_ARRAY len=${value.length}]`);
    return arr;
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[CIRCULAR]';
    seen.add(value as object);
    const out: Record<string, JsonLike> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1, seen);
    }
    return out;
  }

  return sanitizeString(String(value));
}

export function sanitizeLogData<T = unknown>(value: T): JsonLike {
  return sanitizeValue(value, 0, new WeakSet<object>());
}

const SENSITIVE_KEY_RE = /(api[-_ ]?key|authorization|token|secret|password|senha|bearer|signature|hmac)/i;
const DOCUMENT_KEY_RE = /(cpf|cnpj|doc|documento|federal|tax|inscricao|ie)/i;

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    // mask long tokens
    if (value.length > 120) return value.slice(0, 6) + "…" + value.slice(-6);
    // mask document numbers
    const digits = value.replace(/\D+/g, "");
    if (digits.length === 11) return maskDigits(digits, 3, 2);
    if (digits.length === 14) return maskDigits(digits, 4, 2);
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeForLog(v, depth + 1));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(obj);
    for (const key of keys) {
      const v = obj[key];
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      if (DOCUMENT_KEY_RE.test(key) && typeof v === "string") {
        const digits = v.replace(/\D+/g, "");
        if (digits.length === 11) out[key] = maskDigits(digits, 3, 2);
        else if (digits.length === 14) out[key] = maskDigits(digits, 4, 2);
        else out[key] = v;
        continue;
      }
      out[key] = sanitizeForLog(v, depth + 1);
    }
    return out;
  }

  return "[unsupported]";
}

export function sanitizeHeaders(headers: Record<string, string> | Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const entries: Array<[string, string]> =
    headers instanceof Headers ? Array.from(headers.entries()) : Object.entries(headers);

  for (const [k, v] of entries) {
    const key = k.toLowerCase();
    if (SENSITIVE_KEY_RE.test(key)) continue;
    if (key === "x-api-key" || key === "authorization") continue;
    if (key.startsWith("x-") && (key.includes("signature") || key.includes("hmac"))) continue;
    out[key] = v;
  }
  return out;
}

function maskDigits(digits: string, prefix: number, suffix: number): string {
  if (digits.length <= prefix + suffix) return "[redacted]";
  return digits.slice(0, prefix) + "*".repeat(digits.length - prefix - suffix) + digits.slice(-suffix);
}


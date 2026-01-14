export type ErrorReportingSignal = {
  message: string;
  error?: unknown;
};

function extractHttpStatusFromText(text: string): number | null {
  const m = text.match(/\bHTTP[_\s-]?(\d{3})\b/i);
  if (m?.[1]) return Number(m[1]);
  const m2 = text.match(/\b(\d{3})\s*\(?(Bad Request|Unauthorized|Forbidden|Not Found|Conflict|Unprocessable|Internal Server Error)\b/i);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function extractHttpStatusFromError(error: unknown): number | null {
  try {
    const anyErr = error as any;
    const ctx = anyErr?.context ?? null;
    if (typeof Response !== 'undefined' && ctx instanceof Response) {
      return typeof ctx.status === 'number' ? ctx.status : null;
    }
    const status = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.code;
    if (typeof status === 'number') return status;
    return null;
  } catch {
    return null;
  }
}

function isLikelyUserValidationMessage(text: string): boolean {
  const t = text.toLowerCase();
  return [
    'senha fraca',
    'password too weak',
    'obrigatório',
    'obrigatoria',
    'required',
    'campo',
    'preencha',
    'inválido',
    'invalido',
    'cpf inválido',
    'cnpj inválido',
    'e-mail inválido',
    'email inválido',
    'já existe',
    'duplicate',
  ].some((needle) => t.includes(needle));
}

export function shouldPromptDeveloperReport(signal: ErrorReportingSignal): boolean {
  const message = String(signal.message || '').trim();
  const errText = (() => {
    const e = signal.error as any;
    return String(e?.message ?? e ?? '').trim();
  })();

  const combined = `${message}\n${errText}`.trim();
  if (!combined) return false;

  // Não incomodar o usuário para validações/erros esperados.
  if (isLikelyUserValidationMessage(combined)) return false;

  const httpFromMsg = extractHttpStatusFromText(combined);
  const httpFromErr = extractHttpStatusFromError(signal.error);
  const httpStatus = httpFromErr ?? httpFromMsg;

  // 4xx geralmente são erros de uso/regra de negócio (não bug).
  if (httpStatus && httpStatus >= 400 && httpStatus < 500) return false;

  // 5xx = bug/infra: reportar.
  if (httpStatus && httpStatus >= 500) return true;

  // Erros realmente inesperados do app.
  if (/unexpected|uncaught|internal_server_error|cannot read properties/i.test(combined)) return true;

  return false;
}


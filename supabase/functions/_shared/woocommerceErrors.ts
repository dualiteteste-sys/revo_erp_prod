export type WooErrorCode =
  | "WOO_AUTH_INVALID"
  | "WOO_AUTH_FORBIDDEN"
  | "WOO_WRITE_FORBIDDEN"
  | "WOO_AUTH_FAILED"
  | "WOO_CREDENTIALS_MISSING"
  | "WOO_RATE_LIMIT"
  | "WOO_REMOTE_UNAVAILABLE"
  | "WOO_RESOURCE_NOT_FOUND"
  | "WOO_VALIDATION_FAILED"
  | "WOO_UNEXPECTED"
  | "WOO_QUEUE_EMPTY"
  | "STORE_URL_REQUIRED"
  | "STORE_URL_MUST_USE_HTTPS"
  | "STORE_URL_CREDENTIALS_NOT_ALLOWED"
  | "STORE_URL_INVALID_HOST"
  | "STORE_URL_PRIVATE_HOST_BLOCKED"
  | "STORE_URL_PRIVATE_IP_BLOCKED"
  | "EMPRESA_CONTEXT_FORBIDDEN"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_SIGNATURE_CHECK_FAILED"
  | "WEBHOOK_PAYLOAD_TOO_LARGE"
  | "WEBHOOK_RATE_LIMITED"
  | "JOB_FAILED"
  | "STORE_PAUSED_AUTH_FAILURE"
  | "CLAIM_FAILED";

export type WooErrorMeta = {
  code: WooErrorCode;
  hint: string;
  retryable: boolean;
  pauseStore: boolean;
  severity: "info" | "warn" | "error";
};

export const WOO_ERROR_CATALOG_VERSION = "2026-02-12.phase3";

export const WOO_ERROR_CATALOG: Record<WooErrorCode, Omit<WooErrorMeta, "code">> = {
  WOO_AUTH_INVALID: {
    hint: "Verifique credenciais, HTTPS e se proxy/WAF remove Authorization.",
    retryable: false,
    pauseStore: true,
    severity: "error",
  },
  WOO_AUTH_FORBIDDEN: {
    hint: "Woo retornou 403. Verifique proxy/WAF, permissões da chave e bloqueios de IP.",
    retryable: false,
    pauseStore: true,
    severity: "error",
  },
  WOO_WRITE_FORBIDDEN: {
    hint: "Leitura OK, mas escrita falhou. Confirme que a chave WooCommerce é Read/Write e que o servidor/proxy não bloqueia POST.",
    retryable: false,
    pauseStore: true,
    severity: "error",
  },
  WOO_AUTH_FAILED: {
    hint: "Falha de autenticação/autorização no Woo. Verifique credenciais e proxy/WAF.",
    retryable: false,
    pauseStore: true,
    severity: "error",
  },
  WOO_CREDENTIALS_MISSING: {
    hint: "Credenciais não configuradas para esta loja. Salve Consumer Key/Secret e valide a conexão antes de operar.",
    retryable: false,
    pauseStore: true,
    severity: "error",
  },
  WOO_RATE_LIMIT: {
    hint: "Woo limitou requests. Aguarde retry com backoff.",
    retryable: true,
    pauseStore: false,
    severity: "warn",
  },
  WOO_REMOTE_UNAVAILABLE: {
    hint: "Woo indisponivel temporariamente. Retry automatico aplicado.",
    retryable: true,
    pauseStore: false,
    severity: "warn",
  },
  WOO_RESOURCE_NOT_FOUND: {
    hint: "Recurso Woo nao encontrado. Rebuild de product map pode ser necessario.",
    retryable: false,
    pauseStore: false,
    severity: "warn",
  },
  WOO_VALIDATION_FAILED: {
    hint: "Payload rejeitado pelo Woo. Revise dados enviados e mapeamento.",
    retryable: false,
    pauseStore: false,
    severity: "warn",
  },
  WOO_UNEXPECTED: {
    hint: "Falha inesperada. Revise logs tecnicos para diagnostico.",
    retryable: true,
    pauseStore: false,
    severity: "error",
  },
  WOO_QUEUE_EMPTY: {
    hint: "Nenhum job pronto para processar (fila vazia, store pausada, ou next_run_at futuro).",
    retryable: true,
    pauseStore: false,
    severity: "warn",
  },
  STORE_URL_REQUIRED: {
    hint: "Informe a URL base da loja Woo.",
    retryable: false,
    pauseStore: false,
    severity: "warn",
  },
  STORE_URL_MUST_USE_HTTPS: {
    hint: "URL da loja deve usar HTTPS.",
    retryable: false,
    pauseStore: false,
    severity: "warn",
  },
  STORE_URL_CREDENTIALS_NOT_ALLOWED: {
    hint: "Nao use usuario/senha embutidos na URL.",
    retryable: false,
    pauseStore: false,
    severity: "warn",
  },
  STORE_URL_INVALID_HOST: {
    hint: "Hostname da loja e invalido.",
    retryable: false,
    pauseStore: false,
    severity: "warn",
  },
  STORE_URL_PRIVATE_HOST_BLOCKED: {
    hint: "Hosts privados (localhost/local/internal) sao bloqueados por seguranca.",
    retryable: false,
    pauseStore: false,
    severity: "error",
  },
  STORE_URL_PRIVATE_IP_BLOCKED: {
    hint: "IPs privados/reservados sao bloqueados por seguranca.",
    retryable: false,
    pauseStore: false,
    severity: "error",
  },
  EMPRESA_CONTEXT_FORBIDDEN: {
    hint: "Usuario do JWT nao pertence a empresa solicitada.",
    retryable: false,
    pauseStore: false,
    severity: "error",
  },
  WEBHOOK_SIGNATURE_INVALID: {
    hint: "Assinatura de webhook invalida. Verifique secret e origem.",
    retryable: false,
    pauseStore: false,
    severity: "error",
  },
  WEBHOOK_SIGNATURE_CHECK_FAILED: {
    hint: "Falha ao validar assinatura. Revise secret configurado da loja.",
    retryable: false,
    pauseStore: false,
    severity: "error",
  },
  WEBHOOK_PAYLOAD_TOO_LARGE: {
    hint: "Payload excede limite configurado e foi descartado.",
    retryable: false,
    pauseStore: false,
    severity: "warn",
  },
  WEBHOOK_RATE_LIMITED: {
    hint: "Taxa de webhooks excedida para a loja. Eventos foram descartados.",
    retryable: true,
    pauseStore: false,
    severity: "warn",
  },
  JOB_FAILED: {
    hint: "Job falhou. Consulte detalhes e reexecute apos correcao.",
    retryable: true,
    pauseStore: false,
    severity: "error",
  },
  STORE_PAUSED_AUTH_FAILURE: {
    hint: "Store pausada automaticamente por falha de autenticacao.",
    retryable: false,
    pauseStore: true,
    severity: "error",
  },
  CLAIM_FAILED: {
    hint: "Worker nao conseguiu reclamar jobs. Verifique RPC e lock.",
    retryable: true,
    pauseStore: false,
    severity: "error",
  },
};

export function resolveWooError(code: string): WooErrorMeta {
  const normalized = String(code ?? "").trim() as WooErrorCode;
  const known = WOO_ERROR_CATALOG[normalized];
  if (known) return { code: normalized, ...known };
  return { code: "WOO_UNEXPECTED", ...WOO_ERROR_CATALOG.WOO_UNEXPECTED };
}

export function detectWooErrorCode(message: string): WooErrorCode {
  const normalized = String(message ?? "").trim();
  const direct = normalized.split(":")[0] as WooErrorCode;
  if (WOO_ERROR_CATALOG[direct]) return direct;
  if (/SIGNATURE_INVALID/i.test(normalized)) return "WEBHOOK_SIGNATURE_INVALID";
  if (/SIGNATURE_CHECK_FAILED|WEBHOOK_SECRET_NOT_CONFIGURED/i.test(normalized)) return "WEBHOOK_SIGNATURE_CHECK_FAILED";
  if (/CLAIM_FAILED/i.test(normalized)) return "CLAIM_FAILED";
  return "WOO_UNEXPECTED";
}

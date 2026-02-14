import type { WooAuthMode } from "./woocommerceHardening.ts";

export type WooConnectionAttempt = {
  auth_mode: WooAuthMode;
  endpoint: string;
  status: number | null;
  latency_ms: number | null;
  body_code: string | null;
  body_message: string | null;
  error: string | null;
};

export type WooConnectionDiagnosis = {
  code:
    | "AUTH_HEADER_BLOCKED"
    | "WOO_CREDENTIALS_INVALID"
    | "WOO_PERMISSIONS_BLOCKED"
    | "WOO_ROUTE_UNAVAILABLE"
    | "WORDPRESS_NOT_DETECTED"
    | "WOO_RATE_LIMIT"
    | "WOO_REMOTE_UNAVAILABLE"
    | "WOO_CONNECTION_UNKNOWN";
  message: string;
  hint: string;
  category: "credentials" | "permissions" | "route" | "network" | "unknown";
  http_status: number | null;
  endpoint: string | null;
};

export function classifyWooConnectionFailure(params: {
  wpDetected: boolean;
  attempts: WooConnectionAttempt[];
}): WooConnectionDiagnosis {
  const latest = [...params.attempts].reverse().find((item) => typeof item.status === "number");
  const attemptsByMode = {
    basic: params.attempts.filter((item) => item.auth_mode === "basic_https"),
    query: params.attempts.filter((item) => item.auth_mode === "querystring_fallback"),
  };
  const basicStatuses = attemptsByMode.basic.map((item) => item.status).filter((value): value is number => typeof value === "number");
  const queryStatuses = attemptsByMode.query.map((item) => item.status).filter((value): value is number => typeof value === "number");

  const querySucceeded = queryStatuses.some((status) => status >= 200 && status < 300);
  const basicFailedAuth = basicStatuses.some((status) => status === 401 || status === 403);
  if (querySucceeded && basicFailedAuth) {
    return {
      code: "AUTH_HEADER_BLOCKED",
      category: "permissions",
      http_status: latest?.status ?? 403,
      endpoint: latest?.endpoint ?? null,
      message: "Conexão Woo validada somente com fallback por querystring. O servidor/proxy provavelmente bloqueia o header Authorization.",
      hint: "Ajuste proxy/WAF/Nginx para encaminhar Authorization. Enquanto isso, use fallback querystring para evitar indisponibilidade.",
    };
  }

  if (!params.wpDetected) {
    return {
      code: "WORDPRESS_NOT_DETECTED",
      category: "route",
      http_status: latest?.status ?? null,
      endpoint: latest?.endpoint ?? "/wp-json/",
      message: "WordPress/WooCommerce não detectado na URL informada.",
      hint: "Valide a URL base da loja e se /wp-json/ responde. Em WordPress, evite permalinks Plain e confirme o plugin WooCommerce ativo.",
    };
  }

  if (basicStatuses.includes(404) || queryStatuses.includes(404)) {
    return {
      code: "WOO_ROUTE_UNAVAILABLE",
      category: "route",
      http_status: 404,
      endpoint: latest?.endpoint ?? "/wp-json/wc/v3",
      message: "API REST do WooCommerce não encontrada (404).",
      hint: "Verifique WooCommerce ativo, permalinks do WordPress (não usar Plain) e bloqueios de rota no servidor.",
    };
  }

  const allStatuses = [...basicStatuses, ...queryStatuses];
  const allAuthDenied = allStatuses.length > 0 && allStatuses.every((status) => status === 401);
  if (allAuthDenied) {
    return {
      code: "WOO_CREDENTIALS_INVALID",
      category: "credentials",
      http_status: 401,
      endpoint: latest?.endpoint ?? null,
      message: "Credenciais WooCommerce inválidas (401).",
      hint: "Regenere Consumer Key/Secret com permissão Read ou Read/Write e teste novamente.",
    };
  }

  const has403 = allStatuses.some((status) => status === 403);
  if (has403) {
    return {
      code: "WOO_PERMISSIONS_BLOCKED",
      category: "permissions",
      http_status: 403,
      endpoint: latest?.endpoint ?? null,
      message: "WooCommerce recusou a requisição (403).",
      hint: "Verifique permissões da chave, plugins de segurança/WAF e se há bloqueio por IP/origem.",
    };
  }

  if (allStatuses.some((status) => status === 429)) {
    return {
      code: "WOO_RATE_LIMIT",
      category: "network",
      http_status: 429,
      endpoint: latest?.endpoint ?? null,
      message: "WooCommerce aplicou rate limit (429).",
      hint: "Aguarde alguns minutos e reteste. Se persistir, reduza frequência e concorrência dos jobs.",
    };
  }

  if (allStatuses.some((status) => status >= 500)) {
    return {
      code: "WOO_REMOTE_UNAVAILABLE",
      category: "network",
      http_status: latest?.status ?? 500,
      endpoint: latest?.endpoint ?? null,
      message: "WooCommerce indisponível temporariamente (5xx).",
      hint: "Valide disponibilidade do site, logs do servidor e timeout em firewall/CDN.",
    };
  }

  return {
    code: "WOO_CONNECTION_UNKNOWN",
    category: "unknown",
    http_status: latest?.status ?? null,
    endpoint: latest?.endpoint ?? null,
    message: "Não foi possível validar a conexão com o WooCommerce.",
    hint: "Revise URL, credenciais, permissões e bloqueios de rede/proxy. Consulte os detalhes do diagnóstico.",
  };
}

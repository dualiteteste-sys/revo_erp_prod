/**
 * Shopee — shared hardening utilities
 * Used by shopee-admin, shopee-worker, shopee-webhook, shopee-scheduler, marketplaces-oauth
 *
 * Key difference from ML: every API call needs HMAC-SHA256 signature as query param.
 * Shopee auth: partner_id + api_path + timestamp [+ access_token + shop_id] → HMAC-SHA256(base, partner_key)
 */

import { hmacSha256Hex, timingSafeEqual } from "./crypto.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SHOPEE_API_BASE = "https://partner.shopeemobile.com";

// Rate limits (approximate, conservative)
export const SHOPEE_RATE_LIMITS = {
  read:  { limit: 100, windowSeconds: 60 },
  write: { limit: 50,  windowSeconds: 60 },
} as const;

// Token lifetimes
export const SHOPEE_ACCESS_TOKEN_SECONDS = 14400;  // 4 hours
export const SHOPEE_REFRESH_TOKEN_SECONDS = 2592000; // 30 days

// ---------------------------------------------------------------------------
// HMAC Signature (required on every Shopee API call)
// ---------------------------------------------------------------------------

/**
 * Generates HMAC-SHA256 signature for Shopee API requests.
 *
 * Public endpoints:  base = partner_id + api_path + timestamp
 * Shop endpoints:    base = partner_id + api_path + timestamp + access_token + shop_id
 */
export async function shopeeSign(params: {
  partnerId: string;
  partnerKey: string;
  apiPath: string;
  timestamp: number;
  accessToken?: string;
  shopId?: string;
}): Promise<string> {
  let base = `${params.partnerId}${params.apiPath}${params.timestamp}`;
  if (params.accessToken) base += params.accessToken;
  if (params.shopId) base += params.shopId;
  return hmacSha256Hex(params.partnerKey, base);
}

// ---------------------------------------------------------------------------
// URL builder (auto-signs)
// ---------------------------------------------------------------------------

export async function buildShopeeUrl(params: {
  path: string; // e.g. "/api/v2/order/get_order_list"
  partnerId: string;
  partnerKey: string;
  accessToken?: string;
  shopId?: string;
  extra?: Record<string, string>;
}): Promise<string> {
  const apiPath = params.path.startsWith("/") ? params.path : `/${params.path}`;
  const ts = Math.floor(Date.now() / 1000);
  const sign = await shopeeSign({
    partnerId: params.partnerId,
    partnerKey: params.partnerKey,
    apiPath,
    timestamp: ts,
    accessToken: params.accessToken,
    shopId: params.shopId,
  });

  const url = new URL(`${SHOPEE_API_BASE}${apiPath}`);
  url.searchParams.set("partner_id", params.partnerId);
  url.searchParams.set("timestamp", String(ts));
  url.searchParams.set("sign", sign);
  if (params.accessToken) url.searchParams.set("access_token", params.accessToken);
  if (params.shopId) url.searchParams.set("shop_id", params.shopId);
  if (params.extra) {
    for (const [k, v] of Object.entries(params.extra)) {
      if (v != null) url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// HTTP helpers (no Bearer header — auth is in query params)
// ---------------------------------------------------------------------------

export async function shopeeFetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Accept: "application/json",
      "User-Agent": "UltriaERP/shopee-admin",
    },
  });
  const data = await resp.json().catch(() => ({}));
  // Shopee wraps errors in response body with error/message fields
  const shopeeOk = resp.ok && !data?.error;
  return { ok: shopeeOk, status: resp.status, data };
}

export async function shopeePostJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  return shopeeFetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// OAuth: Auth URL builder
// ---------------------------------------------------------------------------

export async function shopeeAuthUrl(params: {
  partnerId: string;
  partnerKey: string;
  redirectUrl: string;
}): Promise<string> {
  const apiPath = "/api/v2/shop/auth_partner";
  const ts = Math.floor(Date.now() / 1000);
  const sign = await shopeeSign({
    partnerId: params.partnerId,
    partnerKey: params.partnerKey,
    apiPath,
    timestamp: ts,
  });

  const url = new URL(`${SHOPEE_API_BASE}${apiPath}`);
  url.searchParams.set("partner_id", params.partnerId);
  url.searchParams.set("timestamp", String(ts));
  url.searchParams.set("sign", sign);
  url.searchParams.set("redirect", params.redirectUrl);
  return url.toString();
}

// ---------------------------------------------------------------------------
// OAuth: Exchange code for tokens
// ---------------------------------------------------------------------------

export async function shopeeExchangeCode(params: {
  partnerId: string;
  partnerKey: string;
  code: string;
  shopId: string;
}): Promise<{ ok: boolean; status: number; data: any }> {
  const apiPath = "/api/v2/auth/token/get";
  const url = await buildShopeeUrl({
    path: apiPath,
    partnerId: params.partnerId,
    partnerKey: params.partnerKey,
  });
  return shopeePostJson(url, {
    code: params.code,
    partner_id: Number(params.partnerId),
    shop_id: Number(params.shopId),
  });
}

// ---------------------------------------------------------------------------
// OAuth: Refresh token
// ---------------------------------------------------------------------------

export async function refreshShopeeToken(params: {
  partnerId: string;
  partnerKey: string;
  refreshToken: string;
  shopId: string;
}): Promise<{ ok: boolean; status: number; data: any }> {
  const apiPath = "/api/v2/auth/access_token/get";
  const url = await buildShopeeUrl({
    path: apiPath,
    partnerId: params.partnerId,
    partnerKey: params.partnerKey,
  });
  return shopeePostJson(url, {
    refresh_token: params.refreshToken,
    partner_id: Number(params.partnerId),
    shop_id: Number(params.shopId),
  });
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies Shopee webhook signature.
 * Shopee: HMAC-SHA256(callback_url + "|" + raw_body, partner_key)
 * Signature sent in Authorization header.
 */
export async function verifyShopeeWebhookSignature(params: {
  partnerKey: string;
  callbackUrl: string;
  rawBody: string;
  signature: string;
}): Promise<{ valid: boolean }> {
  const { partnerKey, callbackUrl, rawBody, signature } = params;
  if (!partnerKey || !signature) return { valid: false };
  const message = `${callbackUrl}|${rawBody}`;
  const expected = await hmacSha256Hex(partnerKey, message);
  return { valid: timingSafeEqual(expected, signature) };
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export function classifyShopeeHttpStatus(status: number): {
  code: string;
  retryable: boolean;
  hint: string;
} {
  if (status === 200) return { code: "OK", retryable: false, hint: "Success" };
  if (status === 400) return { code: "BAD_REQUEST", retryable: false, hint: "Payload inválido." };
  if (status === 401 || status === 403) return { code: "AUTH_ERROR", retryable: true, hint: "Token expirado ou sem permissão." };
  if (status === 429) return { code: "RATE_LIMITED", retryable: true, hint: "Limite de requisições excedido." };
  if (status >= 500) return { code: "SHOPEE_SERVER_ERROR", retryable: true, hint: "Erro interno Shopee." };
  return { code: `HTTP_${status}`, retryable: false, hint: `Status HTTP ${status} inesperado.` };
}

// ---------------------------------------------------------------------------
// Reusable from ML hardening
// ---------------------------------------------------------------------------

export { backoffMs, shouldPauseOnZeroStock } from "./meliHardening.ts";

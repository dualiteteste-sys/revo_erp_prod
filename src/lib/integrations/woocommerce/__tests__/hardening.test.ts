import { describe, expect, it } from "vitest";
import {
  classifyWooHttpStatus,
  computeBackoffMs,
  dedupeKeyForWebhook,
  dropReconcileDedupeKey,
  isEmpresaContextAllowed,
  normalizeWooStoreUrl,
  pickUniqueByStoreType,
  resolveWooInfraKeys,
  shouldFallbackToActiveEmpresa,
  validateSchedulerKey,
} from "../../../../../supabase/functions/_shared/woocommerceHardening.ts";

describe("woocommerce hardening", () => {
  it("normalizes https base_url and strips query/hash", () => {
    const normalized = normalizeWooStoreUrl("MinhaLoja.com.br/path/?foo=1#hash");
    expect(normalized).toBe("https://minhaloja.com.br/path");
  });

  it("blocks spoofed empresa context when JWT user has no membership", () => {
    expect(isEmpresaContextAllowed("empresa-a", ["empresa-a", "empresa-b"])).toBe(true);
    expect(isEmpresaContextAllowed("empresa-z", ["empresa-a", "empresa-b"])).toBe(false);
  });

  it("blocks non-https and private targets (ssrf guard)", () => {
    expect(() => normalizeWooStoreUrl("http://example.com")).toThrow("STORE_URL_MUST_USE_HTTPS");
    expect(() => normalizeWooStoreUrl("https://localhost:8443")).toThrow("STORE_URL_PRIVATE_HOST_BLOCKED");
    expect(() => normalizeWooStoreUrl("https://192.168.0.10")).toThrow("STORE_URL_PRIVATE_IP_BLOCKED");
  });

  it("prioritizes delivery-id dedupe key with fallback hash", () => {
    const withDelivery = dedupeKeyForWebhook({
      deliveryId: "abc-123",
      topic: "order.created",
      wooResourceId: 10,
      payloadHash: "h1",
    });
    const fallback = dedupeKeyForWebhook({
      deliveryId: null,
      topic: "order.created",
      wooResourceId: 10,
      payloadHash: "h1",
    });
    expect(withDelivery).toBe("delivery:abc-123");
    expect(fallback).toBe("hash:order.created:10:h1");
  });

  it("debounces dropped-webhook reconcile key by window", () => {
    const t0 = Date.parse("2026-02-12T12:00:00.000Z");
    const keyA = dropReconcileDedupeKey(t0, 5);
    const keyB = dropReconcileDedupeKey(t0 + 2 * 60_000, 5);
    const keyC = dropReconcileDedupeKey(t0 + 6 * 60_000, 5);
    expect(keyA).toBe(keyB);
    expect(keyC).not.toBe(keyA);
  });

  it("classifies 401/403 as pause-store and 429/5xx as retry", () => {
    const auth = classifyWooHttpStatus(401);
    const forbidden = classifyWooHttpStatus(403);
    const throttle = classifyWooHttpStatus(429);
    const remote = classifyWooHttpStatus(503);
    expect(auth.pauseStore).toBe(true);
    expect(auth.code).toBe("WOO_AUTH_INVALID");
    expect(forbidden.code).toBe("WOO_AUTH_FORBIDDEN");
    expect(auth.retryable).toBe(false);
    expect(throttle.retryable).toBe(true);
    expect(remote.retryable).toBe(true);
  });

  it("does not allow fallback when x-empresa-id is provided", () => {
    expect(shouldFallbackToActiveEmpresa({ headerEmpresaId: "empresa-a", errorCode: "EMPRESA_CONTEXT_FORBIDDEN" })).toBe(false);
    expect(shouldFallbackToActiveEmpresa({ headerEmpresaId: "empresa-a", errorCode: "EMPRESA_ID_REQUIRED" })).toBe(false);
    expect(shouldFallbackToActiveEmpresa({ headerEmpresaId: "", errorCode: "EMPRESA_ID_REQUIRED" })).toBe(true);
  });

  it("validates scheduler key states", () => {
    expect(validateSchedulerKey({ providedKey: "", expectedKey: "abc", keysMatch: false })).toEqual({
      ok: false,
      status: 401,
      error: "SCHEDULER_UNAUTHENTICATED",
    });
    expect(validateSchedulerKey({ providedKey: "bad", expectedKey: "abc", keysMatch: false })).toEqual({
      ok: false,
      status: 403,
      error: "SCHEDULER_FORBIDDEN",
    });
    expect(validateSchedulerKey({ providedKey: "abc", expectedKey: "abc", keysMatch: true })).toEqual({
      ok: true,
      status: null,
      error: null,
    });
  });

  it("resolves infra keys with legacy aliases (scheduler/worker)", () => {
    const envA: Record<string, string> = { WOOCOMMERCE_SCHEDULE: "k1" };
    expect(resolveWooInfraKeys((k) => envA[k])).toEqual({ workerKey: "k1", schedulerKey: "k1" });

    const envB: Record<string, string> = { WOOCOMMERCE_WORKER_KEY: "wk" };
    expect(resolveWooInfraKeys((k) => envB[k])).toEqual({ workerKey: "wk", schedulerKey: "wk" });

    const envC: Record<string, string> = { WOOCOMMERCE_WORKER_KEY: "wk", WOOCOMMERCE_SCHEDULER_KEY: "sk" };
    expect(resolveWooInfraKeys((k) => envC[k])).toEqual({ workerKey: "wk", schedulerKey: "sk" });
  });

  it("computes exponential backoff with floor and cap", () => {
    const first = computeBackoffMs(1);
    const second = computeBackoffMs(2);
    const veryHigh = computeBackoffMs(50);
    expect(first).toBeGreaterThanOrEqual(30_000);
    expect(second).toBeGreaterThan(first);
    expect(veryHigh).toBeLessThanOrEqual(3_602_000);
  });

  it("enforces one runnable job per store/type lock-key", () => {
    const selected = pickUniqueByStoreType([
      { id: "1", store_id: "s1", type: "ORDER_RECONCILE" },
      { id: "2", store_id: "s1", type: "ORDER_RECONCILE" },
      { id: "3", store_id: "s1", type: "STOCK_SYNC" },
      { id: "4", store_id: "s2", type: "ORDER_RECONCILE" },
    ]);
    expect(selected.map((job) => job.id)).toEqual(["1", "3", "4"]);
  });
});

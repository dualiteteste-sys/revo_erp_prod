import { describe, expect, it } from "vitest";
import { buildWooStoreStatusContract } from "../../../../../supabase/functions/_shared/woocommerceStatusContract.ts";
import { WOO_ERROR_CATALOG_VERSION } from "../../../../../supabase/functions/_shared/woocommerceErrors.ts";

describe("woocommerce status contract", () => {
  it("builds stable contract sections", () => {
    const contract = buildWooStoreStatusContract({
      store: {
        id: "store-1",
        status: "paused",
        base_url: "https://woo.example.com",
        auth_mode: "basic_https",
        last_healthcheck_at: "2026-02-12T10:00:00.000Z",
      },
      queueCounts: { queued: 2, running: 1, error: 3, dead: 1 },
      mapQuality: { total: 100, missing_revo_map: 4, duplicated_skus: 2 },
      webhookEvents: [
        { id: "w1", process_status: "error", received_at: "2026-02-12T11:00:00.000Z" },
        { id: "w2", process_status: "done", received_at: "2026-02-12T10:59:00.000Z" },
        { id: "w3", process_status: "dropped", received_at: "2026-02-12T10:58:00.000Z" },
      ],
      jobs: [
        { id: "j1", status: "queued", next_run_at: "2026-02-12T09:58:00.000Z" },
        { id: "j2", status: "running", next_run_at: "2026-02-12T09:59:00.000Z" },
      ],
      logs: [
        {
          id: "l1",
          level: "error",
          message: "job_failed",
              created_at: "2026-02-12T11:01:00.000Z",
              job_id: "j1",
              meta: { code: "WOO_AUTH_FORBIDDEN", hint: "retry later" },
            },
      ],
      orderMapLatest: { woo_updated_at: "2026-02-12T09:00:00.000Z", imported_at: "2026-02-12T09:01:00.000Z" },
    });

    expect(contract.version).toBe("v1");
    expect(contract.error_catalog_version).toBe(WOO_ERROR_CATALOG_VERSION);
    expect(contract.health).toHaveProperty("queue_lag_seconds");
    expect(contract.queue.pending_total).toBe(5);
    expect(contract.webhooks.invalid_or_error).toBe(1);
    expect(contract.webhooks.dropped).toBe(1);
    expect(contract.orders.last_woo_updated_at).toBe("2026-02-12T09:00:00.000Z");
    expect(contract.map_quality.duplicated_skus).toBe(2);
    expect(Array.isArray(contract.recommendations)).toBe(true);
    expect(contract.recent_errors[0]?.code).toBe("WOO_AUTH_FORBIDDEN");
    expect(contract.recommendations).toEqual(expect.arrayContaining([
      "Store pausada: faltam credenciais criptografadas na store (sincronize credenciais e rode healthcheck).",
      "Falha de autenticação/autorização Woo detectada. Revise credenciais e proxy/WAF.",
      "Webhooks descartados por limite. Reconcile automático foi enfileirado.",
    ]));
  });
});

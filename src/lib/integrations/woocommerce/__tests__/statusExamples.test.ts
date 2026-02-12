import { describe, expect, it, vi } from "vitest";
import { buildWooStoreStatusContract } from "../../../../../supabase/functions/_shared/woocommerceStatusContract.ts";

function baseInput() {
  return {
    store: {
      id: "store-1",
      status: "active",
      base_url: "https://woo.example.com",
      auth_mode: "basic_https",
      last_healthcheck_at: "2026-02-12T11:55:00.000Z",
    },
    queueCounts: { queued: 0, running: 1, error: 0, dead: 0 },
    mapQuality: { total: 20, missing_revo_map: 0, duplicated_skus: 0 },
    webhookEvents: [
      { id: "w1", process_status: "done", received_at: "2026-02-12T11:59:00.000Z" },
      { id: "w2", process_status: "done", received_at: "2026-02-12T11:58:00.000Z" },
    ],
    jobs: [
      { id: "j1", status: "done", next_run_at: "2026-02-12T11:59:00.000Z" },
      { id: "j2", status: "running", next_run_at: "2026-02-12T11:59:00.000Z" },
    ],
    logs: [] as any[],
    orderMapLatest: { woo_updated_at: "2026-02-12T11:58:30.000Z", imported_at: "2026-02-12T11:59:00.000Z" },
  };
}

describe("woocommerce status examples", () => {
  it("creates deterministic snapshots for scenarios A/B/C/D", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-12T12:00:00.000Z"));

    const healthy = buildWooStoreStatusContract(baseInput());

    const authFailingInput = baseInput();
    authFailingInput.store.status = "paused";
    authFailingInput.logs = [{
      id: "l-auth",
      level: "error",
      message: "job_failed",
      created_at: "2026-02-12T11:59:30.000Z",
      meta: { code: "WOO_AUTH_FORBIDDEN", hint: "Revise credenciais" },
    }];
    authFailingInput.queueCounts = { queued: 0, running: 0, error: 2, dead: 0 };
    const authFailing = buildWooStoreStatusContract(authFailingInput);

    const workerLagInput = baseInput();
    workerLagInput.queueCounts = { queued: 18, running: 0, error: 2, dead: 1 };
    workerLagInput.jobs = [{ id: "j-lag", status: "queued", next_run_at: "2026-02-12T10:40:00.000Z" }];
    const workerLag = buildWooStoreStatusContract(workerLagInput);

    const mapConflictsInput = baseInput();
    mapConflictsInput.mapQuality = { total: 120, missing_revo_map: 6, duplicated_skus: 2 };
    const mapConflicts = buildWooStoreStatusContract(mapConflictsInput);

    expect({
      A_HEALTHY: healthy,
      B_AUTH_FAILING: authFailing,
      C_WORKER_LAG: workerLag,
      D_MAP_CONFLICTS: mapConflicts,
    }).toMatchSnapshot();

    vi.useRealTimers();
  });
});

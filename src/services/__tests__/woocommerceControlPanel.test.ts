import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

import { requeueWooDeadJob } from "@/services/woocommerceControlPanel";

describe("woocommerceControlPanel service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends stores.jobs.requeue payload with tenant header", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, job_id: "job-1", status: "queued" },
      error: null,
    });

    await requeueWooDeadJob("empresa-1", "store-1", "job-1");

    expect(invokeMock).toHaveBeenCalledWith("woocommerce-admin", {
      body: {
        action: "stores.jobs.requeue",
        store_id: "store-1",
        job_id: "job-1",
      },
      headers: { "x-empresa-id": "empresa-1" },
    });
  });
});

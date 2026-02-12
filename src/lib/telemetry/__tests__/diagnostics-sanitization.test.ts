import { describe, expect, it } from "vitest";
import { clearNetworkTracesForTest, getNetworkTracesSnapshot, recordNetworkTrace } from "@/lib/telemetry/networkTraceBuffer";
import { clearBreadcrumbsForTest, getBreadcrumbsSnapshot, recordBreadcrumb } from "@/lib/telemetry/breadcrumbsBuffer";

describe("diagnostic buffers sanitization", () => {
  it("network trace nunca inclui chaves sensíveis em payload_keys", () => {
    clearNetworkTracesForTest();

    recordNetworkTrace({
      request_id: "req1",
      kind: "rpc",
      name: "ecommerce_connections_upsert",
      method: "POST",
      url: "https://example.test/rest/v1/rpc/ecommerce_connections_upsert?token=abc",
      status_code: 400,
      duration_ms: 123,
      body: JSON.stringify({ p_api_key: "k_x", p_access_token: "t_x", p_other: 1 }),
      response_summary: "invalid credentials",
    });

    const traces = getNetworkTracesSnapshot();
    const last = traces.length ? traces[traces.length - 1] : undefined;
    expect(last?.payload_keys).toEqual(["p_other"]);
    expect(last?.url).toBe("https://example.test/rest/v1/rpc/ecommerce_connections_upsert");
  });

  it("breadcrumbs sanitizam emails/tokens/telefones", () => {
    clearBreadcrumbsForTest();

    recordBreadcrumb({
      type: "click",
      message: "Testar conexão",
      data: { email: "user@empresa.com", token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb", phone: "+55 11 98888-7777" },
    });

    const crumbs = getBreadcrumbsSnapshot();
    const b = crumbs.length ? crumbs[crumbs.length - 1] : undefined;
    expect(JSON.stringify(b)).toContain("[REDACTED_EMAIL]");
    expect(JSON.stringify(b)).toContain("[REDACTED]");
    expect(JSON.stringify(b)).toContain("[REDACTED_PHONE]");
  });
});

import { describe, expect, it } from "vitest";
import { maybeHandleWooMockRequest } from "../../../../../supabase/functions/_shared/wooMock.ts";

function getEnvFactory(vars: Record<string, string>) {
  return (key: string) => vars[key] ?? null;
}

describe("woo mock", () => {
  it("does not intercept non-mock origins", () => {
    const mock = maybeHandleWooMockRequest({
      url: "https://example.com/wp-json/wc/v3/products?per_page=1",
      init: { method: "GET" },
      getEnv: getEnvFactory({ SUPABASE_URL: "http://127.0.0.1:54321" }),
    });
    expect(mock).toBeNull();
  });

  it("responds to /wp-json/ (WordPress detection)", () => {
    const mock = maybeHandleWooMockRequest({
      url: "https://woo-mock.ultria.invalid/wp-json/",
      init: { method: "GET" },
      getEnv: getEnvFactory({ SUPABASE_URL: "http://127.0.0.1:54321" }),
    });
    expect(mock?.status).toBe(200);
    expect(mock?.ok).toBe(true);
    expect(Array.isArray((mock as any)?.data?.namespaces)).toBe(true);
  });

  it("responds to wc/v3 system_status", () => {
    const mock = maybeHandleWooMockRequest({
      url: "https://woo-mock.ultria.invalid/wp-json/wc/v3/system_status",
      init: { method: "GET" },
      getEnv: getEnvFactory({ SUPABASE_URL: "http://127.0.0.1:54321" }),
    });
    expect(mock?.status).toBe(200);
    expect(mock?.ok).toBe(true);
    expect((mock as any)?.data?.environment?.version).toBeTruthy();
  });

  it("responds to wc/v3 products list", () => {
    const mock = maybeHandleWooMockRequest({
      url: "https://woo-mock.ultria.invalid/wp-json/wc/v3/products?per_page=1&page=1",
      init: { method: "GET" },
      getEnv: getEnvFactory({ SUPABASE_URL: "http://127.0.0.1:54321" }),
    });
    expect(mock?.status).toBe(200);
    expect(mock?.ok).toBe(true);
    expect(Array.isArray((mock as any)?.data)).toBe(true);
  });
});


import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeConsoleError = console.error;
const nativeConsoleWarn = console.warn;
const nativeAlert = typeof window !== "undefined" ? window.alert : undefined;

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => {
  return {
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

vi.mock("@/lib/requestId", () => ({
  getLastRequestId: () => "req_test_123",
}));

vi.mock("@/lib/telemetry/networkErrors", () => ({
  getRecentNetworkErrors: () => [
    {
      at: "2026-02-12T00:00:00.000Z",
      requestId: "req_net_1",
      url: "https://example.test/rest/v1/rpc/foo",
      method: "POST",
      status: 500,
      isRpc: true,
      isEdgeFn: false,
      responseText: "{\"message\":\"boom\"}",
    },
  ],
}));

vi.mock("@/lib/telemetry/lastUserAction", () => ({
  setupLastUserActionTracking: () => {},
  getLastUserAction: () => ({ route: "/stale-route", label: "click:Salvar", ageMs: 123 }),
}));

describe("setupGlobalErrorHandlers (route + modal context)", () => {
  beforeEach(async () => {
    vi.resetModules();
    console.error = nativeConsoleError;
    console.warn = nativeConsoleWarn;
    if (typeof window !== "undefined" && nativeAlert) window.alert = nativeAlert;
  });

  it("usa route snapshot (não lastAction.route stale)", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    const rpcSpy = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;

    const { setRoutePathnameSnapshot } = await import("@/lib/telemetry/routeSnapshot");
    setRoutePathnameSnapshot("/real-route");

    const { setupGlobalErrorHandlers } = await import("@/lib/global-error-handlers");
    setupGlobalErrorHandlers();

    console.error("TEST_ERROR_ROUTE");

    const matches = rpcSpy.mock.calls.filter((c) => c?.[0] === "ops_app_errors_log_v1");
    const call = matches[matches.length - 1];
    expect(call).toBeTruthy();
    expect(call?.[1]?.p_route).toBe("/real-route");
    expect(call?.[1]?.p_context?.route_base).toBe("/real-route");
  });

  it("anexa modal_active quando existe modal no stack", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    const rpcSpy = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;

    const { setRoutePathnameSnapshot } = await import("@/lib/telemetry/routeSnapshot");
    setRoutePathnameSnapshot("/base");

    const { pushModalContext, popModalContext, getModalContextStackSnapshot } = await import("@/lib/telemetry/modalContextStack");
    const modalId = pushModalContext({ kind: "dialog", name: "Configurações", logicalRoute: "/modal/config", params: { id: "1" } });
    expect(getModalContextStackSnapshot().length).toBeGreaterThan(0);

    const { setupGlobalErrorHandlers } = await import("@/lib/global-error-handlers");
    setupGlobalErrorHandlers();
    expect(getModalContextStackSnapshot().length).toBeGreaterThan(0);

    console.error("TEST_ERROR_MODAL");

    popModalContext(modalId);

    const matches = rpcSpy.mock.calls.filter((c) => c?.[0] === "ops_app_errors_log_v1");
    const call = matches[matches.length - 1];
    expect(call).toBeTruthy();
    const ctx = call?.[1]?.p_context;
    expect(Array.isArray(ctx?.modal_context_stack)).toBe(true);
    expect(ctx?.modal_context_stack?.length).toBeGreaterThan(0);
    expect(ctx?.modal_context_stack?.at(-1)?.name).toBe("Configurações");
  });
});

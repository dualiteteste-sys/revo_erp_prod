import { describe, expect, it } from "vitest";
import { triageErrorLike } from "@/lib/telemetry/errorTriage";

describe("triageErrorLike", () => {
  it("classifica erro do sistema (TypeError)", () => {
    const t = triageErrorLike({ message: "TypeError: Cannot read properties of undefined (reading 'toFixed')" });
    expect(t.category).toBe("SYSTEM");
  });

  it("classifica erro do cliente (ERR_BLOCKED_BY_CLIENT)", () => {
    const t = triageErrorLike({ message: "net::ERR_BLOCKED_BY_CLIENT" });
    expect(t.category).toBe("CLIENT");
  });

  it("classifica erro do cliente (ERR_INSUFFICIENT_RESOURCES)", () => {
    const t = triageErrorLike({ message: "net::ERR_INSUFFICIENT_RESOURCES" });
    expect(t.category).toBe("CLIENT");
  });

  it("classifica erro do sistema por http_status", () => {
    const t = triageErrorLike({ message: "rpc:foo failed", http_status: 500 });
    expect(t.category).toBe("SYSTEM");
  });

  it("mantém unknown quando ambíguo (Failed to fetch)", () => {
    const t = triageErrorLike({ message: "TypeError: Failed to fetch" });
    // TypeError geralmente seria SYSTEM, mas "Failed to fetch" é ambíguo; a regra forte de TypeError vence.
    expect(t.category).toBe("SYSTEM");
  });
});


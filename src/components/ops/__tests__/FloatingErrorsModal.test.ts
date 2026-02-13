import { describe, expect, it } from "vitest";

import { clampModalPosition } from "@/components/ops/FloatingErrorsModal";

describe("FloatingErrorsModal drag clamp", () => {
  it("mantém posição dentro da viewport", () => {
    const viewport = { w: 1280, h: 720 };
    const size = { w: 560, h: 420 };

    expect(clampModalPosition({ x: -100, y: -50 }, viewport, size)).toEqual({ x: 8, y: 8 });
    expect(clampModalPosition({ x: 2000, y: 1200 }, viewport, size)).toEqual({ x: 712, y: 292 });
    expect(clampModalPosition({ x: 120, y: 90 }, viewport, size)).toEqual({ x: 120, y: 90 });
  });
});

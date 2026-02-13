import { describe, expect, it } from "vitest";

import { isDebounced, isFloatingErrorsHotkey } from "@/contexts/OpsOverlayProvider";

describe("OpsOverlayProvider hotkey", () => {
  it("aceita Cmd+Shift+E no mac", () => {
    const event = {
      key: "E",
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
    };

    expect(isFloatingErrorsHotkey(event, "mac")).toBe(true);
  });

  it("aceita Ctrl+Shift+E fora do mac", () => {
    const event = {
      key: "e",
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
    };

    expect(isFloatingErrorsHotkey(event, "other")).toBe(true);
  });

  it("não aceita combinações conflitantes", () => {
    expect(
      isFloatingErrorsHotkey(
        {
          key: "e",
          metaKey: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        "mac",
      ),
    ).toBe(false);

    expect(
      isFloatingErrorsHotkey(
        {
          key: "e",
          metaKey: true,
          ctrlKey: false,
          shiftKey: true,
          altKey: true,
        },
        "mac",
      ),
    ).toBe(false);
  });

  it("aplica debounce de 200ms", () => {
    expect(isDebounced(1000, 1100)).toBe(true);
    expect(isDebounced(1000, 1200)).toBe(false);
  });
});

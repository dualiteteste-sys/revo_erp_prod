import { describe, expect, it } from "vitest";

import { resolveBillingSyncRecovery } from "../billingSyncRecovery";

describe("resolveBillingSyncRecovery", () => {
  it("returns synced when synced=true", () => {
    expect(resolveBillingSyncRecovery({ data: { synced: true } })).toEqual({ kind: "synced" });
  });

  it("maps missing_customer to link_customer", () => {
    expect(resolveBillingSyncRecovery({ raw: { error: "missing_customer" } })).toEqual({
      kind: "link_customer",
      message: "Sem cliente Stripe vinculado para esta empresa.",
    });
  });

  it("maps no_subscription+checkout_url to resume_checkout", () => {
    expect(
      resolveBillingSyncRecovery({
        data: { synced: false, error: "no_subscription", checkout_url: "https://stripe.test/checkout" },
      }),
    ).toEqual({
      kind: "resume_checkout",
      checkoutUrl: "https://stripe.test/checkout",
      message: "Checkout pendente. Vamos retomar o check-in no Stripe.",
    });
  });

  it("maps no_subscription+choose_plan to choose_plan", () => {
    expect(
      resolveBillingSyncRecovery({
        data: { synced: false, error: "no_subscription", next_action: "choose_plan", message: "Selecione." },
      }),
    ).toEqual({
      kind: "choose_plan",
      message: "Selecione.",
    });
  });

  it("maps next_action resume_checkout when url exists", () => {
    expect(
      resolveBillingSyncRecovery({
        data: { synced: false, next_action: "resume_checkout", checkout_url: "https://stripe.test/x" },
      }),
    ).toEqual({
      kind: "resume_checkout",
      checkoutUrl: "https://stripe.test/x",
      message: "Vamos retomar o check-in no Stripe.",
    });
  });
});


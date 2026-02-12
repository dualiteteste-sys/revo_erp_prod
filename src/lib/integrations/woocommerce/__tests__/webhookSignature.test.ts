import { describe, expect, it } from "vitest";
import { hmacSha256Base64, verifyWooWebhookSignature } from "../webhookSignature";

describe("woocommerce webhook signature", () => {
  it("verifies a valid signature", async () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ id: 123, hello: "world" });
    const sig = await hmacSha256Base64(secret, rawBody);
    const ok = await verifyWooWebhookSignature({ secret, rawBody, signatureHeader: sig });
    expect(ok).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const secret = "whsec_test";
    const rawBody = JSON.stringify({ id: 123 });
    const ok = await verifyWooWebhookSignature({ secret, rawBody, signatureHeader: "invalid" });
    expect(ok).toBe(false);
  });
});


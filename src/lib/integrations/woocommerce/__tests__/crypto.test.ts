import { describe, expect, it } from "vitest";
import { aesGcmDecrypt, aesGcmEncrypt } from "../crypto";

describe("woocommerce crypto", () => {
  it("encrypt/decrypt roundtrip with aad", async () => {
    const masterKey = "test-master-key-1";
    const aad = "empresa:store";
    const plaintext = "ck_test_123";

    const ct = await aesGcmEncrypt({ masterKey, plaintext, aad });
    const back = await aesGcmDecrypt({ masterKey, ciphertext: ct, aad });

    expect(back).toBe(plaintext);
  });

  it("ciphertext changes across encryptions", async () => {
    const masterKey = "test-master-key-2";
    const plaintext = "cs_test_456";
    const ct1 = await aesGcmEncrypt({ masterKey, plaintext, aad: "a" });
    const ct2 = await aesGcmEncrypt({ masterKey, plaintext, aad: "a" });
    expect(ct1).not.toBe(ct2);
  });
});

import { describe, expect, it } from "vitest";

import { computeAuthCallbackRedirectToConfirmedFrom, computeCanonicalRedirectUrlFrom, getConfiguredSiteUrlFrom } from "../siteUrl";

describe("getConfiguredSiteUrlFrom", () => {
  it("prefers envUrl when provided", () => {
    expect(getConfiguredSiteUrlFrom({ envUrl: "https://ultria.com.br/" })).toBe("https://ultria.com.br");
  });

  it("falls back to origin", () => {
    expect(getConfiguredSiteUrlFrom({ envUrl: "", origin: "https://example.com/" })).toBe("https://example.com");
  });
});

describe("computeCanonicalRedirectUrlFrom", () => {
  it("redirects legacy domains to canonical, preserving path/query/hash", () => {
    expect(
      computeCanonicalRedirectUrlFrom({
        canonicalSiteUrl: "https://ultria.com.br",
        currentHref: "https://revoerp.com/auth/confirmed?code=abc#x",
      })
    ).toBe("https://ultria.com.br/auth/confirmed?code=abc#x");
  });

  it("does not redirect when already on canonical origin", () => {
    expect(
      computeCanonicalRedirectUrlFrom({
        canonicalSiteUrl: "https://ultria.com.br",
        currentHref: "https://ultria.com.br/auth/confirmed?code=abc",
      })
    ).toBeNull();
  });

  it("does not redirect on non-legacy domains", () => {
    expect(
      computeCanonicalRedirectUrlFrom({
        canonicalSiteUrl: "https://ultria.com.br",
        currentHref: "https://example.com/auth/confirmed?code=abc",
      })
    ).toBeNull();
  });
});

describe("computeAuthCallbackRedirectToConfirmedFrom", () => {
  it("rewrites root callbacks (code) to /auth/confirmed", () => {
    expect(
      computeAuthCallbackRedirectToConfirmedFrom({
        currentHref: "https://ultria.com.br/?code=abc&plan=pro#x",
      }),
    ).toBe("https://ultria.com.br/auth/confirmed?code=abc&plan=pro#x");
  });

  it("rewrites root callbacks (token_hash) to /auth/confirmed", () => {
    expect(
      computeAuthCallbackRedirectToConfirmedFrom({
        currentHref: "https://ultria.com.br/?token_hash=th&type=signup",
      }),
    ).toBe("https://ultria.com.br/auth/confirmed?token_hash=th&type=signup");
  });

  it("does nothing when no callback params exist", () => {
    expect(
      computeAuthCallbackRedirectToConfirmedFrom({
        currentHref: "https://ultria.com.br/",
      }),
    ).toBeNull();
  });

  it("does nothing outside root", () => {
    expect(
      computeAuthCallbackRedirectToConfirmedFrom({
        currentHref: "https://ultria.com.br/auth/login?code=abc",
      }),
    ).toBeNull();
  });
});

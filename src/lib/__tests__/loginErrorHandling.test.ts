import { describe, expect, it } from "vitest";

import { getLoginFailureMessage, isExpectedLoginFailure } from "@/lib/auth/loginError";

describe("loginError handling", () => {
  it("classifica credencial inválida como falha esperada", () => {
    expect(
      isExpectedLoginFailure({
        message: "Invalid login credentials",
        code: "invalid_credentials",
        status: 400,
      }),
    ).toBe(true);
  });

  it("classifica e-mail não confirmado como falha esperada", () => {
    expect(
      isExpectedLoginFailure({
        message: "Email not confirmed",
        status: 400,
      }),
    ).toBe(true);
  });

  it("não classifica erro inesperado como falha esperada", () => {
    expect(
      isExpectedLoginFailure({
        message: "TypeError: Failed to fetch",
        status: 0,
      }),
    ).toBe(false);
  });

  it("normaliza mensagem de credenciais inválidas para UX", () => {
    expect(
      getLoginFailureMessage({
        message: "Invalid login credentials",
      }),
    ).toBe("Credenciais inválidas. Verifique seu e-mail e senha.");
  });

  it("normaliza mensagem de e-mail não confirmado para UX", () => {
    expect(
      getLoginFailureMessage({
        message: "Email not confirmed",
      }),
    ).toBe("Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.");
  });
});

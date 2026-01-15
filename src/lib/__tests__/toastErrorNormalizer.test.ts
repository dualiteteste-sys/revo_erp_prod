import { describe, expect, it } from "vitest";
import { normalizeToastErrorMessage } from "../toastErrorNormalizer";

describe("normalizeToastErrorMessage", () => {
  it("keeps user-friendly portuguese messages", () => {
    const r = normalizeToastErrorMessage({ message: "Cliente é obrigatório." });
    expect(r.message).toBe("Cliente é obrigatório.");
  });

  it("normalizes HTTP_400 validation-ish messages", () => {
    const r = normalizeToastErrorMessage({ message: "HTTP_400: cliente_id é obrigatório." });
    expect(r.title).toBeTruthy();
    expect(r.message.toLowerCase()).toContain("obrigat");
    expect(r.message).not.toMatch(/HTTP_400/i);
  });

  it("normalizes invalid uuid", () => {
    const r = normalizeToastErrorMessage({ message: 'HTTP_400: invalid input syntax for type uuid: ""' });
    expect(r.title).toMatch(/Dados inválidos/i);
    expect(r.message).toMatch(/Atualize a página/i);
  });

  it("normalizes unique constraint", () => {
    const r = normalizeToastErrorMessage({
      message: 'HTTP_409: duplicate key value violates unique constraint "idx_fin_mov_empresa_origem_uniq"',
    });
    expect(r.title).toMatch(/Já existe|Conflito/i);
    expect(r.message).not.toMatch(/duplicate key/i);
  });

  it("normalizes missing rpc function", () => {
    const r = normalizeToastErrorMessage({
      message: "HTTP_404: Could not find the function public.financeiro_meios_pagamento_list in the schema cache",
    });
    expect(r.message).toMatch(/atualiza/i);
  });

  it("normalizes invalid transition", () => {
    const r = normalizeToastErrorMessage({ message: "HTTP_400: Transição inválida (planejada -> rascunho)." });
    expect(r.title).toMatch(/Ação não permitida/i);
  });
});


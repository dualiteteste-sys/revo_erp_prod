import { beforeEach, describe, expect, it, vi } from "vitest";

const callRpcMock = vi.fn();

vi.mock("@/lib/api", () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe("industria service", () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it("manageComponente(delete) não envia UUID vazio (\"\" -> null)", async () => {
    callRpcMock.mockResolvedValueOnce(null);
    const { manageComponente } = await import("./industria");

    await manageComponente("ordem-1", "", "", 0, "", "delete");

    expect(callRpcMock).toHaveBeenCalledWith(
      "industria_manage_componente",
      expect.objectContaining({
        p_ordem_id: "ordem-1",
        p_componente_id: null,
        p_produto_id: null,
        p_quantidade_planejada: null,
        p_unidade: null,
        p_action: "delete",
      })
    );
  });
});


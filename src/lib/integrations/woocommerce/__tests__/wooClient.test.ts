import { describe, expect, it, vi } from "vitest";
import { WooClient } from "../wooClient";

describe("WooClient", () => {
  it("paginates until empty/short page", async () => {
    const pages = [
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }],
    ];
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      const page = Number(u.searchParams.get("page") ?? 1);
      const data = pages[page - 1] ?? [];
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = new WooClient({
      baseUrl: "https://example.test",
      consumerKey: "ck",
      consumerSecret: "cs",
      authMode: "querystring_fallback",
      timeoutMs: 2_000,
      maxAttempts: 1,
    });

    const seen: number[] = [];
    for await (const item of client.paginate<{ id: number }>("products", { per_page: "2" })) {
      seen.push(item.id);
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalled();
  });
});

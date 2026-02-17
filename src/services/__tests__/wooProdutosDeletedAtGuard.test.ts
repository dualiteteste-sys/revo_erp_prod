import { describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

function assertNoProdutosDeletedAt(filePath: string) {
  const abs = path.resolve(process.cwd(), filePath);
  const src = fs.readFileSync(abs, "utf8");

  const fromProdutos = /\.from\((["'])produtos\1\)/g;
  const hits = Array.from(src.matchAll(fromProdutos));

  for (const hit of hits) {
    const start = hit.index ?? 0;
    const end = src.indexOf(";", start);
    const stmt = src.slice(start, end === -1 ? start + 4000 : end);
    expect(stmt).not.toContain('.is("deleted_at"');
    expect(stmt).not.toContain(".is('deleted_at'");
  }
}

describe("Woo export guard: produtos.deleted_at", () => {
  it("does not filter produtos by deleted_at (column does not exist)", () => {
    assertNoProdutosDeletedAt("supabase/functions/woocommerce-admin/index.ts");
    assertNoProdutosDeletedAt("supabase/functions/woocommerce-worker/index.ts");
    assertNoProdutosDeletedAt("supabase/functions/marketplaces-sync/index.ts");
  });
});


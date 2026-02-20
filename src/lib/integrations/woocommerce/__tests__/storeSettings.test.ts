import { describe, expect, it } from "vitest";
import {
  applyPercentAdjustment,
  computeEffectiveStock,
  normalizeWooStoreSettingsV1,
  pickWooStoreSettingsV1,
} from "../../../../../supabase/functions/_shared/woocommerceStoreSettings.ts";

describe("woocommerceStoreSettings", () => {
  it("normaliza stock_source/price_source com defaults", () => {
    const s1 = normalizeWooStoreSettingsV1({});
    expect(s1.stock_source).toBe("product");
    expect(s1.price_source).toBe("product");

    const s2 = normalizeWooStoreSettingsV1({
      deposito_id: "00000000-0000-0000-0000-000000000000",
      base_tabela_preco_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(s2.stock_source).toBe("deposit");
    expect(s2.price_source).toBe("price_table");
  });

  it("permite forcar product mesmo com ids configurados", () => {
    const s = normalizeWooStoreSettingsV1({
      stock_source: "product",
      deposito_id: "00000000-0000-0000-0000-000000000000",
      price_source: "product",
      base_tabela_preco_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(s.stock_source).toBe("product");
    expect(s.price_source).toBe("product");
  });

  it("pickWooStoreSettingsV1 prioriza store.settings quando tem valores", () => {
    const picked = pickWooStoreSettingsV1({
      storeSettings: { deposito_id: "00000000-0000-0000-0000-000000000000" },
      legacyConfig: { stock_source: "product" },
    });
    expect(picked.stock_source).toBe("deposit");
  });

  it("pickWooStoreSettingsV1 cai no legacyConfig quando store.settings nao tem valores", () => {
    const picked = pickWooStoreSettingsV1({
      storeSettings: {},
      legacyConfig: { base_tabela_preco_id: "00000000-0000-0000-0000-000000000000", price_source: "price_table" },
    });
    expect(picked.price_source).toBe("price_table");
  });

  it("computeEffectiveStock aplica estoque de seguranca e clamp >= 0", () => {
    expect(computeEffectiveStock({ rawStock: 10, stockSafetyQty: 2 })).toBe(8);
    expect(computeEffectiveStock({ rawStock: 1, stockSafetyQty: 5 })).toBe(0);
  });

  it("applyPercentAdjustment aplica percentuais", () => {
    expect(applyPercentAdjustment({ basePrice: 100, percent: 10 })).toBeCloseTo(110);
    expect(applyPercentAdjustment({ basePrice: 100, percent: -10 })).toBeCloseTo(90);
  });
});


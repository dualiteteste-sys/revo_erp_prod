export type WooStockSource = "product" | "deposit";
export type WooPriceSource = "product" | "price_table";

export type WooStoreSettingsV1 = {
  version: 1;
  stock_source: WooStockSource;
  deposito_id: string | null;
  stock_safety_qty: number;
  price_source: WooPriceSource;
  base_tabela_preco_id: string | null;
  price_percent_default: number;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeUuid(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  // Best-effort UUID check: keep lightweight (avoid regex heavy).
  if (v.length < 32) return null;
  return v;
}

function normalizeStockSource(value: unknown): WooStockSource | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "deposit" || v === "deposito") return "deposit";
  if (v === "product" || v === "produto") return "product";
  return null;
}

function normalizePriceSource(value: unknown): WooPriceSource | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "price_table" || v === "tabela_preco" || v === "tabela" || v === "table") return "price_table";
  if (v === "product" || v === "produto") return "product";
  return null;
}

export function normalizeWooStoreSettingsV1(input: unknown): WooStoreSettingsV1 {
  const obj = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const version = Number(obj.version);
  const deposito_id = normalizeUuid(obj.deposito_id);
  const base_tabela_preco_id = normalizeUuid(obj.base_tabela_preco_id);

  const stock_source = normalizeStockSource(obj.stock_source) ?? (deposito_id ? "deposit" : "product");
  const price_source = normalizePriceSource(obj.price_source) ?? (base_tabela_preco_id ? "price_table" : "product");

  return {
    version: version === 1 ? 1 : 1,
    stock_source,
    deposito_id,
    stock_safety_qty: clampNumber(obj.stock_safety_qty, 0, 0, 1_000_000),
    price_source,
    base_tabela_preco_id,
    price_percent_default: clampNumber(obj.price_percent_default, 0, -1000, 1000),
  };
}

export function deriveWooStoreSettingsV1FromEcommerceConfig(config: unknown): WooStoreSettingsV1 {
  const obj = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  return normalizeWooStoreSettingsV1({
    version: 1,
    stock_source: obj.stock_source,
    deposito_id: obj.deposito_id,
    stock_safety_qty: obj.stock_safety_qty,
    price_source: obj.price_source,
    base_tabela_preco_id: obj.base_tabela_preco_id,
    price_percent_default: obj.price_percent_default,
  });
}

export function pickWooStoreSettingsV1(params: {
  storeSettings?: unknown | null;
  legacyConfig?: unknown | null;
}): WooStoreSettingsV1 {
  const normalizedStore = normalizeWooStoreSettingsV1(params.storeSettings ?? {});
  const hasAnyStoreValue =
    normalizedStore.deposito_id != null ||
    normalizedStore.base_tabela_preco_id != null ||
    normalizedStore.stock_safety_qty !== 0 ||
    normalizedStore.price_percent_default !== 0;

  if (hasAnyStoreValue) return normalizedStore;
  return deriveWooStoreSettingsV1FromEcommerceConfig(params.legacyConfig ?? {});
}

export function computeEffectiveStock(params: { rawStock: number; stockSafetyQty: number }): number {
  const raw = Number(params.rawStock);
  const safety = Number(params.stockSafetyQty);
  if (!Number.isFinite(raw)) return 0;
  if (!Number.isFinite(safety) || safety <= 0) return Math.max(0, Math.trunc(raw));
  return Math.max(0, Math.trunc(raw - safety));
}

export function applyPercentAdjustment(params: { basePrice: number; percent: number }): number {
  const base = Number(params.basePrice);
  const pct = Number(params.percent);
  if (!Number.isFinite(base)) return 0;
  if (!Number.isFinite(pct) || pct === 0) return base;
  return base * (1 + pct / 100);
}


type WooMockResponse = { ok: boolean; status: number; data: any; headers?: Headers };

function parseBool(raw: string | null | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function nowIso() {
  return new Date().toISOString();
}

function fixtureProducts() {
  return [
    {
      id: 101,
      name: "Mock Produto A",
      sku: "MOCK-A",
      type: "simple",
      status: "publish",
      regular_price: "10.00",
      stock_quantity: 5,
      stock_status: "instock",
      date_modified_gmt: nowIso(),
    },
    {
      id: 102,
      name: "Mock Produto B (Variável)",
      sku: "MOCK-B",
      type: "variable",
      status: "publish",
      regular_price: "",
      stock_quantity: null,
      stock_status: "instock",
      date_modified_gmt: nowIso(),
    },
  ];
}

function fixtureVariations(productId: number) {
  if (productId !== 102) return [];
  return [
    {
      id: 201,
      sku: "MOCK-B-RED",
      regular_price: "12.00",
      stock_quantity: 3,
      stock_status: "instock",
      date_modified_gmt: nowIso(),
    },
    {
      id: 202,
      sku: "MOCK-B-BLUE",
      regular_price: "13.00",
      stock_quantity: 2,
      stock_status: "instock",
      date_modified_gmt: nowIso(),
    },
  ];
}

function fixtureOrder(orderId: number) {
  return {
    id: orderId,
    status: "processing",
    currency: "BRL",
    total: "42.30",
    date_modified_gmt: nowIso(),
    billing: { first_name: "Mock", last_name: "Cliente", email: "mock@example.com" },
    shipping: { first_name: "Mock", last_name: "Cliente" },
    line_items: [
      { id: 1, product_id: 101, variation_id: 0, sku: "MOCK-A", name: "Mock Produto A", quantity: 1, total: "10.00" },
    ],
    shipping_lines: [{ id: 1, method_id: "flat_rate", method_title: "Frete Mock", total: "5.00" }],
    payment_method: "woo-pagarme-payments-pix",
    payment_method_title: "Pix",
    meta_data: [],
  };
}

function toPaged<T>(items: T[], perPage: number, page: number): T[] {
  const safePer = Math.max(1, Math.min(100, Math.trunc(Number(perPage) || 10)));
  const safePage = Math.max(1, Math.trunc(Number(page) || 1));
  const start = (safePage - 1) * safePer;
  return items.slice(start, start + safePer);
}

export function maybeHandleWooMockRequest(input: {
  url: string;
  init?: RequestInit;
  getEnv: (key: string) => string | null | undefined;
}): WooMockResponse | null {
  const supabaseUrl = String(input.getEnv("SUPABASE_URL") ?? "").trim();
  const internalHostPort = String(input.getEnv("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim();
  const isLocal = Boolean(internalHostPort) || supabaseUrl.startsWith("http://kong:") || supabaseUrl.includes("127.0.0.1");

  // In local dev, Supabase Edge Runtime may not inject custom env vars into user functions.
  // So we auto-enable the mock when running locally AND the request targets the mock origin.
  const mockEnabled = parseBool(input.getEnv("WOOCOMMERCE_MOCK_MODE")) || isLocal;
  if (!mockEnabled) return null;

  const baseRaw = String(input.getEnv("WOOCOMMERCE_MOCK_BASE_URL") ?? "https://woo-mock.ultria.invalid").trim();
  let baseOrigin = "";
  try {
    baseOrigin = new URL(baseRaw).origin;
  } catch {
    baseOrigin = "https://woo-mock.ultria.invalid";
  }

  const u = new URL(input.url);
  if (u.origin !== baseOrigin) return null;

  const path = u.pathname;
  if ((path === "/wp-json" || path === "/wp-json/") && (input.init?.method ?? "GET").toUpperCase() === "GET") {
    const headers = new Headers({ "content-type": "application/json" });
    return {
      ok: true,
      status: 200,
      data: {
        name: "Ultria Woo Mock",
        namespaces: ["wc/v3", "wp/v2"],
      },
      headers,
    };
  }

  const v3Prefix = "/wp-json/wc/v3/";
  const idx = path.indexOf(v3Prefix);
  if (idx === -1) return { ok: false, status: 404, data: { message: "mock: not wc/v3" }, headers: new Headers() };

  const resource = path.slice(idx + v3Prefix.length).replace(/^\/+/, "");
  const parts = resource.split("/").filter(Boolean);

  const headers = new Headers({ "content-type": "application/json" });

  // GET system_status
  if (parts[0] === "system_status" && parts.length === 1 && (input.init?.method ?? "GET").toUpperCase() === "GET") {
    return {
      ok: true,
      status: 200,
      data: {
        environment: { version: "9.9.9-mock" },
        settings: {},
        database: {},
      },
      headers,
    };
  }

  // GET products
  if (parts[0] === "products" && parts.length === 1 && (input.init?.method ?? "GET").toUpperCase() === "GET") {
    const all = fixtureProducts();
    const search = String(u.searchParams.get("search") ?? "").trim().toLowerCase();
    const filtered = search
      ? all.filter((p) => String(p.name).toLowerCase().includes(search) || String(p.sku).toLowerCase().includes(search))
      : all;
    const per = Number(u.searchParams.get("per_page") ?? "10");
    const page = Number(u.searchParams.get("page") ?? "1");
    return { ok: true, status: 200, data: toPaged(filtered, per, page), headers };
  }

  // GET products/{id}
  if (parts[0] === "products" && parts.length === 2 && (input.init?.method ?? "GET").toUpperCase() === "GET") {
    const id = Number(parts[1]);
    const found = fixtureProducts().find((p) => Number(p.id) === id);
    if (!found) return { ok: false, status: 404, data: { message: "mock: product not found" }, headers };
    return { ok: true, status: 200, data: found, headers };
  }

  // GET products/{id}/variations
  if (parts[0] === "products" && parts[2] === "variations" && parts.length === 3 && (input.init?.method ?? "GET").toUpperCase() === "GET") {
    const productId = Number(parts[1]);
    const all = fixtureVariations(productId);
    const per = Number(u.searchParams.get("per_page") ?? "10");
    const page = Number(u.searchParams.get("page") ?? "1");
    return { ok: true, status: 200, data: toPaged(all, per, page), headers };
  }

  // POST products/batch (create/update)
  if (parts[0] === "products" && parts[1] === "batch" && parts.length === 2 && (input.init?.method ?? "POST").toUpperCase() === "POST") {
    // We don't persist; return plausible "created/updated" arrays.
    return { ok: true, status: 200, data: { create: [], update: [], delete: [] }, headers };
  }

  // POST products/{id}/variations/batch
  if (parts[0] === "products" && parts[2] === "variations" && parts[3] === "batch" && parts.length === 4) {
    return { ok: true, status: 200, data: { create: [], update: [], delete: [] }, headers };
  }

  // GET orders/{id}
  if (parts[0] === "orders" && parts.length === 2 && (input.init?.method ?? "GET").toUpperCase() === "GET") {
    const id = Number(parts[1]);
    if (!Number.isFinite(id) || id <= 0) return { ok: false, status: 400, data: { message: "mock: invalid order id" }, headers };
    return { ok: true, status: 200, data: fixtureOrder(id), headers };
  }

  // GET orders
  if (parts[0] === "orders" && parts.length === 1 && (input.init?.method ?? "GET").toUpperCase() === "GET") {
    const per = Number(u.searchParams.get("per_page") ?? "10");
    const page = Number(u.searchParams.get("page") ?? "1");
    const list = [fixtureOrder(3001), fixtureOrder(3002), fixtureOrder(3003)];
    return { ok: true, status: 200, data: toPaged(list, per, page), headers };
  }

  // POST webhooks
  if (parts[0] === "webhooks" && (input.init?.method ?? "POST").toUpperCase() === "POST") {
    return {
      ok: true,
      status: 201,
      data: { id: 9001, name: "mock webhook", status: "active", delivery_url: "mock", created_at: nowIso() },
      headers,
    };
  }

  return { ok: false, status: 404, data: { message: "mock: unhandled endpoint", path: resource }, headers };
}

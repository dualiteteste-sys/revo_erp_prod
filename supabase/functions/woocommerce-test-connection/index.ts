import { buildCorsHeaders } from "../_shared/cors.ts";

type TestRequest = {
  store_url: string;
  consumer_key: string;
  consumer_secret: string;
};

function normalizeStoreUrl(input: string): string {
  const raw = (input || "").trim();
  if (!raw) throw new Error("store_url_required");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("store_url_invalid");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("store_url_invalid");
  url.hash = "";
  url.search = "";
  // remove trailing slash for consistent requests
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function basicAuthHeader(consumerKey: string, consumerSecret: string): string {
  const ck = (consumerKey || "").trim();
  const cs = (consumerSecret || "").trim();
  if (!ck || !cs) throw new Error("credentials_required");
  return `Basic ${btoa(`${ck}:${cs}`)}`;
}

function okJson(body: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function errorJson(
  code: string,
  message: string,
  cors: Record<string, string>,
  status = 400,
  details?: unknown,
) {
  const body: Record<string, unknown> = { ok: false, error: code, message };
  if (typeof details !== "undefined") body.details = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return errorJson("method_not_allowed", "Use POST.", cors, 405);

  try {
    const payload = (await req.json()) as Partial<TestRequest>;
    const storeUrl = normalizeStoreUrl(payload.store_url || "");
    const auth = basicAuthHeader(payload.consumer_key || "", payload.consumer_secret || "");

    // Prefer a lightweight endpoint that doesn't leak data.
    const endpoints = [
      "/wp-json/wc/v3/system_status",
      "/wp-json/wc/v3/products?per_page=1",
    ];

    let lastError: unknown = null;
    for (const path of endpoints) {
      try {
        const res = await fetch(`${storeUrl}${path}`, {
          method: "GET",
          headers: {
            "Authorization": auth,
            "Accept": "application/json",
            "User-Agent": "UltriaERP/woocommerce-test-connection",
          },
        });

        const text = await res.text();
        if (!res.ok) {
          lastError = { status: res.status, body: text.slice(0, 800) };
          continue;
        }

        return okJson(
          {
            ok: true,
            status: "connected",
            store_url: storeUrl,
            message: "Conexão com WooCommerce validada com sucesso.",
            http_status: res.status,
            endpoint: path,
          },
          cors,
        );
      } catch (e) {
        lastError = { error: e instanceof Error ? e.message : String(e || "") };
      }
    }

    return errorJson(
      "woo_connection_failed",
      "Não foi possível validar a conexão com o WooCommerce. Verifique URL/credenciais e permissões da chave.",
      cors,
      400,
      lastError,
    );
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e || "")).trim();
    if (msg === "store_url_required") return errorJson("store_url_required", "Informe a URL da loja.", cors, 400);
    if (msg === "store_url_invalid") return errorJson("store_url_invalid", "URL da loja inválida.", cors, 400);
    if (msg === "credentials_required") return errorJson("credentials_required", "Informe Consumer Key e Consumer Secret.", cors, 400);
    return errorJson("internal_server_error", "Falha interna ao testar conexão.", cors, 500);
  }
});

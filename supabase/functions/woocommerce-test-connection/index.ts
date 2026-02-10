import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type TestRequest = {
  ecommerce_id?: string;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return errorJson("environment_not_configured", "Configuração do Supabase incompleta.", cors, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return errorJson("not_signed_in", "Autenticação obrigatória.", cors, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return errorJson("invalid_token", "Token inválido.", cors, 401);

    const payload = (await req.json().catch(() => ({}))) as Partial<TestRequest>;
    const ecommerceId = String(payload.ecommerce_id || "").trim();
    if (!ecommerceId) return errorJson("ecommerce_id_required", "Informe a conexão Woo para teste.", cors, 400);

    const { data: canManage, error: permErr } = await userClient.rpc("has_permission_for_current_user", {
      p_module: "ecommerce",
      p_action: "manage",
    });
    if (permErr || canManage !== true) return errorJson("forbidden", "Sem permissão para testar integração.", cors, 403);

    const { data: ctx, error: ctxErr } = await userClient.rpc("ecommerce_woo_connection_context", {
      p_ecommerce_id: ecommerceId,
    });
    if (ctxErr) return errorJson("context_unavailable", "Não foi possível carregar contexto da conexão Woo.", cors, 400, ctxErr.message);

    const context = Array.isArray(ctx) ? (ctx[0] ?? null) : ctx;
    if (!context?.empresa_id || !context?.ecommerce_id) {
      return errorJson("connection_not_found", "Conexão Woo não encontrada para a empresa ativa.", cors, 404);
    }

    const storeUrl = normalizeStoreUrl(String(context.store_url || ""));
    const { data: secretRow, error: secretErr } = await adminClient
      .from("ecommerce_connection_secrets")
      .select("woo_consumer_key, woo_consumer_secret")
      .eq("empresa_id", context.empresa_id)
      .eq("ecommerce_id", context.ecommerce_id)
      .maybeSingle();
    if (secretErr) {
      return errorJson("secrets_unavailable", "Falha ao carregar credenciais salvas para teste.", cors, 500, secretErr.message);
    }

    const consumerKey = String((secretRow as any)?.woo_consumer_key || "");
    const consumerSecret = String((secretRow as any)?.woo_consumer_secret || "");
    const auth = basicAuthHeader(consumerKey, consumerSecret);

    // Prefer a lightweight endpoint that doesn't leak data.
    const endpoints = [
      "/wp-json/wc/v3/system_status",
      "/wp-json/wc/v3/products?per_page=1",
    ];

    let lastError: unknown = null;
    const startedAt = Date.now();
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

        const latencyMs = Date.now() - startedAt;
        await adminClient.rpc("ecommerce_woo_record_connection_check", {
          p_ecommerce_id: context.ecommerce_id,
          p_status: "connected",
          p_error: null,
          p_http_status: res.status,
          p_endpoint: path,
          p_latency_ms: latencyMs,
        });

        return okJson(
          {
            ok: true,
            status: "connected",
            store_url: storeUrl,
            message: "Conexão com WooCommerce validada com sucesso.",
            http_status: res.status,
            endpoint: path,
            last_verified_at: new Date().toISOString(),
            latency_ms: latencyMs,
          },
          cors,
        );
      } catch (e) {
        lastError = { error: e instanceof Error ? e.message : String(e || "") };
      }
    }

    const finalHttpStatus = typeof (lastError as any)?.status === "number" ? (lastError as any).status : null;
    const finalMessage = "Não foi possível validar a conexão com o WooCommerce. Verifique URL/credenciais e permissões da chave.";
    await adminClient.rpc("ecommerce_woo_record_connection_check", {
      p_ecommerce_id: context.ecommerce_id,
      p_status: "error",
      p_error: finalMessage,
      p_http_status: finalHttpStatus,
      p_endpoint: null,
      p_latency_ms: Date.now() - startedAt,
    });

    return errorJson(
      "woo_connection_failed",
      finalMessage,
      cors,
      400,
      lastError,
    );
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e || "")).trim();
    if (msg === "store_url_required") return errorJson("store_url_required", "Informe a URL da loja.", cors, 400);
    if (msg === "store_url_invalid") return errorJson("store_url_invalid", "URL da loja inválida.", cors, 400);
    if (msg === "credentials_required") return errorJson("credentials_required", "Credenciais Woo não encontradas. Salve Consumer Key/Secret antes de testar.", cors, 400);
    return errorJson("internal_server_error", "Falha interna ao testar conexão.", cors, 500);
  }
});

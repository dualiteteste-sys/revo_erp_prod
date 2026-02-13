import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type TestRequest = {
  ecommerce_id?: string;
};

type PersistCheckParams = {
  ecommerceId: string;
  empresaId: string;
  status: "pending" | "connected" | "error";
  error: string | null;
  httpStatus: number | null;
  endpoint: string | null;
  latencyMs: number | null;
};

async function persistConnectionCheck(
  adminClient: ReturnType<typeof createClient>,
  params: PersistCheckParams,
): Promise<{ ok: true; fallbackUsed: boolean } | { ok: false; reason: string }> {
  const { error: rpcErr } = await adminClient.rpc("ecommerce_woo_record_connection_check", {
    p_ecommerce_id: params.ecommerceId,
    p_status: params.status,
    p_error: params.error,
    p_http_status: params.httpStatus,
    p_endpoint: params.endpoint,
    p_latency_ms: params.latencyMs,
  });
  if (!rpcErr) return { ok: true, fallbackUsed: false };

  console.error("[woo-test-connection] ecommerce_woo_record_connection_check failed, using fallback", {
    ecommerce_id: params.ecommerceId,
    status: params.status,
    rpc_error: rpcErr.message,
  });

  const nowIso = new Date().toISOString();
  const normalizedStatus = params.status === "connected" ? "connected" : params.status === "error" ? "error" : "pending";
  const ecommercesPatch: Record<string, unknown> = {
    status: normalizedStatus,
    last_error: params.status === "connected" ? null : params.error,
    updated_at: nowIso,
  };
  if (params.status === "connected") ecommercesPatch.connected_at = nowIso;
  const { error: ecommercesErr } = await adminClient
    .from("ecommerces")
    .update(ecommercesPatch)
    .eq("id", params.ecommerceId)
    .eq("empresa_id", params.empresaId)
    .eq("provider", "woo");
  if (ecommercesErr) {
    return { ok: false, reason: `rpc_error=${rpcErr.message}; fallback_ecommerces_error=${ecommercesErr.message}` };
  }

  const { error: secretsErr } = await adminClient
    .from("ecommerce_connection_secrets")
    .upsert({
      empresa_id: params.empresaId,
      ecommerce_id: params.ecommerceId,
      woo_last_verified_at: nowIso,
      woo_connection_status: params.status,
      woo_connection_error: params.status === "connected" ? null : params.error,
      woo_last_http_status: params.httpStatus,
      woo_last_endpoint: params.endpoint,
      woo_last_latency_ms: params.latencyMs,
      updated_at: nowIso,
    }, { onConflict: "ecommerce_id" });
  if (secretsErr) {
    return { ok: false, reason: `rpc_error=${rpcErr.message}; fallback_secrets_error=${secretsErr.message}` };
  }

  return { ok: true, fallbackUsed: true };
}

function normalizeStoreUrl(input: string): string {
  const raw = (input || "").trim();
  if (!raw) throw new Error("store_url_required");

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
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

    const requestId = (req.headers.get("x-revo-request-id") ?? "").trim();

    // Base client (no tenant header yet): used only to validate JWT and resolve empresa ativa when header is missing.
    const baseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(requestId ? { "x-revo-request-id": requestId } : {}),
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await baseUserClient.auth.getUser();
    if (userErr || !userData?.user) return errorJson("invalid_token", "Token inválido.", cors, 401);

    // Multi-tenant: Edge Functions must propagate tenant context to PostgREST/RPC calls.
    // Tenant source of truth is the request header `x-empresa-id`. When missing, we resolve the user's active empresa
    // server-side (fail-closed if none), then proceed with a tenant-scoped client.
    let empresaId = (req.headers.get("x-empresa-id") ?? "").trim();
    if (!empresaId) {
      const { data: activeEmpresaId, error: activeErr } = await baseUserClient.rpc("active_empresa_get_for_current_user", {});
      if (activeErr || !activeEmpresaId) {
        return errorJson(
          "empresa_id_required",
          "Tenant não identificado. Selecione uma empresa ativa e recarregue a página para testar a conexão.",
          cors,
          400,
        );
      }
      empresaId = String(activeEmpresaId).trim();
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-empresa-id": empresaId,
          ...(requestId ? { "x-revo-request-id": requestId } : {}),
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

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

    // 1) Detect WordPress (without auth). This avoids confusing "credentials" errors when the URL isn't WP.
    try {
      const wpStartedAt = Date.now();
      const wpRes = await fetch(`${storeUrl}/wp-json/`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "UltriaERP/woocommerce-test-connection",
        },
      });
      // Some sites may protect wp-json with auth; in that case we still try Woo endpoints below.
      if (!wpRes.ok && wpRes.status !== 401 && wpRes.status !== 403) {
        const latencyMs = Date.now() - wpStartedAt;
        const persistResult = await persistConnectionCheck(adminClient, {
          ecommerceId: String(context.ecommerce_id),
          empresaId: String(context.empresa_id),
          status: "error",
          error: "WordPress/WooCommerce não detectado na URL informada (wp-json indisponível).",
          httpStatus: wpRes.status,
          endpoint: "/wp-json/",
          latencyMs,
        });
        if (!persistResult.ok) {
          return errorJson(
            "status_persistence_failed",
            "Falha ao persistir diagnóstico da conexão Woo no ERP.",
            cors,
            500,
            { persistence_error: persistResult.reason },
          );
        }
        return errorJson(
          "wordpress_not_detected",
          "Não foi possível detectar WordPress/WooCommerce na URL informada. Verifique se a URL está correta e se o site responde em /wp-json/.",
          cors,
          400,
          { status: wpRes.status, endpoint: "/wp-json/" },
        );
      }
    } catch {
      // Best-effort: if /wp-json/ is blocked by network rules we still try Woo endpoints below.
    }

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

        if (!res.ok) {
          lastError = { status: res.status, endpoint: path };
          continue;
        }

        const latencyMs = Date.now() - startedAt;
        const persistResult = await persistConnectionCheck(adminClient, {
          ecommerceId: String(context.ecommerce_id),
          empresaId: String(context.empresa_id),
          status: "connected",
          error: null,
          httpStatus: res.status,
          endpoint: path,
          latencyMs,
        });
        if (!persistResult.ok) {
          return errorJson(
            "status_persistence_failed",
            "Conexão Woo validada, mas o ERP não conseguiu salvar o status. Verifique logs da função e permissões/RPC.",
            cors,
            500,
            { persistence_error: persistResult.reason },
          );
        }

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
            persistence_fallback: persistResult.fallbackUsed,
          },
          cors,
        );
      } catch (e) {
        lastError = { error: e instanceof Error ? e.message : String(e || "") };
      }
    }

    const finalHttpStatus = typeof (lastError as any)?.status === "number" ? (lastError as any).status : null;
    const finalMessage =
      finalHttpStatus === 401 || finalHttpStatus === 403
        ? "Credenciais inválidas ou sem permissão. Gere uma Consumer Key/Secret com acesso de leitura (ou leitura/escrita) e tente novamente."
        : finalHttpStatus === 404
          ? "WooCommerce não detectado (endpoint da API REST não encontrado). Verifique se o WooCommerce está ativo e se a API REST está habilitada."
          : "Não foi possível validar a conexão com o WooCommerce. Verifique URL/credenciais e permissões da chave.";
    const persistResult = await persistConnectionCheck(adminClient, {
      ecommerceId: String(context.ecommerce_id),
      empresaId: String(context.empresa_id),
      status: "error",
      error: finalMessage,
      httpStatus: finalHttpStatus,
      endpoint: null,
      latencyMs: Date.now() - startedAt,
    });
    if (!persistResult.ok) {
      return errorJson(
        "status_persistence_failed",
        "Falha ao persistir erro de conexão Woo no ERP.",
        cors,
        500,
        { persistence_error: persistResult.reason, lastError },
      );
    }

    return errorJson(
      "woo_connection_failed",
      finalMessage,
      cors,
      400,
      { ...((lastError && typeof lastError === "object") ? lastError as Record<string, unknown> : { lastError }), persistence_fallback: persistResult.fallbackUsed },
    );
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e || "")).trim();
    if (msg === "store_url_required") return errorJson("store_url_required", "Informe a URL da loja.", cors, 400);
    if (msg === "store_url_invalid") return errorJson("store_url_invalid", "URL da loja inválida.", cors, 400);
    if (msg === "credentials_required") return errorJson("credentials_required", "Credenciais Woo não encontradas. Salve Consumer Key/Secret antes de testar.", cors, 400);
    return errorJson("internal_server_error", "Falha interna ao testar conexão.", cors, 500);
  }
});

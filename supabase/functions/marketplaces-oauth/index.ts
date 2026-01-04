import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SITE_URL = (Deno.env.get("SITE_URL") ?? "").trim(); // ex: https://app.seudominio.com

const MELI_CLIENT_ID = (Deno.env.get("MELI_CLIENT_ID") ?? "").trim();
const MELI_CLIENT_SECRET = (Deno.env.get("MELI_CLIENT_SECRET") ?? "").trim();

type StartBody = {
  action?: "start";
  provider?: "meli" | "shopee";
  redirect_to?: string;
};

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function redirect(location: string, headers: Record<string, string>) {
  return new Response(null, { status: 302, headers: { ...headers, Location: location } });
}

function safeRedirectUrl(fallback: string, requested?: string | null): string {
  const raw = (requested ?? "").trim();
  if (!raw) return fallback;
  // Aceita relativo ("/app/...") ou absoluto no mesmo host do SITE_URL (quando definido).
  if (raw.startsWith("/")) return raw;
  if (SITE_URL) {
    try {
      const base = new URL(SITE_URL);
      const target = new URL(raw);
      if (target.origin === base.origin) return target.toString();
    } catch {
      // ignore
    }
  }
  return fallback;
}

function buildCallbackUrl(req: Request, provider: string): string {
  const url = new URL(req.url);
  url.searchParams.set("provider", provider);
  return url.toString();
}

function meliAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function meliExchangeCode(params: { code: string; redirectUri: string }) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", MELI_CLIENT_ID);
  body.set("client_secret", MELI_CLIENT_SECRET);
  body.set("code", params.code);
  body.set("redirect_uri", params.redirectUri);

  const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") ?? "").toLowerCase();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // ---------------------------------------------------------------------------
  // Callback (GET): chamado pelo canal, sem auth
  // ---------------------------------------------------------------------------
  if (req.method === "GET") {
    if (provider !== "meli" && provider !== "shopee") return redirect("/app/configuracoes/ecommerce/marketplaces?oauth=error&reason=invalid_provider", cors);

    const code = (url.searchParams.get("code") ?? "").trim();
    const state = (url.searchParams.get("state") ?? "").trim();
    const fallback = SITE_URL ? `${SITE_URL}/app/configuracoes/ecommerce/marketplaces` : "/app/configuracoes/ecommerce/marketplaces";

    if (!state) return redirect(`${fallback}?oauth=error&reason=missing_state&provider=${provider}`, cors);
    if (!code && provider === "meli") return redirect(`${fallback}?oauth=error&reason=missing_code&provider=${provider}`, cors);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: stRow } = await admin
      .from("ecommerce_oauth_states")
      .select("id,empresa_id,ecommerce_id,provider,user_id,state,redirect_to,consumed_at")
      .eq("provider", provider)
      .eq("state", state)
      .maybeSingle();

    const redirectTo = safeRedirectUrl(fallback, stRow?.redirect_to ?? null);
    if (!stRow?.id || stRow?.consumed_at) {
      return redirect(`${redirectTo}?oauth=error&reason=invalid_or_consumed_state&provider=${provider}`, cors);
    }

    if (provider === "shopee") {
      await admin.from("ecommerce_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", stRow.id);
      return redirect(`${redirectTo}?oauth=error&reason=not_implemented&provider=shopee`, cors);
    }

    if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) {
      return redirect(`${redirectTo}?oauth=error&reason=missing_meli_secrets&provider=meli`, cors);
    }

    const redirectUri = buildCallbackUrl(req, provider);
    const ex = await meliExchangeCode({ code, redirectUri });
    if (!ex.ok) {
      await admin.from("ecommerces").update({ status: "error", last_error: JSON.stringify(ex.data).slice(0, 900) }).eq("id", stRow.ecommerce_id);
      await admin.from("ecommerce_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", stRow.id);
      return redirect(`${redirectTo}?oauth=error&reason=token_exchange_failed&provider=meli`, cors);
    }

    const accessToken = (ex.data?.access_token ?? "") as string;
    const refreshToken = (ex.data?.refresh_token ?? "") as string;
    const expiresIn = Number(ex.data?.expires_in ?? 0);
    const userId = ex.data?.user_id != null ? String(ex.data.user_id) : null;
    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const tokenScopes = ex.data?.scope != null ? String(ex.data.scope) : null;
    const tokenType = ex.data?.token_type != null ? String(ex.data.token_type) : null;

    await admin.from("ecommerce_connection_secrets").upsert(
      {
        empresa_id: stRow.empresa_id,
        ecommerce_id: stRow.ecommerce_id,
        access_token: accessToken || null,
        refresh_token: refreshToken || null,
        token_expires_at: expiresAt,
        token_scopes: tokenScopes,
        token_type: tokenType,
      },
      { onConflict: "ecommerce_id" },
    );

    await admin.from("ecommerces").update({
      status: "connected",
      external_account_id: userId,
      connected_at: new Date().toISOString(),
      last_error: null,
      last_sync_at: null,
    }).eq("id", stRow.ecommerce_id);

    if (userId) {
      const { data: acct } = await admin.from("ecommerce_accounts").upsert(
        {
          empresa_id: stRow.empresa_id,
          ecommerce_id: stRow.ecommerce_id,
          provider: "meli",
          external_account_id: userId,
          nome: "Conta Mercado Livre",
          connected_at: new Date().toISOString(),
          meta: { user_id: userId },
        },
        { onConflict: "ecommerce_id,external_account_id" }
      ).select("id").maybeSingle();

      if (acct?.id) {
        await admin.from("ecommerces").update({ active_account_id: acct.id }).eq("id", stRow.ecommerce_id);
      }
    }

    await admin.from("ecommerce_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", stRow.id);
    return redirect(`${redirectTo}?oauth=success&provider=meli`, cors);
  }

  // ---------------------------------------------------------------------------
  // Start (POST): chamado pelo app com JWT; retorna URL de autorização
  // ---------------------------------------------------------------------------
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const body = (await req.json().catch(() => ({}))) as StartBody;
  const p = (body.provider ?? provider ?? "").toLowerCase();
  if (p !== "meli" && p !== "shopee") return json(400, { ok: false, error: "INVALID_PROVIDER" }, cors);

  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: me } = await user.auth.getUser();
  if (!me?.user?.id) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const fallback = SITE_URL ? `${SITE_URL}/app/configuracoes/ecommerce/marketplaces` : "/app/configuracoes/ecommerce/marketplaces";
  const redirectTo = safeRedirectUrl(fallback, body.redirect_to ?? null);

  const { data: st, error: stErr } = await user.rpc("ecommerce_oauth_create_state", {
    p_provider: p,
    p_redirect_to: redirectTo,
  });
  if (stErr || !st?.state) {
    return json(403, { ok: false, error: "FORBIDDEN_OR_STATE_FAILED", details: stErr?.message }, cors);
  }

  const redirectUri = buildCallbackUrl(req, p);

  if (p === "meli") {
    if (!MELI_CLIENT_ID) return json(500, { ok: false, error: "MISSING_MELI_CLIENT_ID" }, cors);
    const authUrl = meliAuthUrl(MELI_CLIENT_ID, redirectUri, st.state as string);
    return json(200, { ok: true, provider: "meli", url: authUrl }, cors);
  }

  // Shopee: esqueleto (a URL/parametrização varia conforme SDK/contrato do parceiro)
  return json(501, { ok: false, provider: "shopee", error: "NOT_IMPLEMENTED_YET", hint: "SHO-01 será implementado após definição de credenciais/fluxo Shopee." }, cors);
});

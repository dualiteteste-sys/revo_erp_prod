/**
 * shopee-admin — Interactive Shopee operations for authenticated users
 *
 * Actions (MVP):
 *   - account.info: GET /shop/get_shop_info
 *   - health.check: test API + return job stats
 *   - sync.stock: single item stock push
 *   - sync.stock.batch: batch stock push (up to 50)
 *   - sync.price: single item price push
 *   - sync.price.batch: batch price push (up to 50)
 *
 * Auth: JWT + x-empresa-id header + ecommerce:manage permission
 */

import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";
import { trackRequestId } from "../_shared/request.ts";
import {
  buildShopeeUrl,
  shopeeFetchJson,
  shopeePostJson,
  refreshShopeeToken,
} from "../_shared/shopeeHardening.ts";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHOPEE_PARTNER_ID = Deno.env.get("SHOPEE_PARTNER_ID") ?? "";
const SHOPEE_PARTNER_KEY = Deno.env.get("SHOPEE_PARTNER_KEY") ?? "";

type AdminAction =
  | "account.info"
  | "health.check"
  | "sync.stock"
  | "sync.stock.batch"
  | "sync.price"
  | "sync.price.batch";

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Token management (same as worker but loads from connection)
// ---------------------------------------------------------------------------
async function ensureToken(admin: any, ecommerceId: string): Promise<{ accessToken: string; shopId: string }> {
  const { data: sec } = await admin
    .from("ecommerce_connection_secrets")
    .select("access_token,refresh_token,token_expires_at")
    .eq("ecommerce_id", ecommerceId)
    .maybeSingle();

  const { data: conn } = await admin
    .from("ecommerces")
    .select("external_account_id")
    .eq("id", ecommerceId)
    .maybeSingle();

  const shopId = conn?.external_account_id ? String(conn.external_account_id) : "";
  if (!shopId) throw new Error("MISSING_SHOP_ID");

  let accessToken = sec?.access_token ? String(sec.access_token) : "";
  const refreshTokenStr = sec?.refresh_token ? String(sec.refresh_token) : "";
  const expiresAt = sec?.token_expires_at ? new Date(sec.token_expires_at) : null;
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() + 10 * 60 * 1000 : false;

  if ((!accessToken || expired) && refreshTokenStr) {
    const r = await refreshShopeeToken({
      partnerId: SHOPEE_PARTNER_ID,
      partnerKey: SHOPEE_PARTNER_KEY,
      refreshToken: refreshTokenStr,
      shopId,
    });
    if (!r.ok) throw new Error(`TOKEN_REFRESH_FAILED:${r.status}`);
    accessToken = String(r.data?.access_token ?? "");
    const newRefresh = String(r.data?.refresh_token ?? refreshTokenStr);
    const expiresIn = Number(r.data?.expire_in ?? 0);
    const newExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    await admin.from("ecommerce_connection_secrets").upsert(
      { ecommerce_id: ecommerceId, access_token: accessToken || null, refresh_token: newRefresh || null, token_expires_at: newExpiresAt },
      { onConflict: "ecommerce_id" },
    );
  }

  if (!accessToken) throw new Error("NO_ACCESS_TOKEN");
  return { accessToken, shopId };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  trackRequestId(req);
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  // Auth
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const empresaId = (req.headers.get("x-empresa-id") ?? "").trim();
  if (!empresaId) return json(400, { ok: false, error: "MISSING_EMPRESA" }, cors);

  // Verify user
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: me } = await user.auth.getUser();
  if (!me?.user?.id) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" }, cors);
  }

  const action = String(body.action ?? "").trim() as AdminAction;
  const ecommerceId = String(body.ecommerce_id ?? "").trim();
  if (!action) return json(400, { ok: false, error: "MISSING_ACTION" }, cors);
  if (!ecommerceId) return json(400, { ok: false, error: "MISSING_ECOMMERCE_ID" }, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify connection belongs to empresa
  const { data: connCheck } = await admin
    .from("ecommerces")
    .select("id")
    .eq("id", ecommerceId)
    .eq("empresa_id", empresaId)
    .eq("provider", "shopee")
    .maybeSingle();
  if (!connCheck) return json(403, { ok: false, error: "CONNECTION_NOT_FOUND" }, cors);

  try {
    const { accessToken, shopId } = await ensureToken(admin, ecommerceId);

    switch (action) {
      case "account.info": {
        const url = await buildShopeeUrl({
          path: "/api/v2/shop/get_shop_info",
          partnerId: SHOPEE_PARTNER_ID,
          partnerKey: SHOPEE_PARTNER_KEY,
          accessToken,
          shopId,
        });
        const r = await shopeeFetchJson(url);
        return json(r.ok ? 200 : 502, { ok: r.ok, data: r.data?.response ?? r.data }, cors);
      }

      case "health.check": {
        // Test API access
        const url = await buildShopeeUrl({
          path: "/api/v2/shop/get_shop_info",
          partnerId: SHOPEE_PARTNER_ID,
          partnerKey: SHOPEE_PARTNER_KEY,
          accessToken,
          shopId,
        });
        const r = await shopeeFetchJson(url);

        // Get job stats
        const { data: summary } = await admin.rpc("ecommerce_health_summary", {});
        return json(200, {
          ok: r.ok,
          api_status: r.ok ? "connected" : "error",
          shop: r.data?.response ?? null,
          health: summary ?? null,
        }, cors);
      }

      case "sync.stock": {
        const anuncioId = String(body.anuncio_id ?? "").trim();
        if (!anuncioId) return json(400, { ok: false, error: "MISSING_ANUNCIO_ID" }, cors);

        const { data: a } = await admin
          .from("produto_anuncios")
          .select("id,produto_id,identificador_externo")
          .eq("id", anuncioId)
          .eq("empresa_id", empresaId)
          .maybeSingle();
        if (!a?.identificador_externo) return json(404, { ok: false, error: "ANUNCIO_NOT_FOUND" }, cors);

        const { data: prod } = await admin.from("produtos").select("estoque_disponivel,estoque_atual").eq("id", a.produto_id).maybeSingle();
        const qty = Math.max(0, Math.trunc(Number(prod?.estoque_disponivel ?? prod?.estoque_atual ?? 0)));

        const url = await buildShopeeUrl({ path: "/api/v2/product/update_stock", partnerId: SHOPEE_PARTNER_ID, partnerKey: SHOPEE_PARTNER_KEY, accessToken, shopId });
        const r = await shopeePostJson(url, { item_id: Number(a.identificador_externo), stock_list: [{ model_id: 0, normal_stock: qty }] });
        if (r.ok) {
          await admin.from("produto_anuncios").update({ sync_status: "synced", last_sync_at: new Date().toISOString(), last_error: null }).eq("id", a.id);
        }
        return json(r.ok ? 200 : 502, { ok: r.ok, qty, data: r.data }, cors);
      }

      case "sync.stock.batch": {
        const ids = Array.isArray(body.anuncio_ids) ? (body.anuncio_ids as string[]).slice(0, 50) : [];
        if (ids.length === 0) return json(400, { ok: false, error: "MISSING_ANUNCIO_IDS" }, cors);
        let updated = 0;
        let failed = 0;
        for (const id of ids) {
          const { data: a } = await admin.from("produto_anuncios").select("id,produto_id,identificador_externo").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
          if (!a?.identificador_externo) { failed++; continue; }
          const { data: prod } = await admin.from("produtos").select("estoque_disponivel,estoque_atual").eq("id", a.produto_id).maybeSingle();
          const qty = Math.max(0, Math.trunc(Number(prod?.estoque_disponivel ?? prod?.estoque_atual ?? 0)));
          const url = await buildShopeeUrl({ path: "/api/v2/product/update_stock", partnerId: SHOPEE_PARTNER_ID, partnerKey: SHOPEE_PARTNER_KEY, accessToken, shopId });
          const r = await shopeePostJson(url, { item_id: Number(a.identificador_externo), stock_list: [{ model_id: 0, normal_stock: qty }] });
          r.ok ? updated++ : failed++;
          if (r.ok) await admin.from("produto_anuncios").update({ sync_status: "synced", last_sync_at: new Date().toISOString(), last_error: null }).eq("id", a.id);
        }
        return json(200, { ok: true, updated, failed }, cors);
      }

      case "sync.price": {
        const anuncioId = String(body.anuncio_id ?? "").trim();
        if (!anuncioId) return json(400, { ok: false, error: "MISSING_ANUNCIO_ID" }, cors);
        const { data: a } = await admin.from("produto_anuncios").select("id,produto_id,identificador_externo,preco_especifico").eq("id", anuncioId).eq("empresa_id", empresaId).maybeSingle();
        if (!a?.identificador_externo) return json(404, { ok: false, error: "ANUNCIO_NOT_FOUND" }, cors);
        const { data: prod } = await admin.from("produtos").select("preco_venda,preco_promocional").eq("id", a.produto_id).maybeSingle();
        const price = Number(a.preco_especifico ?? prod?.preco_promocional ?? prod?.preco_venda ?? 0);
        if (price <= 0) return json(400, { ok: false, error: "INVALID_PRICE" }, cors);
        const url = await buildShopeeUrl({ path: "/api/v2/product/update_price", partnerId: SHOPEE_PARTNER_ID, partnerKey: SHOPEE_PARTNER_KEY, accessToken, shopId });
        const r = await shopeePostJson(url, { item_id: Number(a.identificador_externo), price_list: [{ model_id: 0, original_price: price }] });
        if (r.ok) await admin.from("produto_anuncios").update({ sync_status: "synced", last_sync_at: new Date().toISOString(), last_error: null }).eq("id", a.id);
        return json(r.ok ? 200 : 502, { ok: r.ok, price, data: r.data }, cors);
      }

      case "sync.price.batch": {
        const ids = Array.isArray(body.anuncio_ids) ? (body.anuncio_ids as string[]).slice(0, 50) : [];
        if (ids.length === 0) return json(400, { ok: false, error: "MISSING_ANUNCIO_IDS" }, cors);
        let updated = 0;
        let failed = 0;
        for (const id of ids) {
          const { data: a } = await admin.from("produto_anuncios").select("id,produto_id,identificador_externo,preco_especifico").eq("id", id).eq("empresa_id", empresaId).maybeSingle();
          if (!a?.identificador_externo) { failed++; continue; }
          const { data: prod } = await admin.from("produtos").select("preco_venda,preco_promocional").eq("id", a.produto_id).maybeSingle();
          const price = Number(a.preco_especifico ?? prod?.preco_promocional ?? prod?.preco_venda ?? 0);
          if (price <= 0) { failed++; continue; }
          const url = await buildShopeeUrl({ path: "/api/v2/product/update_price", partnerId: SHOPEE_PARTNER_ID, partnerKey: SHOPEE_PARTNER_KEY, accessToken, shopId });
          const r = await shopeePostJson(url, { item_id: Number(a.identificador_externo), price_list: [{ model_id: 0, original_price: price }] });
          r.ok ? updated++ : failed++;
          if (r.ok) await admin.from("produto_anuncios").update({ sync_status: "synced", last_sync_at: new Date().toISOString(), last_error: null }).eq("id", a.id);
        }
        return json(200, { ok: true, updated, failed }, cors);
      }

      default:
        return json(400, { ok: false, error: "UNKNOWN_ACTION", action }, cors);
    }
  } catch (e: any) {
    await admin.from("ecommerce_logs").insert({
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "shopee",
      level: "error",
      event: "shopee_admin_error",
      message: `Action ${action} failed: ${e?.message}`,
      entity_type: "admin",
      context: sanitizeForLog({ action, error: e?.message }),
    }).catch(() => {});
    return json(500, { ok: false, error: String(e?.message || "INTERNAL_ERROR").slice(0, 500) }, cors);
  }
});

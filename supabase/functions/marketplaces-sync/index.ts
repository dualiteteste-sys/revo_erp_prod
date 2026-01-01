import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sanitizeForLog } from "../_shared/sanitize.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MELI_CLIENT_ID = (Deno.env.get("MELI_CLIENT_ID") ?? "").trim();
const MELI_CLIENT_SECRET = (Deno.env.get("MELI_CLIENT_SECRET") ?? "").trim();

type Provider = "meli" | "shopee";
type Action = "import_orders";

type Body = {
  provider?: Provider;
  action?: Action;
  since?: string | null; // ISO
};

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function plusDaysIso(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function minusDaysIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function canManageEcommerce(userClient: any): Promise<boolean> {
  try {
    const { data } = await userClient.rpc("has_permission_for_current_user", {
      p_module: "ecommerce",
      p_action: "manage",
    });
    return !!data;
  } catch {
    return false;
  }
}

async function refreshMeliToken(params: { refreshToken: string; }): Promise<{ ok: boolean; status: number; data: any }> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", MELI_CLIENT_ID);
  body.set("client_secret", MELI_CLIENT_SECRET);
  body.set("refresh_token", params.refreshToken);
  const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function meliFetchJson(url: string, accessToken: string): Promise<{ ok: boolean; status: number; data: any }> {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

function mapMeliOrderStatus(order: any): "orcamento" | "aprovado" | "cancelado" {
  const status = String(order?.status ?? "").toLowerCase();
  const payments = Array.isArray(order?.payments) ? order.payments : [];
  const hasApprovedPayment = payments.some((p: any) => String(p?.status ?? "").toLowerCase() === "approved");
  if (["cancelled", "invalid", "expired"].includes(status)) return "cancelado";
  if (["paid", "confirmed"].includes(status) || hasApprovedPayment) return "aprovado";
  return "orcamento";
}

function chooseNextStatus(current: any, desired: "orcamento" | "aprovado" | "cancelado"): any {
  const cur = String(current ?? "").toLowerCase();
  if (cur === "concluido") return "concluido";
  if (cur === "cancelado") return "cancelado";
  return desired;
}

function num(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureBuyerAsPartner(admin: any, empresaId: string, buyer: any): Promise<string> {
  const buyerId = buyer?.id != null ? String(buyer.id) : "";
  const code = buyerId ? `meli:${buyerId}` : null;
  const name =
    [buyer?.first_name, buyer?.last_name].filter(Boolean).join(" ").trim() ||
    String(buyer?.nickname ?? "").trim() ||
    (buyerId ? `Cliente Mercado Livre ${buyerId}` : "Cliente Mercado Livre");

  if (code) {
    const { data: existing } = await admin
      .from("pessoas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("codigo_externo", code)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
  }

  const payload: any = {
    empresa_id: empresaId,
    tipo: "cliente",
    nome: name,
    email: buyer?.email ? String(buyer.email) : null,
    telefone: null,
    doc_unico: null,
    codigo_externo: code,
    tipo_pessoa: "fisica",
  };
  const { data: created, error } = await admin.from("pessoas").insert(payload).select("id").single();
  if (error) throw error;
  return created.id as string;
}

async function findProductForMeliItem(admin: any, ecommerceId: string, empresaId: string, item: any): Promise<string | null> {
  const itemId = item?.item?.id != null ? String(item.item.id) : null;
  if (!itemId) return null;
  const { data } = await admin
    .from("produto_anuncios")
    .select("produto_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("identificador", itemId)
    .maybeSingle();
  return data?.produto_id ? String(data.produto_id) : null;
}

async function upsertPedidoFromMeliOrder(params: {
  admin: any;
  empresaId: string;
  ecommerceId: string;
  order: any;
}): Promise<{ pedidoId: string | null; skippedItems: number; totalItems: number }> {
  const { admin, empresaId, ecommerceId, order } = params;

  const externalOrderId = order?.id != null ? String(order.id) : "";
  if (!externalOrderId) return { pedidoId: null, skippedItems: 0, totalItems: 0 };

  const buyer = order?.buyer ?? {};
  const clienteId = await ensureBuyerAsPartner(admin, empresaId, buyer);

  const desiredStatus = mapMeliOrderStatus(order);
  const createdAtIso = toIsoOrNull(order?.date_created) ?? new Date().toISOString();
  const dataEmissao = createdAtIso.slice(0, 10); // date

  const orderItems = Array.isArray(order?.order_items) ? order.order_items : [];
  let totalProdutos = 0;
  let skippedItems = 0;

  // Cria/atualiza pedido local
  const basePedido: any = {
    empresa_id: empresaId,
    cliente_id: clienteId,
    data_emissao: dataEmissao,
    status,
    frete: num(order?.shipping?.cost, 0),
    desconto: 0,
    condicao_pagamento: null,
    observacoes: `Mercado Livre #${externalOrderId}`,
    canal: "marketplace",
  };

  // vínculo
  const { data: linkExisting } = await admin
    .from("ecommerce_order_links")
    .select("vendas_pedido_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  let pedidoId: string | null = linkExisting?.vendas_pedido_id ? String(linkExisting.vendas_pedido_id) : null;

  if (pedidoId) {
    const { data: existing } = await admin.from("vendas_pedidos").select("status").eq("id", pedidoId).eq("empresa_id", empresaId).maybeSingle();
    basePedido.status = chooseNextStatus(existing?.status, desiredStatus);
    await admin.from("vendas_pedidos").update(basePedido).eq("id", pedidoId).eq("empresa_id", empresaId);
    await admin.from("vendas_itens_pedido").delete().eq("empresa_id", empresaId).eq("pedido_id", pedidoId);
  } else {
    basePedido.status = desiredStatus;
    const { data: created, error } = await admin.from("vendas_pedidos").insert(basePedido).select("id").single();
    if (error) throw error;
    pedidoId = String(created.id);
  }

  const itemsToInsert: any[] = [];
  for (const it of orderItems) {
    const produtoId = await findProductForMeliItem(admin, ecommerceId, empresaId, it);
    if (!produtoId) {
      skippedItems += 1;
      continue;
    }
    const qty = num(it?.quantity, 0);
    const unit = num(it?.unit_price, 0);
    const total = Math.max(0, qty * unit);
    totalProdutos += total;
    itemsToInsert.push({
      empresa_id: empresaId,
      pedido_id: pedidoId,
      produto_id: produtoId,
      quantidade: qty,
      preco_unitario: unit,
      desconto: 0,
      total,
      observacoes: null,
    });
  }

  if (itemsToInsert.length > 0) {
    const { error: itErr } = await admin.from("vendas_itens_pedido").insert(itemsToInsert);
    if (itErr) throw itErr;
  }

  const totalGeral = Math.max(0, totalProdutos + basePedido.frete - basePedido.desconto);
  await admin.from("vendas_pedidos").update({
    total_produtos: totalProdutos,
    total_geral: totalGeral,
  }).eq("id", pedidoId).eq("empresa_id", empresaId);

  await admin.from("ecommerce_order_links").upsert(
    {
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      external_order_id: externalOrderId,
      vendas_pedido_id: pedidoId,
      status: String(order?.status ?? null),
      payload: sanitizeForLog(order ?? {}),
      imported_at: new Date().toISOString(),
    },
    { onConflict: "ecommerce_id,external_order_id" },
  );

  return { pedidoId, skippedItems, totalItems: orderItems.length };
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: me } = await user.auth.getUser();
  const userId = me?.user?.id;
  if (!userId) return json(401, { ok: false, error: "UNAUTHENTICATED" }, cors);

  const allowed = await canManageEcommerce(user);
  if (!allowed) return json(403, { ok: false, error: "FORBIDDEN_RBAC" }, cors);

  const body = (await req.json().catch(() => ({}))) as Body;
  const provider = (body.provider ?? "meli") as Provider;
  const action = (body.action ?? "import_orders") as Action;
  const since = toIsoOrNull(body.since) ?? null;

  if (provider !== "meli" && provider !== "shopee") return json(400, { ok: false, error: "INVALID_PROVIDER" }, cors);
  if (action !== "import_orders") return json(400, { ok: false, error: "INVALID_ACTION" }, cors);

  if (provider === "shopee") return json(501, { ok: false, provider: "shopee", error: "NOT_IMPLEMENTED_YET" }, cors);

  if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) return json(500, { ok: false, error: "MISSING_MELI_SECRETS" }, cors);

  // Conexão
  const { data: conn } = await admin
    .from("ecommerces")
    .select("id,empresa_id,provider,status,external_account_id,active_account_id,last_sync_at,config")
    .eq("provider", "meli")
    .limit(1)
    .maybeSingle();

  if (!conn?.id || !conn?.empresa_id) return json(404, { ok: false, error: "NOT_CONNECTED" }, cors);
  const ecommerceId = String(conn.id);
  const empresaId = String(conn.empresa_id);
  let sellerId = conn.external_account_id ? String(conn.external_account_id) : "";
  if (conn.active_account_id) {
    const { data: acct } = await admin.from("ecommerce_accounts").select("external_account_id").eq("id", conn.active_account_id).maybeSingle();
    if (acct?.external_account_id) sellerId = String(acct.external_account_id);
  }
  if (!sellerId) return json(409, { ok: false, error: "MISSING_SELLER_ID" }, cors);

  const { data: sec } = await admin
    .from("ecommerce_connection_secrets")
    .select("access_token,refresh_token,token_expires_at")
    .eq("ecommerce_id", ecommerceId)
    .maybeSingle();

  let accessToken = sec?.access_token ? String(sec.access_token) : "";
  const refreshToken = sec?.refresh_token ? String(sec.refresh_token) : "";
  const expiresAtIso = toIsoOrNull(sec?.token_expires_at);
  const expired = expiresAtIso ? new Date(expiresAtIso).getTime() <= Date.now() + 60000 : false;

  if ((!accessToken || expired) && refreshToken) {
    const r = await refreshMeliToken({ refreshToken });
    if (!r.ok) return json(502, { ok: false, error: "MELI_REFRESH_FAILED", status: r.status, data: sanitizeForLog(r.data) }, cors);
    accessToken = String(r.data?.access_token ?? "");
    const newRefresh = String(r.data?.refresh_token ?? refreshToken);
    const expiresIn = Number(r.data?.expires_in ?? 0);
    const newExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    await admin.from("ecommerce_connection_secrets").upsert(
      { empresa_id: empresaId, ecommerce_id: ecommerceId, access_token: accessToken || null, refresh_token: newRefresh || null, token_expires_at: newExpiresAt },
      { onConflict: "ecommerce_id" },
    );
  }

  if (!accessToken) return json(409, { ok: false, error: "MISSING_ACCESS_TOKEN" }, cors);

  const windowFrom = since ?? toIsoOrNull(conn.last_sync_at) ?? minusDaysIso(7);
  const windowTo = plusDaysIso(0);

  // Cria job/run (observabilidade)
  const jobDedupe = `meli_import_orders:${windowFrom.slice(0, 13)}`; // hora
  const { data: job } = await admin.from("ecommerce_jobs").upsert(
    {
      empresa_id: empresaId,
      ecommerce_id: ecommerceId,
      provider: "meli",
      kind: "import_orders",
      dedupe_key: jobDedupe,
      payload: { from: windowFrom, to: windowTo },
      status: "processing",
      attempts: 1,
      locked_at: new Date().toISOString(),
      locked_by: "marketplaces-sync",
      created_by: userId,
    },
    { onConflict: "provider,dedupe_key" },
  ).select("id").maybeSingle();

  const jobId = job?.id ? String(job.id) : null;
  const { data: run } = await admin.from("ecommerce_job_runs").insert({
    empresa_id: empresaId,
    job_id: jobId,
    provider: "meli",
    kind: "import_orders",
    meta: { from: windowFrom, to: windowTo },
  }).select("id").single();
  const runId = run?.id ? String(run.id) : null;

  const limit = 50;
  let offset = 0;
  let imported = 0;
  let skippedItemsTotal = 0;
  let totalItems = 0;

  try {
    while (true) {
      const q = new URL("https://api.mercadolibre.com/orders/search");
      q.searchParams.set("seller", sellerId);
      q.searchParams.set("order.date_created.from", windowFrom);
      q.searchParams.set("order.date_created.to", windowTo);
      q.searchParams.set("limit", String(limit));
      q.searchParams.set("offset", String(offset));

      const page = await meliFetchJson(q.toString(), accessToken);
      if (!page.ok) throw new Error(`MELI_SEARCH_FAILED:${page.status}`);
      const results = Array.isArray(page.data?.results) ? page.data.results : [];
      if (results.length === 0) break;

      for (const r of results) {
        const orderId = r?.id != null ? String(r.id) : null;
        if (!orderId) continue;
        const detail = await meliFetchJson(`https://api.mercadolibre.com/orders/${encodeURIComponent(orderId)}`, accessToken);
        if (!detail.ok) {
          await admin.from("ecommerce_logs").insert({
            empresa_id: empresaId,
            ecommerce_id: ecommerceId,
            provider: "meli",
            level: "error",
            event: "meli_order_fetch_failed",
            message: `Falha ao buscar pedido ${orderId}`,
            entity_type: "order",
            entity_external_id: orderId,
            run_id: runId,
            context: sanitizeForLog({ status: detail.status, data: detail.data }),
          });
          continue;
        }

        const res = await upsertPedidoFromMeliOrder({ admin, empresaId, ecommerceId, order: detail.data });
        imported += res.pedidoId ? 1 : 0;
        skippedItemsTotal += res.skippedItems;
        totalItems += res.totalItems;

        if (res.skippedItems > 0) {
          await admin.from("ecommerce_logs").insert({
            empresa_id: empresaId,
            ecommerce_id: ecommerceId,
            provider: "meli",
            level: "warn",
            event: "meli_order_items_unmapped",
            message: `Pedido ${orderId}: ${res.skippedItems}/${res.totalItems} itens sem mapeamento (produto_anuncios)`,
            entity_type: "order",
            entity_external_id: orderId,
            entity_id: res.pedidoId,
            run_id: runId,
            context: { skipped: res.skippedItems, total: res.totalItems },
          });
        }
      }

      offset += results.length;
      if (results.length < limit) break;
    }

    await admin.from("ecommerces").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", ecommerceId);
    if (jobId) await admin.from("ecommerce_jobs").update({ status: "done", locked_at: null, locked_by: null, last_error: null }).eq("id", jobId);
    if (runId) await admin.from("ecommerce_job_runs").update({ ok: true, finished_at: new Date().toISOString() }).eq("id", runId);

    return json(200, { ok: true, provider: "meli", imported, total_items: totalItems, skipped_items: skippedItemsTotal, from: windowFrom, to: windowTo }, cors);
  } catch (e: any) {
    const msg = e?.message || "MELI_IMPORT_FAILED";
    if (jobId) await admin.from("ecommerce_jobs").update({ status: "error", locked_at: null, locked_by: null, last_error: msg }).eq("id", jobId);
    if (runId) await admin.from("ecommerce_job_runs").update({ ok: false, finished_at: new Date().toISOString(), error: msg }).eq("id", runId);
    await admin.from("ecommerces").update({ status: "error", last_error: msg }).eq("id", ecommerceId);
    return json(502, { ok: false, provider: "meli", error: msg }, cors);
  }
});

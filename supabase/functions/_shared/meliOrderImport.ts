/**
 * Mercado Livre — shared order import logic
 *
 * Extracted from marketplaces-sync for DRY reuse in meli-worker.
 * Contains: upsertPedidoFromMeliOrder, ensureBuyerAsPartner, findProductForMeliItem
 */

import { mapMeliOrderStatus, chooseNextPedidoStatus } from "./meli_mapping.ts";
import { sanitizeForLog } from "./sanitize.ts";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Buyer → Parceiro (pessoa)
// ---------------------------------------------------------------------------

export async function ensureBuyerAsPartner(
  admin: any,
  empresaId: string,
  buyer: any,
): Promise<string> {
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

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    tipo: "cliente",
    nome: name,
    email: buyer?.email ? String(buyer.email) : null,
    telefone: null,
    doc_unico: null,
    codigo_externo: code,
    tipo_pessoa: "fisica",
  };
  const { data: created, error } = await admin
    .from("pessoas")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

// ---------------------------------------------------------------------------
// Resolve produto_id from ML item
// ---------------------------------------------------------------------------

export async function findProductForMeliItem(
  admin: any,
  ecommerceId: string,
  empresaId: string,
  item: any,
): Promise<string | null> {
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

// ---------------------------------------------------------------------------
// Upsert pedido from ML order
// ---------------------------------------------------------------------------

export async function upsertPedidoFromMeliOrder(params: {
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
  const dataEmissao = createdAtIso.slice(0, 10);

  const orderItems = Array.isArray(order?.order_items) ? order.order_items : [];
  let totalProdutos = 0;
  let skippedItems = 0;

  const basePedido: Record<string, unknown> = {
    empresa_id: empresaId,
    cliente_id: clienteId,
    data_emissao: dataEmissao,
    frete: num(order?.shipping?.cost, 0),
    desconto: 0,
    condicao_pagamento: null,
    observacoes: `Mercado Livre #${externalOrderId}`,
    canal: "marketplace",
  };

  // Check existing link
  const { data: linkExisting } = await admin
    .from("ecommerce_order_links")
    .select("vendas_pedido_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("external_order_id", externalOrderId)
    .maybeSingle();

  let pedidoId: string | null = linkExisting?.vendas_pedido_id
    ? String(linkExisting.vendas_pedido_id)
    : null;

  if (pedidoId) {
    const { data: existing } = await admin
      .from("vendas_pedidos")
      .select("status")
      .eq("id", pedidoId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    basePedido.status = chooseNextPedidoStatus(existing?.status, desiredStatus);
    await admin.from("vendas_pedidos").update(basePedido).eq("id", pedidoId).eq("empresa_id", empresaId);
    await admin.from("vendas_itens_pedido").delete().eq("empresa_id", empresaId).eq("pedido_id", pedidoId);
  } else {
    basePedido.status = desiredStatus;
    const { data: created, error } = await admin
      .from("vendas_pedidos")
      .insert(basePedido)
      .select("id")
      .single();
    if (error) throw error;
    pedidoId = String(created.id);
  }

  const itemsToInsert: Record<string, unknown>[] = [];
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

  const totalGeral = Math.max(0, totalProdutos + num(basePedido.frete, 0) - num(basePedido.desconto, 0));
  await admin
    .from("vendas_pedidos")
    .update({ total_produtos: totalProdutos, total_geral: totalGeral })
    .eq("id", pedidoId)
    .eq("empresa_id", empresaId);

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

/**
 * Shopee — shared order import logic
 *
 * Mirrors meliOrderImport.ts but adapted for Shopee order structure.
 * Contains: upsertPedidoFromShopeeOrder, ensureBuyerAsPartner, findProductForShopeeItem
 */

import { mapShopeeOrderStatus, chooseNextPedidoStatus } from "./shopee_mapping.ts";
import { sanitizeForLog } from "./sanitize.ts";

// ---------------------------------------------------------------------------
// Pure helpers (same as ML)
// ---------------------------------------------------------------------------

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Shopee uses unix timestamps (seconds)
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 1e9) {
    return new Date(asNum * 1000).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Buyer → Parceiro (pessoa)
// ---------------------------------------------------------------------------

export async function ensureBuyerAsPartner(
  admin: any,
  empresaId: string,
  buyer: { buyer_user_id?: number; buyer_username?: string },
): Promise<string> {
  const buyerId = buyer?.buyer_user_id != null ? String(buyer.buyer_user_id) : "";
  const code = buyerId ? `shopee:${buyerId}` : null;
  const name = buyer?.buyer_username
    ? String(buyer.buyer_username).trim()
    : (buyerId ? `Cliente Shopee ${buyerId}` : "Cliente Shopee");

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
    email: null,
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
// Resolve produto_id from Shopee item
// ---------------------------------------------------------------------------

export async function findProductForShopeeItem(
  admin: any,
  ecommerceId: string,
  empresaId: string,
  itemId: number | string,
  _modelId?: number | string,
): Promise<string | null> {
  const id = String(itemId);
  if (!id) return null;
  const { data } = await admin
    .from("produto_anuncios")
    .select("produto_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("identificador", id)
    .maybeSingle();
  return data?.produto_id ? String(data.produto_id) : null;
}

// ---------------------------------------------------------------------------
// Upsert pedido from Shopee order
// ---------------------------------------------------------------------------

export async function upsertPedidoFromShopeeOrder(params: {
  admin: any;
  empresaId: string;
  ecommerceId: string;
  order: any; // Shopee order_detail object
}): Promise<{ pedidoId: string | null; skippedItems: number; totalItems: number }> {
  const { admin, empresaId, ecommerceId, order } = params;

  const orderSn = order?.order_sn ? String(order.order_sn) : "";
  if (!orderSn) return { pedidoId: null, skippedItems: 0, totalItems: 0 };

  const buyer = {
    buyer_user_id: order?.buyer_user_id,
    buyer_username: order?.buyer_username,
  };
  const clienteId = await ensureBuyerAsPartner(admin, empresaId, buyer);

  const desiredStatus = mapShopeeOrderStatus(order?.order_status ?? "");
  const createdAtIso = toIsoOrNull(order?.create_time) ?? new Date().toISOString();
  const dataEmissao = createdAtIso.slice(0, 10);

  const orderItems = Array.isArray(order?.item_list) ? order.item_list : [];
  let totalProdutos = 0;
  let skippedItems = 0;

  const freight = num(order?.actual_shipping_fee ?? order?.estimated_shipping_fee, 0);

  const basePedido: Record<string, unknown> = {
    empresa_id: empresaId,
    cliente_id: clienteId,
    data_emissao: dataEmissao,
    frete: freight,
    desconto: 0,
    condicao_pagamento: null,
    observacoes: `Shopee #${orderSn}`,
    canal: "marketplace",
  };

  // Check existing link
  const { data: linkExisting } = await admin
    .from("ecommerce_order_links")
    .select("vendas_pedido_id")
    .eq("empresa_id", empresaId)
    .eq("ecommerce_id", ecommerceId)
    .eq("external_order_id", orderSn)
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
    const produtoId = await findProductForShopeeItem(
      admin, ecommerceId, empresaId,
      it?.item_id, it?.model_id,
    );
    if (!produtoId) {
      skippedItems += 1;
      continue;
    }
    const qty = num(it?.model_quantity_purchased ?? it?.order_item_quantity, 0);
    const unit = num(it?.model_discounted_price ?? it?.model_original_price, 0);
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
      provider: "shopee",
      external_order_id: orderSn,
      vendas_pedido_id: pedidoId,
      status: String(order?.order_status ?? ""),
      payload: sanitizeForLog(order ?? {}),
      imported_at: new Date().toISOString(),
    },
    { onConflict: "ecommerce_id,external_order_id" },
  );

  return { pedidoId, skippedItems, totalItems: orderItems.length };
}

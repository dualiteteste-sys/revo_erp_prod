/**
 * Shopee order status → Revo pedido status mapping
 */

export type ShopeeOrderStatus = "orcamento" | "aprovado" | "em_entrega" | "concluido" | "cancelado";

export function mapShopeeOrderStatus(shopeeStatus: string): ShopeeOrderStatus {
  const s = (shopeeStatus ?? "").toUpperCase().trim();
  if (["CANCELLED", "IN_CANCEL"].includes(s)) return "cancelado";
  if (["SHIPPED", "TO_CONFIRM_RECEIVE"].includes(s)) return "em_entrega";
  if (s === "COMPLETED") return "concluido";
  if (["READY_TO_SHIP", "PROCESSED", "RETRY_SHIP"].includes(s)) return "aprovado";
  // UNPAID, INVOICE_PENDING, TO_RETURN, unknown
  return "orcamento";
}

export function chooseNextPedidoStatus(current: string | null, desired: ShopeeOrderStatus): string {
  const cur = (current ?? "").toLowerCase();
  // Terminal states: never regress
  if (cur === "concluido") return "concluido";
  if (cur === "cancelado") return "cancelado";
  return desired;
}

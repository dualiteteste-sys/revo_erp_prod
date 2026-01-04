export type MeliOrderStatus = "orcamento" | "aprovado" | "cancelado";

export function mapMeliOrderStatus(order: any): MeliOrderStatus {
  const status = String(order?.status ?? "").toLowerCase();
  const payments = Array.isArray(order?.payments) ? order.payments : [];
  const hasApprovedPayment = payments.some((p: any) => String(p?.status ?? "").toLowerCase() === "approved");
  if (["cancelled", "invalid", "expired"].includes(status)) return "cancelado";
  if (["paid", "confirmed"].includes(status) || hasApprovedPayment) return "aprovado";
  return "orcamento";
}

export function chooseNextPedidoStatus(current: any, desired: MeliOrderStatus): any {
  const cur = String(current ?? "").toLowerCase();
  if (cur === "concluido") return "concluido";
  if (cur === "cancelado") return "cancelado";
  return desired;
}


import type { Database } from "@/types/database.types";

export type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
export type BillingAccessLevel = "free" | "ok" | "soft" | "hard";

export function getBillingAccessLevel(subscription: SubscriptionRow | null): BillingAccessLevel {
  if (!subscription) return "free";

  const status = subscription.status;
  if (status === "active" || status === "trialing") return "ok";

  if (status === "canceled") return "hard";
  if (status === "incomplete_expired") return "hard";

  return "soft";
}

export function getBillingStatusCopy(status: SubscriptionRow["status"]): { title: string; body: string } {
  switch (status) {
    case "past_due":
      return { title: "Pagamento pendente", body: "Atualize seu pagamento para evitar suspensão do acesso." };
    case "unpaid":
      return { title: "Assinatura não paga", body: "Atualize seu pagamento para reativar o acesso completo." };
    case "incomplete":
      return { title: "Assinatura incompleta", body: "Finalize o pagamento para liberar o uso completo do sistema." };
    case "incomplete_expired":
      return { title: "Assinatura expirou", body: "Reinicie o processo de pagamento para continuar." };
    case "canceled":
      return { title: "Assinatura cancelada", body: "Reative a assinatura para voltar a usar o sistema." };
    default:
      return { title: "Assinatura requer atenção", body: "Verifique o status da assinatura para continuar." };
  }
}


export type BillingSyncRecoveryOutcome =
  | { kind: "synced" }
  | { kind: "link_customer"; message: string }
  | { kind: "resume_checkout"; checkoutUrl: string; message: string }
  | { kind: "choose_plan"; message: string }
  | { kind: "unknown" };

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export function resolveBillingSyncRecovery(input: { data?: unknown; raw?: unknown }): BillingSyncRecoveryOutcome {
  const source = input?.data ?? input?.raw;
  if (!source || typeof source !== "object") return { kind: "unknown" };
  const src = source as Record<string, unknown>;

  if (Boolean(src.synced)) return { kind: "synced" };

  const error = asString(src.error).trim();
  const nextAction = asString(src.next_action).trim();
  const message = asString(src.message).trim();
  const checkoutUrl = asString(src.checkout_url).trim();

  if (error === "missing_customer") {
    return {
      kind: "link_customer",
      message: message || "Sem cliente Stripe vinculado para esta empresa.",
    };
  }

  if (error === "no_subscription" && checkoutUrl) {
    return {
      kind: "resume_checkout",
      checkoutUrl,
      message: message || "Checkout pendente. Vamos retomar o check-in no Stripe.",
    };
  }

  if (error === "no_subscription" && nextAction === "choose_plan") {
    return {
      kind: "choose_plan",
      message: message || "Nenhuma assinatura encontrada. Selecione um plano para iniciar o checkout.",
    };
  }

  if (nextAction === "resume_checkout" && checkoutUrl) {
    return {
      kind: "resume_checkout",
      checkoutUrl,
      message: message || "Vamos retomar o check-in no Stripe.",
    };
  }

  if (nextAction === "choose_plan") {
    return {
      kind: "choose_plan",
      message: message || "Selecione um plano para iniciar o checkout.",
    };
  }

  return { kind: "unknown" };
}

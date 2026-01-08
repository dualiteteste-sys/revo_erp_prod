import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useSubscription } from "@/contexts/SubscriptionProvider";
import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";

type PendingPlanSlug = "ESSENCIAL" | "PRO" | "MAX" | "INDUSTRIA" | "SCALE";
type PendingBillingCycle = "monthly" | "yearly";

function extractEdgeFunctionErrorMessage(error: any): string | null {
  try {
    const ctx = error?.context ?? null;
    const body = ctx?.body ?? null;
    if (!body) return null;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        return parsed?.message || parsed?.error || null;
      } catch {
        return body;
      }
    }
    return body?.message || body?.error || null;
  } catch {
    return null;
  }
}

function readPendingPlanIntent(): { planSlug: PendingPlanSlug; billingCycle: PendingBillingCycle } | null {
  try {
    const rawSlug = (localStorage.getItem("pending_plan_slug") ?? "").trim();
    if (!rawSlug) return null;
    const planSlug = rawSlug.toUpperCase() as PendingPlanSlug;
    const allowed: PendingPlanSlug[] = ["ESSENCIAL", "PRO", "MAX", "INDUSTRIA", "SCALE"];
    if (!allowed.includes(planSlug)) return null;

    const rawCycle = (localStorage.getItem("pending_plan_cycle") ?? "yearly").trim();
    const billingCycle = (rawCycle === "monthly" ? "monthly" : "yearly") as PendingBillingCycle;
    return { planSlug, billingCycle };
  } catch {
    return null;
  }
}

function clearPendingPlanIntent() {
  try {
    localStorage.removeItem("pending_plan_slug");
    localStorage.removeItem("pending_plan_cycle");
  } catch {
    // ignore
  }
}

export function PlanIntentCheckoutModal() {
  const { session, activeEmpresa, activeEmpresaId, refreshEmpresas } = useAuth();
  const { subscription, loadingSubscription, refetchSubscription } = useSubscription();
  const { addToast } = useToast();

  const intent = useMemo(() => readPendingPlanIntent(), []);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!intent) return;
    if (!session || !activeEmpresaId) return;
    if (loadingSubscription) return;
    if (subscription) return; // já tem assinatura
    setOpen(true);
  }, [intent, session, activeEmpresaId, loadingSubscription, subscription]);

  const startCheckout = async () => {
    if (!intent || !session) return;
    setStarting(true);
    setInlineError(null);
    try {
      let empresaId = activeEmpresa?.id ?? activeEmpresaId ?? null;
      if (!empresaId) {
        await refreshEmpresas();
        empresaId = activeEmpresa?.id ?? activeEmpresaId ?? null;
      }
      if (!empresaId) {
        throw new Error("Não foi possível identificar sua empresa. Tente novamente em alguns segundos.");
      }

      const { data, error } = await supabase.functions.invoke("billing-checkout", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          empresa_id: empresaId,
          plan_slug: intent.planSlug,
          billing_cycle: intent.billingCycle,
          trial: true,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("URL de checkout não recebida.");

      clearPendingPlanIntent();
      window.location.href = data.url;
    } catch (error: any) {
      logger.error("[Billing][PlanIntent] Failed to start checkout", error, {
        planSlug: intent.planSlug,
        billingCycle: intent.billingCycle,
      });
      const msg = extractEdgeFunctionErrorMessage(error) || error?.message || "Erro ao iniciar o checkout.";
      setInlineError(msg);
      addToast(msg, "error");
      setStarting(false);
    }
  };

  const dismiss = () => {
    clearPendingPlanIntent();
    setOpen(false);
    // Garante que a UI reflita o estado atual (ex.: se algo mudou por outro device/tab)
    refetchSubscription();
  };

  if (!intent) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ativar teste grátis</DialogTitle>
          <DialogDescription>
            Você escolheu o plano <span className="font-semibold">{intent.planSlug}</span> ({" "}
            {intent.billingCycle === "yearly" ? "anual" : "mensal"}). Para liberar o teste grátis de 30 dias, finalize a
            assinatura no Stripe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={startCheckout} disabled={starting}>
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Iniciando…
              </>
            ) : (
              "Iniciar teste grátis (30 dias)"
            )}
          </Button>
          {inlineError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {inlineError}
            </div>
          ) : null}
          <Button variant="ghost" onClick={dismiss} disabled={starting}>
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

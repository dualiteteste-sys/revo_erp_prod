import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionProvider";
import { useToast } from "@/contexts/ToastProvider";
import { getBillingAccessLevel } from "@/lib/billingAccess";

export function useBillingGate() {
  const { subscription } = useSubscription();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const openBilling = useCallback(() => {
    if (location.pathname.startsWith("/app")) {
      navigate("/app?settings=billing", { replace: false });
    } else {
      navigate("/app?settings=billing", { replace: false });
    }
  }, [location.pathname, navigate]);

  const ensureCanWrite = useCallback(
    (opts?: { actionLabel?: string }) => {
      const level = getBillingAccessLevel(subscription);
      if (level === "ok" || level === "free") return true;

      const label = opts?.actionLabel ? ` (${opts.actionLabel})` : "";
      addToast(`Assinatura precisa de atenção${label}. Abra "Minha Assinatura" para resolver.`, "warning");
      openBilling();
      return false;
    },
    [addToast, openBilling, subscription]
  );

  return { subscription, openBilling, ensureCanWrite };
}


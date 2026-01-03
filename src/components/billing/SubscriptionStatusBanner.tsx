import React, { useMemo } from "react";
import { AlertTriangle, CreditCard } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionProvider";
import { getBillingAccessLevel, getBillingStatusCopy } from "@/lib/billingAccess";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function SubscriptionStatusBanner() {
  const { subscription } = useSubscription();
  const navigate = useNavigate();

  const state = useMemo(() => {
    const level = getBillingAccessLevel(subscription);
    if (!subscription) return { visible: false as const };
    if (level !== "soft") return { visible: false as const };
    const copy = getBillingStatusCopy(subscription.status);
    return { visible: true as const, ...copy };
  }, [subscription]);

  if (!state.visible) return null;

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-amber-200 bg-amber-50/80 backdrop-blur px-4 py-3 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{state.title}</div>
            <div className="text-xs text-slate-700">{state.body}</div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2 bg-white/70"
          onClick={() => navigate("/app?settings=billing")}
        >
          <CreditCard size={16} />
          Minha Assinatura
        </Button>
      </div>
    </div>
  );
}


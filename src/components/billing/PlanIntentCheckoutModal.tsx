import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useSubscription } from "@/contexts/SubscriptionProvider";
import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";
import { fetchCnpjData } from "@/services/externalApis";
import { cnpjMask } from "@/lib/masks";

type PendingPlanSlug = "ESSENCIAL" | "PRO" | "MAX" | "INDUSTRIA" | "SCALE";
type PendingBillingCycle = "monthly" | "yearly";

async function extractEdgeFunctionErrorMessage(error: any): Promise<string | null> {
  const ctx = error?.context ?? null;
  if (!ctx) return null;

  // Supabase FunctionsHttpError: `context` é um Response (fetch).
  if (typeof Response !== "undefined" && ctx instanceof Response) {
    try {
      const res = ctx.clone();
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const parsed = await res.json().catch(() => null);
        if (parsed?.message) return String(parsed.message);
        if (parsed?.error) return String(parsed.error);
      }
      const text = await res.text().catch(() => "");
      if (!text) return null;
      try {
        const parsed = JSON.parse(text);
        return parsed?.message || parsed?.error || text;
      } catch {
        return text;
      }
    } catch {
      return null;
    }
  }

  // Fallback: alguns callers anexaram um body serializado
  const body = (ctx as any)?.body ?? null;
  if (!body) return null;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed?.message || parsed?.error || body;
    } catch {
      return body;
    }
  }

  return (body as any)?.message || (body as any)?.error || null;
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
  const [cnpj, setCnpj] = useState("");
  const [razao, setRazao] = useState("");
  const [fantasia, setFantasia] = useState("");
  const [fetchingCnpj, setFetchingCnpj] = useState(false);

  useEffect(() => {
    if (!intent) return;
    if (!session || !activeEmpresaId) return;
    if (loadingSubscription) return;
    if (subscription) return; // já tem assinatura
    setOpen(true);
  }, [intent, session, activeEmpresaId, loadingSubscription, subscription]);

  useEffect(() => {
    if (!open) return;
    // Prefill com dados atuais da empresa (se existirem).
    setRazao((activeEmpresa as any)?.razao_social ?? (activeEmpresa as any)?.nome_razao_social ?? "");
    setFantasia((activeEmpresa as any)?.fantasia ?? (activeEmpresa as any)?.nome_fantasia ?? "");
    setCnpj(cnpjMask(String((activeEmpresa as any)?.cnpj ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tryFetchCnpj = async () => {
    const cleaned = cnpj.replace(/\D/g, "");
    if (cleaned.length !== 14) return;
    setFetchingCnpj(true);
    try {
      const data = await fetchCnpjData(cleaned);
      const rs = (data?.razao_social ?? "").trim();
      const nf = (data?.nome_fantasia ?? "").trim();
      if (rs) setRazao(rs);
      if (nf) setFantasia(nf);
      addToast("Dados do CNPJ preenchidos.", "success");
    } catch {
      addToast("CNPJ não encontrado. Preencha Razão Social manualmente.", "warning");
    } finally {
      setFetchingCnpj(false);
    }
  };

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

      const cleanedCnpj = cnpj.replace(/\D/g, "");
      if (cleanedCnpj.length !== 14) {
        throw new Error("CNPJ inválido. Informe um CNPJ com 14 dígitos.");
      }
      const razaoFinal = razao.trim();
      if (razaoFinal.length < 3) {
        throw new Error("Razão Social é obrigatória (mínimo 3 caracteres).");
      }
      const fantasiaFinal = (fantasia.trim() || razaoFinal).slice(0, 120);

      // Persistência antes do checkout: evita “Empresa sem nome” no Stripe e garante metadata consistente.
      // Best-effort: se falhar por RLS, o checkout ainda tenta seguir, mas vai usar dados atuais do banco.
      try {
        await supabase
          .from("empresas")
          .update({
            cnpj: cleanedCnpj,
            nome_razao_social: razaoFinal,
            nome_fantasia: fantasiaFinal,
          } as any)
          .eq("id", empresaId);
      } catch (e) {
        logger.warn("[Billing][PlanIntent] Falha ao atualizar dados da empresa antes do checkout (best-effort)", { error: e });
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
      const msg = (await extractEdgeFunctionErrorMessage(error)) || error?.message || "Erro ao iniciar o checkout.";
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
            {intent.billingCycle === "yearly" ? "anual" : "mensal"}). Para liberar o teste grátis (fase beta), finalize a
            assinatura no Stripe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <div className="space-y-2">
            <div className="grid gap-3">
              <div className="space-y-1">
                <div className="text-xs text-slate-600">CNPJ</div>
                <input
                  value={cnpj}
                  onChange={(e) => setCnpj(cnpjMask(e.target.value))}
                  onBlur={() => void tryFetchCnpj()}
                  placeholder="00.000.000/0000-00"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  disabled={starting || fetchingCnpj}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Razão Social</div>
                <input
                  value={razao}
                  onChange={(e) => setRazao(e.target.value)}
                  placeholder="Minha Empresa LTDA"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  disabled={starting || fetchingCnpj}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Nome Fantasia (opcional)</div>
                <input
                  value={fantasia}
                  onChange={(e) => setFantasia(e.target.value)}
                  placeholder="Minha Empresa"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  disabled={starting || fetchingCnpj}
                />
              </div>
            </div>
          </div>

          <Button onClick={startCheckout} disabled={starting}>
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Iniciando…
              </>
            ) : (
              "Iniciar teste grátis (180 dias)"
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

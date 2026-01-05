import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const acrh = req.headers.get("access-control-request-headers") || "";
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);

  const exacts = list.filter(v => !v.startsWith("suffix:"));
  const suffixes = list.filter(v => v.startsWith("suffix:")).map(v => v.replace("suffix:", ""));

  const permissive = (Deno.env.get("CORS_MODE") || "").toLowerCase() === "permissive";
  const isExact = exacts.includes(origin);
  const isSuffix = suffixes.some(sfx => origin.endsWith(sfx));

  const allowOrigin = permissive
    ? (origin || "*")
    : (isExact || isSuffix) ? origin : (Deno.env.get("SITE_URL") || "*");

  const allowHeaders = acrh || "authorization, x-client-info, apikey, content-type";

  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Max-Age": "600",
    "Vary": "Origin, Access-Control-Request-Headers",
  };
}

function cors(req: Request, status = 200, body?: unknown) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: buildCorsHeaders(req),
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return cors(req, 204);
    }

    const url = new URL(req.url);
    const session_id = url.searchParams.get("session_id");
    if (!session_id) {
      return cors(req, 400, { error: "session_id é obrigatório" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return cors(req, 401, { error: "Não autorizado" });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription', 'customer'] });
    
    const empresaId = checkoutSession.metadata?.empresa_id;
    if (!empresaId) {
      return cors(req, 400, { error: "ID da empresa não encontrado nos metadados da sessão." });
    }

    const { data: link } = await supabase.from("empresa_usuarios").select("empresa_id").eq("user_id", user.id).eq("empresa_id", empresaId).single();
    if (!link) {
      return cors(req, 403, { error: "Acesso negado a esta sessão de checkout." });
    }

    const kind = checkoutSession.metadata?.kind;
    let subscriptionData, planData, error;

    // Self-healing: garante que a assinatura principal exista no banco assim que o Checkout terminar
    // (não depende do webhook chegar a tempo).
    if (kind !== 'addon') {
      try {
        const expandedSub = checkoutSession.subscription as Stripe.Subscription | string | null;
        if (expandedSub && typeof expandedSub !== "string") {
          const priceId = expandedSub.items?.data?.[0]?.price?.id ?? null;
          const interval = expandedSub.items?.data?.[0]?.price?.recurring?.interval ?? null;
          const billingCycle = interval === "year" ? "yearly" : "monthly";
          const currentEnd = expandedSub.current_period_end
            ? new Date(expandedSub.current_period_end * 1000).toISOString()
            : null;

          if (priceId) {
            const admin = createClient(
              Deno.env.get("SUPABASE_URL")!,
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
              { auth: { autoRefreshToken: false, persistSession: false } }
            );

            const { data: planRow } = await admin
              .from("plans")
              .select("slug")
              .eq("stripe_price_id", priceId)
              .maybeSingle();

            await admin.rpc("upsert_subscription", {
              p_empresa_id: empresaId,
              p_status: expandedSub.status,
              p_current_period_end: currentEnd,
              p_price_id: priceId,
              p_sub_id: expandedSub.id,
              p_plan_slug: planRow?.slug ?? null,
              p_billing_cycle: billingCycle,
              p_cancel_at_period_end: !!expandedSub.cancel_at_period_end,
            });
          }
        }
      } catch (e) {
        // best-effort: não bloqueia o flow do usuário
        console.error("billing-success-session: best-effort upsert failed", e);
      }
    }

    if (kind === 'addon') {
        const { data, error: addonSubError } = await supabase.from("empresa_addons").select("*").eq("empresa_id", empresaId).eq("addon_slug", checkoutSession.metadata?.addon_slug?.toUpperCase()).single();
        subscriptionData = data;
        error = addonSubError;
    } else {
        const { data, error: subError } = await supabase.from("subscriptions").select("*").eq("empresa_id", empresaId).single();
        subscriptionData = data;
        error = subError;
    }

    if (error && error.code !== 'PGRST116') throw error;

    if (!subscriptionData || !subscriptionData.stripe_subscription_id) {
      return cors(req, 202, { state: "pending" });
    }
    
    const { data: company } = await supabase.from("empresas").select("*").eq("id", empresaId).single();

    if (kind === 'addon') {
        const { data: addonPlan } = await supabase.from("addons").select("*").eq("stripe_price_id", subscriptionData.stripe_price_id!).single();
        planData = addonPlan;
    } else {
        const { data: mainPlan } = await supabase.from("plans").select("*").eq("stripe_price_id", subscriptionData.stripe_price_id!).single();
        planData = mainPlan;
    }

    const responsePayload = {
      company,
      subscription: subscriptionData,
      plan: planData,
    };

    return cors(req, 200, responsePayload);

  } catch (e) {
    console.error("Error in billing-success-session:", e);
    return cors(req, 500, { error: "internal_error", detail: String(e) });
  }
});

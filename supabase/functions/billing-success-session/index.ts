import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type BillingCycle = "monthly" | "yearly";
type PlanSlug = "ESSENCIAL" | "PRO" | "MAX" | "INDUSTRIA" | "SCALE";
type PlanKey = `${PlanSlug}/${BillingCycle}`;

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

function resolveStripeSecretKey(req: Request): string {
  const origin = (req.headers.get("origin") || "").toLowerCase();
  const primary = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
  const test = (Deno.env.get("STRIPE_SECRET_KEY_TEST") || "").trim();
  const live = (Deno.env.get("STRIPE_SECRET_KEY_LIVE") || "").trim();

  if (!primary && !test && !live) return "";

  const looksLikeProd = origin.includes("ultria.com.br") || origin.includes("erprevo.com");
  const looksLikeDev = origin.includes("ultriadev.com.br")
    || origin.includes("erprevodev.com")
    || origin.includes("localhost")
    || origin.includes("127.0.0.1");

  if (looksLikeProd) return live || primary;
  if (looksLikeDev) return test || primary;
  return primary;
}

function getDefaultPriceMap(stripeSecretKey: string): Partial<Record<PlanKey, string>> {
  const isTest = stripeSecretKey.startsWith("sk_test_");
  return {
    "ESSENCIAL/monthly": isTest ? "price_1Sn4sO5Ay7EJ5Bv6oKqPr0m9" : "price_1SL7Xd5Ay7EJ5Bv6mEL2zjM0",
    "ESSENCIAL/yearly": isTest ? "price_1Sn4sO5Ay7EJ5Bv6oKqPr0m9" : "price_1SL7Xd5Ay7EJ5Bv6mEL2zjM0",
    "PRO/monthly": isTest ? "price_1Sn4w65Ay7EJ5Bv6wbXwRz4u" : "price_1SL7Ym5Ay7EJ5Bv6bA2wL3rE",
    "PRO/yearly": isTest ? "price_1Sn4w65Ay7EJ5Bv6wbXwRz4u" : "price_1SL7Ym5Ay7EJ5Bv6bA2wL3rE",
    "MAX/monthly": isTest ? "price_1Sn4xV5Ay7EJ5Bv6uV3zQp6T" : "price_1SL7Zx5Ay7EJ5Bv6PwJ0XgLk",
    "MAX/yearly": isTest ? "price_1Sn4xV5Ay7EJ5Bv6uV3zQp6T" : "price_1SL7Zx5Ay7EJ5Bv6PwJ0XgLk",
    "INDUSTRIA/monthly": isTest ? "price_1Sn4y35Ay7EJ5Bv6Jqv25aXz" : "price_1SL7aW5Ay7EJ5Bv6s0n0n0n0",
    "INDUSTRIA/yearly": isTest ? "price_1Sn4y35Ay7EJ5Bv6Jqv25aXz" : "price_1SL7aW5Ay7EJ5Bv6s0n0n0n0",
    "SCALE/monthly": isTest ? "price_1Sn4yY5Ay7EJ5Bv6CEgLq3Ds" : "price_1SL7bG5Ay7EJ5Bv69CGu3fra",
    "SCALE/yearly": isTest ? "price_1Sn4yY5Ay7EJ5Bv6ryXw73vz" : "price_1SL7bG5Ay7EJ5Bv69CGu3fra",
  };
}

function inferPlanSlugFromPriceId(
  stripeSecretKey: string,
  stripePriceId: string
): { slug: PlanSlug; billing_cycle: BillingCycle } | null {
  const entries = Object.entries(getDefaultPriceMap(stripeSecretKey));
  const match = entries.find(([, v]) => v === stripePriceId);
  if (!match) return null;
  const [key] = match;
  const [slug, cycle] = key.split("/") as [PlanSlug, BillingCycle];
  return { slug, billing_cycle: cycle };
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

    const stripeSecretKey = resolveStripeSecretKey(req);
    if (!stripeSecretKey) {
      return cors(req, 500, { error: "config_error", message: "Stripe key ausente (STRIPE_SECRET_KEY[_TEST/_LIVE])." });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
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

            if (!planRow?.slug) {
              const inferred = inferPlanSlugFromPriceId(stripeSecretKey, priceId);
              if (inferred) {
                const priceObj = expandedSub.items?.data?.[0]?.price ?? null;
                const amountCents = typeof priceObj?.unit_amount === "number" ? priceObj.unit_amount : null;
                const currency = (priceObj?.currency || "brl").toLowerCase();
                const name = inferred.slug.charAt(0) + inferred.slug.slice(1).toLowerCase();

                try {
                  await admin.from("plans").upsert(
                    {
                      slug: inferred.slug,
                      name,
                      billing_cycle: inferred.billing_cycle,
                      currency,
                      amount_cents: amountCents,
                      stripe_price_id: priceId,
                      active: true,
                    },
                    { onConflict: "slug,billing_cycle" }
                  );
                } catch (e) {
                  console.error("billing-success-session: failed to self-heal plans catalog (best-effort)", e);
                }
              }
            }

            const { data: planRow2 } = await admin
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
              p_plan_slug: planRow2?.slug ?? null,
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

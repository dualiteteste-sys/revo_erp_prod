import Stripe from "stripe";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type StripeSubscription = Stripe.Subscription;

function json(corsHeaders: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function pickBestSubscription(subs: StripeSubscription[]): StripeSubscription | null {
  if (subs.length === 0) return null;

  const priority: Record<string, number> = {
    active: 0,
    trialing: 1,
    past_due: 2,
    unpaid: 3,
    incomplete: 4,
    incomplete_expired: 5,
    canceled: 6,
  };

  return [...subs].sort((a, b) => {
    const pa = priority[a.status] ?? 99;
    const pb = priority[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const ea = a.current_period_end ?? 0;
    const eb = b.current_period_end ?? 0;
    return eb - ea;
  })[0]!;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return json(corsHeaders, 401, { error: "not_signed_in", message: "Token de autenticação ausente." });
    }

    const { empresa_id } = (await req.json().catch(() => ({}))) as { empresa_id?: string };
    if (!empresa_id) {
      return json(corsHeaders, 400, { error: "invalid_payload", message: "empresa_id é obrigatório." });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return json(corsHeaders, 401, { error: "invalid_token", message: userErr?.message || "Token inválido ou expirado." });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { count: memberCount, error: memberErr } = await admin
      .from("empresa_usuarios")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresa_id)
      .eq("user_id", user.id);
    if (memberErr || !memberCount || memberCount < 1) {
      return json(corsHeaders, 403, { error: "forbidden", message: "Usuário não tem permissão para operar nesta empresa." });
    }

    const { data: empresa, error: empErr } = await admin
      .from("empresas")
      .select("id, stripe_customer_id")
      .eq("id", empresa_id)
      .maybeSingle();
    if (empErr || !empresa) {
      return json(corsHeaders, 404, { error: "company_not_found" });
    }

    const customerId = empresa.stripe_customer_id ? String(empresa.stripe_customer_id) : "";
    if (!customerId) {
      // 400 (e não 404) para evitar confusão com "Edge Function não encontrada".
      return json(corsHeaders, 400, { error: "missing_customer", message: "Cliente Stripe não encontrado para esta empresa." });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

    const listed = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price"],
    });

    const best = pickBestSubscription(listed.data as StripeSubscription[]);
    if (!best) {
      return json(corsHeaders, 404, { error: "no_subscription", message: "Nenhuma assinatura encontrada no Stripe para este cliente." });
    }

    const price = best.items?.data?.[0]?.price as Stripe.Price | undefined;
    const stripePriceId = price?.id ?? null;
    if (!stripePriceId) {
      return json(corsHeaders, 500, { error: "missing_price", message: "Assinatura do Stripe sem price_id." });
    }

    const interval = price?.recurring?.interval ?? null;
    const billingCycle = interval === "year" ? "yearly" : "monthly";

    const { data: planRow } = await admin
      .from("plans")
      .select("slug")
      .eq("stripe_price_id", stripePriceId)
      .eq("active", true)
      .maybeSingle();
    const planSlug = planRow?.slug ?? null;

    const status = best.status === "canceled" ? "canceled" : best.status;
    const currentPeriodEnd = best.current_period_end ? new Date(best.current_period_end * 1000).toISOString() : null;

    const { error: rpcErr } = await admin.rpc("upsert_subscription", {
      p_empresa_id: empresa_id,
      p_status: status,
      p_current_period_end: currentPeriodEnd,
      p_price_id: stripePriceId,
      p_sub_id: best.id,
      p_plan_slug: planSlug,
      p_billing_cycle: billingCycle,
      p_cancel_at_period_end: !!best.cancel_at_period_end,
    });
    if (rpcErr) {
      return json(corsHeaders, 500, { error: "db_error", detail: rpcErr });
    }

    const { data: subRow } = await admin
      .from("subscriptions")
      .select("*")
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    return json(corsHeaders, 200, { synced: true, subscription: subRow });
  } catch (e) {
    console.error("billing-sync-subscription error:", e);
    return json(corsHeaders, 500, { error: "internal_error", detail: String(e) });
  }
});

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  console.log("[checkout] method=", req.method,
              " origin=", req.headers.get("origin"),
              " acrh=", req.headers.get("access-control-request-headers"));

  if (req.method === "OPTIONS") return cors(req, 204);
  if (req.method !== "POST") return cors(req, 405, { error: "Method not allowed" });

  try {
    const body = await req.json();
    const { empresa_id, plan_slug, billing_cycle } = body;

    console.log("[checkout] body=", body);

    if (!empresa_id || !plan_slug || !billing_cycle) {
      return cors(req, 400, { error: "Parâmetros ausentes: empresa_id, plan_slug ou billing_cycle" });
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("stripe_price_id")
      .eq("slug", plan_slug)
      .eq("billing_cycle", billing_cycle)
      .eq("active", true)
      .maybeSingle();
    if (planErr || !plan?.stripe_price_id) {
      return cors(req, 400, { error: "Plano não encontrado ou inativo" });
    }

    const { data: emp, error: empErr } = await supabaseAdmin
      .from("empresas")
      .select("id, razao_social, stripe_customer_id")
      .eq("id", empresa_id)
      .maybeSingle();
    if (empErr || !emp?.id) return cors(req, 404, { error: "Empresa não encontrada" });

    let customerId = emp.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { empresa_id },
        name: emp.razao_social ?? undefined,
      });
      customerId = customer.id;

      const { error: upErr } = await supabaseAdmin
        .from("empresas")
        .update({ stripe_customer_id: customerId })
        .eq("id", empresa_id);
      if (upErr) return cors(req, 500, { error: "Falha ao salvar o ID do cliente Stripe" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${SITE_URL}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/app/settings`,
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: { empresa_id },
      },
      metadata: { empresa_id },
    });

    return cors(req, 200, { url: session.url });
  } catch (e) {
    console.error("[checkout] error:", (e as Error).message);
    return cors(req, 500, { error: (e as Error).message });
  }
});

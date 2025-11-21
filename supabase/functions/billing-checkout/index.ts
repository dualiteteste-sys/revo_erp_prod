import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "stripe";
import { buildCorsHeaders } from "../_shared/cors.ts";

type Cycle = 'monthly' | 'yearly';
type Plan = 'START' | 'PRO' | 'MAX' | 'ULTRA';

const PRICES: Record<Plan, Record<Cycle, string>> = {
  START: { monthly: 'price_1SKVBl5Ay7EJ5Bv6okyrWPlI', yearly: 'price_1SKWSN5Ay7EJ5Bv6pLg1MOLW' },
  PRO:   { monthly: 'price_1SKVHv5Ay7EJ5Bv64qGOFrm4', yearly: 'price_1SKWTT5Ay7EJ5Bv6RvN50bIA' },
  MAX:   { monthly: 'price_1SKVJ15Ay7EJ5Bv6uJzqBFYg', yearly: 'price_1SKWVd5Ay7EJ5Bv6fS4tSYsB' },
  ULTRA: { monthly: 'price_1SKVK45Ay7EJ5Bv6Oy6clS9u', yearly: 'price_1SKWWv5Ay7EJ5Bv6zA632lIA' },
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1) Auth
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return new Response(JSON.stringify({ error: 'not_signed_in', message: 'Token de autenticação ausente.' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!, // precisa estar nas secrets
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid_token', message: userErr?.message || 'Token inválido ou expirado.' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 2) Payload
    const { empresa_id, plan_slug, billing_cycle, trial } = await req.json() as {
      empresa_id?: string; plan_slug?: Plan; billing_cycle?: Cycle; trial?: boolean;
    };
    if (!empresa_id || !plan_slug || !billing_cycle) {
      return new Response(JSON.stringify({ error: 'invalid_payload', message: 'empresa_id, plan_slug e billing_cycle são obrigatórios.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 3) Price
    const priceId = PRICES?.[plan_slug]?.[billing_cycle];
    if (!priceId || !priceId.startsWith('price_')) {
      return new Response(JSON.stringify({ error: 'misconfigured_price_id', message: `PriceID ausente para ${plan_slug}/${billing_cycle}.` }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    console.log('billing-checkout→price', { plan_slug, billing_cycle, priceId });

    // 4) DB & permission
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: empresa, error: empErr } = await supabaseAdmin
      .from("empresas")
      .select("id, fantasia, razao_social, stripe_customer_id")
      .eq("id", empresa_id)
      .single();
    if (empErr || !empresa) {
      return new Response(JSON.stringify({ error: "company_not_found" }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const { count: memberCount, error: memberErr } = await supabaseAdmin
      .from('empresa_usuarios')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa_id)
      .eq('user_id', user.id);
    if (memberErr || !memberCount || memberCount < 1) {
      return new Response(JSON.stringify({ error: 'forbidden', message: 'Usuário não tem permissão para operar nesta empresa.' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 5) Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

    let customerId = empresa.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: empresa.fantasia ?? empresa.razao_social ?? undefined,
        email: user.email ?? undefined,
        metadata: { empresa_id },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("empresas")
        .update({ stripe_customer_id: customerId })
        .eq("id", empresa_id);
    }

    // 6) SITE_URL sanity
    const siteUrl = Deno.env.get("SITE_URL");
    if (!siteUrl) {
      return new Response(JSON.stringify({ error: 'config_error', message: 'SITE_URL não configurada' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 7) Checkout session (trial via código)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${siteUrl}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/app/billing/cancel`,
      metadata: { empresa_id, plan_slug, billing_cycle, kind: 'subscription' },
      ...(trial ? { subscription_data: { trial_period_days: 30 } } : {}),
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (e: any) {
    console.error('billing-checkout error:', e);
    return new Response(JSON.stringify({ error: 'internal_server_error', message: e?.message ?? 'error' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});

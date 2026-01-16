import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "stripe";
import { buildCorsHeaders } from "../_shared/cors.ts";

type Cycle = 'monthly' | 'yearly';

function requireEnv(name: string): string | null {
  const v = (Deno.env.get(name) ?? "").trim();
  return v ? v : null;
}

function parseTrialDays(): number {
  const raw = (Deno.env.get("BILLING_TRIAL_DAYS") ?? "").trim();
  // Default para fase beta.
  const fallback = 180;
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(3650, n));
}

function pickSiteUrl(req: Request): string | null {
  const envUrl = (Deno.env.get("SITE_URL") ?? "").trim();

  // Preferir o domínio do front que está chamando a função (evita "dev" em PROD).
  const origin = (req.headers.get("origin") ?? "").trim();

  const allowedExact = new Set<string>([
    "https://erprevo.com",
    "https://erprevodev.com",
  ]);

  const candidate = allowedExact.has(origin) ? origin : envUrl;

  // Segurança: evita open redirect se SITE_URL estiver errado/malicioso.
  if (allowedExact.has(candidate)) return candidate;
  if (candidate) return candidate; // fallback: mantém compatibilidade (localhost / previews), assumindo env correto
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !stripeSecretKey) {
      return new Response(
        JSON.stringify({
          error: "config_error",
          message:
            "Configuração incompleta do billing-checkout. Verifique as variáveis SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY e STRIPE_SECRET_KEY.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Stripe key sanity (evita erro silencioso com pk_ ou mismatch test/live).
    const origin = (req.headers.get("origin") ?? "").trim();
    if (stripeSecretKey.startsWith("pk_")) {
      return new Response(
        JSON.stringify({
          error: "config_error",
          message:
            "STRIPE_SECRET_KEY está configurada com uma Publishable Key (pk_*). Configure uma Secret Key (sk_* ou rk_*).",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    if (origin === "https://erprevo.com" && stripeSecretKey.startsWith("sk_test_")) {
      return new Response(
        JSON.stringify({
          error: "config_error",
          message:
            "Você está em https://erprevo.com mas a STRIPE_SECRET_KEY parece ser de TESTE (sk_test_*). Configure a chave LIVE (sk_live_*) para a produção.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // 1) Auth
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return new Response(JSON.stringify({ error: 'not_signed_in', message: 'Token de autenticação ausente.' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      supabaseAnonKey, // precisa estar nas secrets
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
      empresa_id?: string; plan_slug?: string; billing_cycle?: Cycle; trial?: boolean;
    };
    if (!empresa_id || !plan_slug || !billing_cycle) {
      return new Response(JSON.stringify({ error: 'invalid_payload', message: 'empresa_id, plan_slug e billing_cycle são obrigatórios.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 4) DB & permission
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey
    );

    // 4.1) Buscar Price ID no catálogo (fonte de verdade)
    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("stripe_price_id, active")
      .eq("slug", String(plan_slug).toUpperCase())
      .eq("billing_cycle", billing_cycle)
      .eq("active", true)
      .maybeSingle();
    if (planErr || !planRow?.stripe_price_id) {
      return new Response(JSON.stringify({
        error: 'plan_not_mapped',
        message: `Plano não encontrado/ativo ou sem stripe_price_id: ${String(plan_slug).toUpperCase()}/${billing_cycle}`
      }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const priceId = String(planRow.stripe_price_id);
    if (!priceId.startsWith("price_")) {
      return new Response(JSON.stringify({
        error: 'misconfigured_price_id',
        message: `stripe_price_id inválido no banco (precisa ser price_*): ${String(plan_slug).toUpperCase()}/${billing_cycle}`
      }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    console.log('billing-checkout→price', { plan_slug: String(plan_slug).toUpperCase(), billing_cycle, priceId });

    const { data: empresa, error: empErr } = await supabaseAdmin
      .from("empresas")
      .select("id, fantasia, razao_social, nome_fantasia, nome_razao_social, cnpj, stripe_customer_id")
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
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    const empresaCnpj = (empresa as any)?.cnpj ? String((empresa as any).cnpj).replace(/\D/g, "") : "";
    const displayRazao = (empresa as any)?.razao_social ?? (empresa as any)?.nome_razao_social ?? null;
    const displayFantasia = (empresa as any)?.fantasia ?? (empresa as any)?.nome_fantasia ?? null;
    const displayName = (displayFantasia || displayRazao || `Empresa ${empresa_id}`) as string;

    let customerId = (empresa as any).stripe_customer_id as string | null;
    if (!customerId) {
      // Primeiro tenta reusar um Customer já existente neste ambiente (evita criar duplicados)
      // Obs: só funciona se o customer tiver metadata (empresa_id/cnpj).
      try {
        const q = `metadata['empresa_id']:'${empresa_id}'`;
        const found = await stripe.customers.search({ query: q, limit: 1 });
        const candidate = found.data?.[0];
        if (candidate?.id) customerId = candidate.id;
      } catch {
        // best-effort
      }

      // Fallback por CNPJ (mais humano e útil em dedupe).
      if (!customerId && empresaCnpj) {
        try {
          const q = `metadata['cnpj']:'${empresaCnpj}'`;
          const found = await stripe.customers.search({ query: q, limit: 1 });
          const candidate = found.data?.[0];
          if (candidate?.id) customerId = candidate.id;
        } catch {
          // best-effort
        }
      }

      if (!customerId) {
        const customer = await stripe.customers.create({
          name: displayName,
          email: user.email ?? undefined,
          metadata: { empresa_id, ...(empresaCnpj ? { cnpj: empresaCnpj } : {}) },
        });
        customerId = customer.id;
      }

      // Persistência é best-effort: em alguns hardenings, service_role não tem UPDATE em `empresas`.
      const { error: upErr } = await supabaseAdmin
        .from("empresas")
        .update({ stripe_customer_id: customerId })
        .eq("id", empresa_id);
      if (upErr) {
        console.warn("billing-checkout: failed to persist stripe_customer_id (best-effort)", upErr);
      }
    } else {
      // Garantir que o customer existe no ambiente atual (ex.: trocou test→prod e o cus_* não existe no novo modo)
      try {
        const c = await stripe.customers.retrieve(customerId);
        if ((c as any)?.deleted) throw { code: "resource_missing", message: "Customer deleted" };
      } catch (_e: any) {
        const code = (_e as any)?.code ?? (_e as any)?.raw?.code ?? null;
        if (code === "resource_missing") {
          const customer = await stripe.customers.create({
            name: empresa.fantasia ?? empresa.razao_social ?? undefined,
            email: user.email ?? undefined,
            metadata: { empresa_id },
          });
          customerId = customer.id;
          const { error: upErr } = await supabaseAdmin
            .from("empresas")
            .update({ stripe_customer_id: customerId })
            .eq("id", empresa_id);
          if (upErr) {
            console.warn("billing-checkout: failed to persist stripe_customer_id after recreate (best-effort)", upErr);
          }
        }
      }

      // Compat: clientes antigos podem existir sem metadata.empresa_id (webhook depende disso).
      try {
        await stripe.customers.update(customerId, {
          metadata: { empresa_id, ...(empresaCnpj ? { cnpj: empresaCnpj } : {}) },
          name: displayName,
          email: user.email ?? undefined,
        });
      } catch {
        // best-effort
      }
    }

    // 6) SITE_URL sanity (prefer origin when it's a known domain)
    const siteUrl = pickSiteUrl(req);
    if (!siteUrl) {
      return new Response(JSON.stringify({ error: 'config_error', message: 'SITE_URL não configurada' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 7) Checkout session (trial via código)
    const trialDays = parseTrialDays();
    let allowTrial = typeof trial === 'boolean' ? trial : trialDays > 0;
    if (allowTrial) {
      try {
        const existing = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
        if ((existing?.data?.length ?? 0) > 0) {
          allowTrial = false;
        }
      } catch (_e) {
        // best-effort: se não der pra verificar, mantém o comportamento padrão sem travar o checkout
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      // Estado da arte SaaS: coleta forma de pagamento mesmo em trial (evita churn no fim do beta).
      payment_method_collection: allowTrial ? "always" : "if_required",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${siteUrl}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/app/billing/cancel`,
      metadata: { empresa_id, plan_slug: String(plan_slug).toUpperCase(), billing_cycle, kind: 'subscription' },
      subscription_data: {
        ...(allowTrial ? { trial_period_days: trialDays } : {}),
        ...(allowTrial
          ? { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } }
          : {}),
        metadata: { empresa_id, plan_slug: String(plan_slug).toUpperCase(), billing_cycle },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (e: any) {
    // Stripe errors are common when key/price mode mismatch (test vs live), or price ID is wrong.
    const stripeCode = (e as any)?.code ?? (e as any)?.raw?.code ?? null;
    const stripeType = (e as any)?.type ?? (e as any)?.raw?.type ?? (e as any)?.name ?? null;
    const stripeMessage = String((e as any)?.message ?? "");

    if (stripeType === "StripePermissionError") {
      console.error("billing-checkout: stripe permission error", { stripeType, stripeCode, stripeMessage });
      return new Response(
        JSON.stringify({
          error: "stripe_permission_error",
          message:
            "A chave do Stripe não tem permissão para criar Checkout. Use uma Secret Key (sk_...) com permissões de Billing/Checkout.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (stripeCode === "resource_missing" || /no such price/i.test(stripeMessage) || /no such customer/i.test(stripeMessage)) {
      console.error("billing-checkout: stripe resource missing", { stripeType, stripeCode, stripeMessage });
      return new Response(
        JSON.stringify({
          error: "stripe_resource_missing",
          message:
            "Um recurso do Stripe não foi encontrado (plano/cliente). Verifique se o Price ID está correto e se a chave Stripe (teste/produção) corresponde ao ambiente atual.",
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (stripeType === "StripeAuthenticationError") {
      console.error("billing-checkout: stripe auth error", { stripeType, stripeCode, stripeMessage });
      return new Response(
        JSON.stringify({
          error: "stripe_auth_error",
          message:
            "Falha de autenticação com o Stripe. Verifique se STRIPE_SECRET_KEY é uma Secret Key válida (sk_* ou rk_*) e corresponde ao ambiente (teste/produção).",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.error("billing-checkout error:", e);
    return new Response(
      JSON.stringify({ error: "internal_server_error", message: "Falha ao iniciar checkout. Tente novamente." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});

import Stripe from "stripe";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type StripeSubscription = Stripe.Subscription;
type StripeCheckoutSession = Stripe.Checkout.Session;

type Cycle = "monthly" | "yearly";
type PlanKey = `${"ESSENCIAL" | "PRO" | "MAX" | "INDUSTRIA" | "SCALE"}/${Cycle}`;

function json(corsHeaders: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function resolveStripeSecretKey(req: Request): string {
  const origin = (req.headers.get("origin") ?? "").trim().toLowerCase();
  const primary = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  const test = (Deno.env.get("STRIPE_SECRET_KEY_TEST") ?? "").trim();
  const live = (Deno.env.get("STRIPE_SECRET_KEY_LIVE") ?? "").trim();

  if (!primary && !test && !live) return "";

  const isProdOrigin = origin === "https://ultria.com.br"
    || origin.endsWith(".ultria.com.br")
    || origin === "https://erprevo.com"
    || origin.endsWith(".erprevo.com");
  const isDevOrigin = origin === "https://ultriadev.com.br"
    || origin.endsWith(".ultriadev.com.br")
    || origin === "https://erprevodev.com"
    || origin.endsWith(".erprevodev.com")
    || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");

  if (isProdOrigin && live) return live;
  if (isDevOrigin && test) return test;
  return primary || live || test;
}

function isLocalOrigin(origin: string): boolean {
  const o = origin.trim().toLowerCase();
  return o === "http://localhost:5173"
    || o === "http://127.0.0.1:5173"
    || o === "http://localhost:4173"
    || o === "http://127.0.0.1:4173";
}

function isProdOrigin(origin: string): boolean {
  const o = origin.trim().toLowerCase();
  return o === "https://ultria.com.br"
    || o.endsWith(".ultria.com.br")
    || o === "https://erprevo.com"
    || o.endsWith(".erprevo.com");
}

function pickSiteUrl(req: Request, stripeSecretKey: string): string | null {
  const envUrl = (Deno.env.get("SITE_URL") ?? "").trim();
  const origin = (req.headers.get("origin") ?? "").trim();

  const allowedExact = new Set<string>([
    "https://ultria.com.br",
    "https://www.ultria.com.br",
    "https://ultriadev.com.br",
    "https://erprevo.com",
    "https://erprevodev.com",
  ]);

  const isLive = stripeSecretKey.startsWith("sk_live_") || stripeSecretKey.startsWith("rk_live_");
  const allowLocal = !isLive && isLocalOrigin(origin);

  const candidate = (allowedExact.has(origin) || allowLocal) ? origin : envUrl;

  if (allowedExact.has(candidate) || allowLocal) return candidate;
  if (candidate) return candidate;
  return null;
}

function getDefaultPriceMap(stripeSecretKey: string): Partial<Record<PlanKey, string>> {
  const isLive = stripeSecretKey.startsWith("sk_live_") || stripeSecretKey.startsWith("rk_live_");
  return isLive
    ? {
        // LIVE (prod)
        "ESSENCIAL/monthly": "price_1Sn4tY5Ay7EJ5Bv6sBQmL5y7",
        "ESSENCIAL/yearly": "price_1Sn4uY5Ay7EJ5Bv6T5O0gQJ8",
        "PRO/monthly": "price_1Sn4sY5Ay7EJ5Bv6bq9lX1vR",
        "PRO/yearly": "price_1Sn4sY5Ay7EJ5Bv6fQHqk5mW",
        "MAX/monthly": "price_1Sn4rY5Ay7EJ5Bv6C1Z6mKx9",
        "MAX/yearly": "price_1Sn4rY5Ay7EJ5Bv6o8C7q9rB",
        "INDUSTRIA/monthly": "price_1Sn4xY5Ay7EJ5Bv6P0mT8e7X",
        "INDUSTRIA/yearly": "price_1Sn4yY5Ay7EJ5Bv6f8wF1z3Q",
        "SCALE/monthly": "price_1Sn4vY5Ay7EJ5Bv6CEgLq3Ds",
        "SCALE/yearly": "price_1Sn4wY5Ay7EJ5Bv6ryXw73vz",
      }
    : {
        // TEST (dev)
        "ESSENCIAL/monthly": "price_1SlEtV5Ay7EJ5Bv6cF4GbdCT",
        "ESSENCIAL/yearly": "price_1SlEs35Ay7EJ5Bv6c8qj9xvO",
        "PRO/monthly": "price_1SlEwN5Ay7EJ5Bv6KfF4uBvK",
        "PRO/yearly": "price_1SlEw05Ay7EJ5Bv6yH8u2r2G",
        "MAX/monthly": "price_1SlEvg5Ay7EJ5Bv6Wl8e4XcN",
        "MAX/yearly": "price_1SlEur5Ay7EJ5Bv6VQyq6GQY",
        "INDUSTRIA/monthly": "price_1SlEwz5Ay7EJ5Bv6n2J7G8vV",
        "INDUSTRIA/yearly": "price_1SlEwG5Ay7EJ5Bv6Z1vQ2e3B",
        "SCALE/monthly": "price_1SlEux5Ay7EJ5Bv69CGu3fra",
        "SCALE/yearly": "price_1SlEvT5Ay7EJ5Bv6gnYH2sb1",
      };
}

function normalizePlanSlug(raw: string | null | undefined): string | null {
  const slug = String(raw ?? "").trim().toUpperCase();
  const allowed = new Set(["ESSENCIAL", "PRO", "MAX", "INDUSTRIA", "SCALE"]);
  return allowed.has(slug) ? slug : null;
}

function normalizeBillingCycle(raw: string | null | undefined): Cycle | null {
  const cycle = String(raw ?? "").trim().toLowerCase();
  if (cycle === "monthly" || cycle === "yearly") return cycle as Cycle;
  return null;
}

function parseTrialDays(): number {
  const raw = (Deno.env.get("BILLING_TRIAL_DAYS") ?? "").trim();
  const fallback = 60;
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(3650, n));
}

function inferPlanSlugFromPriceId(stripeSecretKey: string, stripePriceId: string): { slug: string; billing_cycle: Cycle } | null {
  const entries = Object.entries(getDefaultPriceMap(stripeSecretKey));
  const found = entries.find(([, v]) => String(v) === String(stripePriceId));
  if (!found) return null;
  const [key] = found as [string, string];
  const [slug, cycle] = key.split("/");
  if (!slug || (cycle !== "monthly" && cycle !== "yearly")) return null;
  return { slug, billing_cycle: cycle as Cycle };
}

function pickBestOpenCheckoutSession(sessions: StripeCheckoutSession[]): StripeCheckoutSession | null {
  const opened = sessions
    .filter((s) => s?.mode === "subscription" && s?.status === "open" && typeof s?.url === "string" && s.url);
  if (opened.length === 0) return null;
  return [...opened].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0]!;
}

function pickBestSessionWithPlanMetadata(sessions: StripeCheckoutSession[]): { planSlug: string; billingCycle: Cycle } | null {
  const sorted = [...sessions].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  for (const s of sorted) {
    if (s?.mode !== "subscription") continue;
    const planSlug = normalizePlanSlug((s as any)?.metadata?.plan_slug);
    const billingCycle = normalizeBillingCycle((s as any)?.metadata?.billing_cycle);
    if (planSlug && billingCycle) return { planSlug, billingCycle };
  }
  return null;
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
      .select("id, stripe_customer_id, cnpj")
      .eq("id", empresa_id)
      .maybeSingle();
    if (empErr || !empresa) {
      return json(corsHeaders, 404, { error: "company_not_found" });
    }

    const empresaCnpj = (empresa as any)?.cnpj ? String((empresa as any).cnpj).replace(/\D/g, "") : "";
    const customerId = (empresa as any).stripe_customer_id ? String((empresa as any).stripe_customer_id) : "";
    const stripeSecretKey = resolveStripeSecretKey(req);
    if (!stripeSecretKey) {
      return json(corsHeaders, 500, { error: "config_error", message: "STRIPE_SECRET_KEY ausente (ou não resolvido para este ambiente)." });
    }
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    // Auto-link: tenta encontrar o Customer no Stripe via metadata.empresa_id (evita fricção no app).
    // Obs: isso só funciona se o Customer/Subscription foi criado por nós (billing-checkout) ou se o metadata foi setado.
    let effectiveCustomerId = customerId;
    if (!effectiveCustomerId) {
      try {
        const q = `metadata['empresa_id']:'${empresa_id}'`;
        const found = await stripe.customers.search({ query: q, limit: 1 });
        const candidate = found.data?.[0];
        if (candidate?.id) {
          effectiveCustomerId = candidate.id;
          const { error: updErr } = await admin
            .from("empresas")
            .update({ stripe_customer_id: effectiveCustomerId })
            .eq("id", empresa_id);
          if (updErr) {
            console.warn("billing-sync-subscription: failed to persist stripe_customer_id (best-effort)", updErr);
          }
        }
      } catch (e) {
        console.warn("billing-sync-subscription: customer auto-link search failed (best-effort)", e);
      }
    }

    if (!effectiveCustomerId && empresaCnpj) {
      try {
        const q = `metadata['cnpj']:'${empresaCnpj}'`;
        const found = await stripe.customers.search({ query: q, limit: 1 });
        const candidate = found.data?.[0];
        if (candidate?.id) {
          effectiveCustomerId = candidate.id;
          const { error: updErr } = await admin
            .from("empresas")
            .update({ stripe_customer_id: effectiveCustomerId })
            .eq("id", empresa_id);
          if (updErr) {
            console.warn("billing-sync-subscription: failed to persist stripe_customer_id (best-effort)", updErr);
          }
        }
      } catch (e) {
        console.warn("billing-sync-subscription: customer auto-link search by cnpj failed (best-effort)", e);
      }
    }

    if (!effectiveCustomerId) {
      // Último fallback (best-effort): busca por email e escolhe o customer com "melhor" subscription.
      // Isso ajuda a reparar casos antigos onde o customer foi criado sem metadata.
      const email = (user.email ?? "").trim();
      if (email) {
        try {
          const found = await stripe.customers.search({ query: `email:'${email}'`, limit: 10 });
          const candidates = found.data ?? [];
          if (candidates.length > 0) {
            let best: { customerId: string; sub: StripeSubscription | null } | null = null;
            for (const c of candidates) {
              const listed = await stripe.subscriptions.list({
                customer: c.id,
                status: "all",
                limit: 10,
              });
              const picked = pickBestSubscription(listed.data as StripeSubscription[]);
              if (!picked) continue;
              if (!best) {
                best = { customerId: c.id, sub: picked };
                continue;
              }
              const pa = (best.sub?.status ?? "canceled") as any;
              const pb = (picked.status ?? "canceled") as any;
              // Reutiliza o mesmo critério de prioridade de pickBestSubscription
              const priority: Record<string, number> = {
                active: 0,
                trialing: 1,
                past_due: 2,
                unpaid: 3,
                incomplete: 4,
                incomplete_expired: 5,
                canceled: 6,
              };
              const ca = priority[pa] ?? 99;
              const cb = priority[pb] ?? 99;
              if (cb < ca) best = { customerId: c.id, sub: picked };
              else if (cb === ca) {
                const ea = best.sub?.current_period_end ?? 0;
                const eb = picked.current_period_end ?? 0;
                if (eb > ea) best = { customerId: c.id, sub: picked };
              }
            }

            if (best?.customerId) {
              effectiveCustomerId = best.customerId;
              const { error: updErr } = await admin
                .from("empresas")
                .update({ stripe_customer_id: effectiveCustomerId })
                .eq("id", empresa_id);
              if (updErr) {
                console.warn("billing-sync-subscription: failed to persist stripe_customer_id from email fallback (best-effort)", updErr);
              }
              try {
                await stripe.customers.update(effectiveCustomerId, {
                  metadata: { empresa_id, ...(empresaCnpj ? { cnpj: empresaCnpj } : {}) },
                });
              } catch {
                // best-effort
              }
            }
          }
        } catch (e) {
          console.warn("billing-sync-subscription: customer auto-link search by email failed (best-effort)", e);
        }
      }
    }

    if (!effectiveCustomerId) {
      // 400 (e não 404) para evitar confusão com "Edge Function não encontrada".
      return json(corsHeaders, 400, { error: "missing_customer", message: "Cliente Stripe não encontrado para esta empresa." });
    }

    const listed = await stripe.subscriptions.list({
      customer: effectiveCustomerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price"],
    });

    const best = pickBestSubscription(listed.data as StripeSubscription[]);
    if (!best) {
      // Estado da arte: em casos de checkout incompleto/cancelado, a empresa pode existir no Stripe
      // (customer criado), mas ainda não há subscription.
      //
      // O botão "Sincronizar com Stripe" deve funcionar como mecanismo de recuperação:
      // - se houver checkout aberto, devolvemos a URL para retomar;
      // - se não houver checkout aberto, tentamos recriar uma sessão a partir do último intent registrado no Stripe;
      // - se ainda não for possível, orientamos o usuário a voltar para seleção de planos (sem travar).
      let sessions: StripeCheckoutSession[] = [];
      try {
        const res = await stripe.checkout.sessions.list({ customer: effectiveCustomerId, limit: 20 });
        sessions = (res?.data ?? []) as StripeCheckoutSession[];
      } catch {
        sessions = [];
      }

      const open = pickBestOpenCheckoutSession(sessions);
      if (open?.url) {
        return json(corsHeaders, 200, {
          synced: false,
          error: "no_subscription",
          next_action: "resume_checkout",
          checkout_url: open.url,
          message: "Checkout pendente. Vamos retomar o check-in no Stripe.",
        });
      }

      const planIntent = pickBestSessionWithPlanMetadata(sessions);
      if (planIntent) {
        const { planSlug, billingCycle } = planIntent;
        const siteUrl = pickSiteUrl(req, stripeSecretKey);
        if (!siteUrl) {
          return json(corsHeaders, 200, {
            synced: false,
            error: "no_subscription",
            next_action: "choose_plan",
            message: "Checkout pendente, mas não foi possível resolver a URL do site. Volte e selecione o plano novamente.",
          });
        }

        // Resolve price_id (DB é fonte de verdade, com fallback para map padrão do ambiente).
        let priceId: string | null = null;
        try {
          const { data: planRow2 } = await admin
            .from("plans")
            .select("stripe_price_id")
            .eq("slug", planSlug)
            .eq("billing_cycle", billingCycle)
            .eq("active", true)
            .maybeSingle();
          priceId = (planRow2 as any)?.stripe_price_id ? String((planRow2 as any).stripe_price_id) : null;
        } catch {
          priceId = null;
        }
        if (!priceId) {
          const key = `${planSlug}/${billingCycle}` as PlanKey;
          const fallback = getDefaultPriceMap(stripeSecretKey)[key] ?? null;
          priceId = fallback ? String(fallback) : null;
        }

        if (!priceId) {
          return json(corsHeaders, 200, {
            synced: false,
            error: "no_subscription",
            next_action: "choose_plan",
            message: "Não foi possível identificar o plano no Stripe para retomar o checkout. Selecione o plano novamente.",
          });
        }

        // Trial best-effort (mesma lógica de billing-checkout, sem bloquear recuperação).
        const trialDays = parseTrialDays();
        let allowTrial = trialDays > 0;
        if (allowTrial) {
          try {
            const existing = await stripe.subscriptions.list({ customer: effectiveCustomerId, status: "all", limit: 1 });
            if ((existing?.data?.length ?? 0) > 0) allowTrial = false;
          } catch {
            // best-effort
          }
        }

        const newSession = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: effectiveCustomerId,
          payment_method_collection: allowTrial ? "always" : "if_required",
          line_items: [{ price: priceId, quantity: 1 }],
          allow_promotion_codes: true,
          success_url: `${siteUrl}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/app/billing/cancel`,
          metadata: { empresa_id, plan_slug: planSlug, billing_cycle: billingCycle, kind: "subscription" },
          subscription_data: {
            ...(allowTrial ? { trial_period_days: trialDays } : {}),
            ...(allowTrial
              ? { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } }
              : {}),
            metadata: { empresa_id, plan_slug: planSlug, billing_cycle: billingCycle },
          },
        });

        if (newSession?.url) {
          return json(corsHeaders, 200, {
            synced: false,
            error: "no_subscription",
            next_action: "resume_checkout",
            checkout_url: newSession.url,
            message: "Checkout anterior não estava mais disponível. Criamos um novo check-in no Stripe.",
          });
        }
      }

      return json(corsHeaders, 200, {
        synced: false,
        error: "no_subscription",
        next_action: "choose_plan",
        message: "Nenhuma assinatura encontrada no Stripe. Selecione um plano para iniciar o checkout.",
      });
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
    let planSlug = planRow?.slug ?? null;

    // Estado da arte: em DEV/ambientes novos, o catálogo de planos pode não estar preenchido com os price_ids do ambiente (test vs live).
    // Para evitar que o app fique preso na tela de assinatura (entitlements/plan_slug nulo), fazemos self-heal best-effort.
    if (!planSlug) {
      const inferred = inferPlanSlugFromPriceId(stripeSecretKey, stripePriceId);
      if (inferred?.slug) {
        planSlug = inferred.slug;
        try {
          await admin
            .from("plans")
            .upsert(
              {
                slug: inferred.slug as any,
                name: inferred.slug,
                billing_cycle: inferred.billing_cycle as any,
                currency: (price?.currency ?? "brl").toUpperCase(),
                amount_cents: (price?.unit_amount ?? 0) as any,
                stripe_price_id: stripePriceId,
                active: true,
              } as any,
              { onConflict: "slug,billing_cycle" },
            );
        } catch (e) {
          console.warn("billing-sync-subscription: failed to self-heal plan mapping (best-effort)", e);
        }
      }
    }

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

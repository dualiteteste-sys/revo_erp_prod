import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request): Promise<Response> => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Assinatura do Stripe ausente", { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await req.arrayBuffer();
    event = stripe.webhooks.constructEvent(Buffer.from(raw), sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Erro no Webhook: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type.startsWith("customer.subscription.")) {
    try {
        const sub = event.data.object as Stripe.Subscription;
        const price = sub.items?.data?.[0]?.price;
        if (!price?.id || !price.recurring?.interval) {
          console.warn("Webhook ignorado: Informações de preço ausentes na assinatura", sub.id);
          return new Response("Informações de preço ausentes", { status: 400 });
        }

        const stripePriceId = price.id;
        const billingCycle = price.recurring.interval === "year" ? "yearly" : "monthly";
        
        // Obter empresa_id dos metadados da assinatura, com fallback para os metadados do cliente
        let empresaId = sub.metadata?.empresa_id ?? null;
        if (!empresaId && sub.customer) {
            const customer = await stripe.customers.retrieve(sub.customer as string);
            if (!customer.deleted) {
                empresaId = customer.metadata?.empresa_id ?? null;
            }
        }
        if (!empresaId) {
            console.error("Erro no Webhook: empresa_id não encontrado para a assinatura", sub.id);
            return new Response("empresa_id não encontrado", { status: 400 });
        }

        // Mapear plano no catálogo local
        const { data: planRow, error: planErr } = await supabaseAdmin
          .from("plans")
          .select("slug")
          .eq("stripe_price_id", stripePriceId)
          .eq("active", true)
          .maybeSingle();
        if (planErr || !planRow?.slug) {
            console.error(`Erro no Webhook: Preço ${stripePriceId} não mapeado em public.plans`);
            return new Response("Preço não mapeado em public.plans", { status: 400 });
        }
        const planSlug = planRow.slug as "START" | "PRO" | "MAX" | "ULTRA";

        const status = event.type === "customer.subscription.deleted" ? "canceled" : (sub.status as any);
        const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

        // Chamar a RPC segura para inserir/atualizar a assinatura
        const { error: rpcErr } = await supabaseAdmin.rpc("upsert_subscription", {
          p_empresa_id: empresaId,
          p_status: status,
          p_current_period_end: currentPeriodEnd,
          p_price_id: stripePriceId,
          p_sub_id: sub.id,
          p_plan_slug: planSlug,
          p_billing_cycle: billingCycle,
          p_cancel_at_period_end: event.type === "customer.subscription.deleted" ? true : !!sub.cancel_at_period_end,
        });

        if (rpcErr) {
            console.error("Erro ao chamar a RPC upsert_subscription:", rpcErr);
            throw rpcErr;
        }
    } catch (e) {
        console.error("Erro ao processar evento de assinatura:", e);
        return new Response(`Erro interno: ${(e as Error).message}`, { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
});

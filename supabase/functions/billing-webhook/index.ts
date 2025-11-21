import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

type SubscriptionStatus = "trialing"|"active"|"past_due"|"canceled"|"unpaid"|"incomplete"|"incomplete_expired";

function mapStatus(s: string): SubscriptionStatus {
  const validStatus: SubscriptionStatus[] = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"];
  if (validStatus.includes(s as SubscriptionStatus)) {
    return s as SubscriptionStatus;
  }
  return "active"; // Fallback seguro
}

Deno.serve(async (req) => {
  const sig = req.headers.get("Stripe-Signature") ?? "";
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // Nada a fazer aqui; assinaturas virão nos eventos de subscription.*
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const stripePriceId = (sub.items.data[0]?.price?.id) || null;
        const customerId = sub.customer as string;
        
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const empresaId = (customer.metadata?.empresa_id) as string | undefined;

        if (!empresaId) {
          console.warn(`Webhook: empresa_id não encontrado no metadata do customer ${customerId} para a assinatura ${sub.id}`);
          break;
        }

        let plan_slug: string | null = null;
        let billing_cycle: "monthly"|"yearly"|null = null;
        if (stripePriceId) {
          const { data: p } = await admin.from("plans").select("slug, billing_cycle").eq("stripe_price_id", stripePriceId).maybeSingle();
          plan_slug = p?.slug ?? null;
          billing_cycle = p?.billing_cycle as "monthly" | "yearly" | null;
        }

        const currentEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

        const { error } = await admin.from("subscriptions").upsert({
          empresa_id: empresaId,
          status: mapStatus(sub.status),
          current_period_end: currentEnd,
          stripe_subscription_id: sub.id,
          stripe_price_id: stripePriceId,
          plan_slug: plan_slug,
          billing_cycle: billing_cycle,
          cancel_at_period_end: sub.cancel_at_period_end ?? false
        }, { onConflict: "empresa_id" });

        if (error) throw error;

        break;
      }

      default:
        break;
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: "handler_error", detail: String(e) }), { status: 500 });
  }
});

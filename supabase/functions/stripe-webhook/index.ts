import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { finopsTrackUsage } from "../_shared/finops.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type StripeWebhookEventRow = {
  id: string;
  empresa_id: string | null;
  stripe_event_id: string;
  event_type: string;
  processed_at: string | null;
  locked_at: string | null;
  next_retry_at: string | null;
  process_attempts: number;
  last_error: string | null;
};

function toIso(d: Date) {
  return d.toISOString();
}

function nextRetryAt(attempts: number, now: Date): string {
  const min = Math.min(Math.max(5, attempts * 5), 60);
  return toIso(new Date(now.getTime() + min * 60 * 1000));
}

async function safeUpdateStripeEvent(id: string, patch: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("billing_stripe_webhook_events").update(patch).eq("id", id);
  } catch (e) {
    console.warn("stripe-webhook: falha ao atualizar billing_stripe_webhook_events (best-effort)", e);
  }
}

async function ensureStripeEventRow(params: {
  stripeEventId: string;
  eventType: string;
  requestId: string | null;
  livemode: boolean;
}): Promise<StripeWebhookEventRow> {
  const now = new Date();
  const insertPayload = {
    stripe_event_id: params.stripeEventId,
    event_type: params.eventType,
    livemode: params.livemode,
    received_at: toIso(now),
    request_id: params.requestId,
    meta: { livemode: params.livemode },
  };

  const ins = await supabaseAdmin
    .from("billing_stripe_webhook_events")
    .insert(insertPayload)
    .select(
      "id,empresa_id,stripe_event_id,event_type,processed_at,locked_at,next_retry_at,process_attempts,last_error",
    )
    .maybeSingle();

  if (ins.error) {
    const msg = String((ins.error as any)?.message || "");
    // Duplicado: buscar a linha existente.
    if (msg.includes("duplicate") || msg.includes("already exists") || msg.includes("23505")) {
      const existing = await supabaseAdmin
        .from("billing_stripe_webhook_events")
        .select(
          "id,empresa_id,stripe_event_id,event_type,processed_at,locked_at,next_retry_at,process_attempts,last_error",
        )
        .eq("stripe_event_id", params.stripeEventId)
        .maybeSingle();
      if (existing.error || !existing.data) {
        throw existing.error ?? new Error("Falha ao buscar evento Stripe existente.");
      }
      return existing.data as StripeWebhookEventRow;
    }
    throw ins.error;
  }

  if (!ins.data) throw new Error("Falha ao registrar evento Stripe.");
  return ins.data as StripeWebhookEventRow;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Assinatura do Stripe ausente", { status: 400 });

  let event: Stripe.Event;
  try {
    // Deno/Supabase Edge: usar o corpo bruto como string para evitar dependência de Buffer (Node).
    // Importante: NÃO parsear JSON antes da verificação de assinatura.
    const payload = await req.text();
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Erro no Webhook: ${(err as Error).message}`, { status: 400 });
  }

  const requestId = req.headers.get("x-revo-request-id");
  let evRow: StripeWebhookEventRow | null = null;
  try {
    evRow = await ensureStripeEventRow({
      stripeEventId: event.id,
      eventType: event.type,
      requestId,
      livemode: !!event.livemode,
    });
    if (evRow.processed_at) {
      return new Response("ok", { status: 200 });
    }
  } catch (e) {
    console.warn("stripe-webhook: falha ao registrar evento (best-effort)", e);
  }

  if (event.type.startsWith("customer.subscription.")) {
    try {
        const now = new Date();
        if (evRow?.id) {
          try {
            await supabaseAdmin
              .from("billing_stripe_webhook_events")
              .update({
                locked_at: toIso(now),
                process_attempts: (evRow.process_attempts ?? 0) + 1,
                last_error: null,
                next_retry_at: null,
              })
              .eq("id", evRow.id);
          } catch {
            // best-effort
          }
        }

        const sub = event.data.object as Stripe.Subscription;
        const price = sub.items?.data?.[0]?.price;
        if (!price?.id || !price.recurring?.interval) {
          console.warn("Webhook ignorado: Informações de preço ausentes na assinatura", sub.id);
          if (evRow?.id) {
            await safeUpdateStripeEvent(evRow.id, {
              stripe_subscription_id: sub.id,
              stripe_customer_id: sub.customer ? String(sub.customer) : null,
              last_error: "Informações de preço ausentes na assinatura",
              locked_at: null,
              next_retry_at: nextRetryAt((evRow.process_attempts ?? 0) + 1, now),
            });
          }
          return new Response("Informações de preço ausentes", { status: 400 });
        }

        const stripePriceId = price.id;
        const billingCycle = price.recurring.interval === "year" ? "yearly" : "monthly";
        
        // Obter empresa_id dos metadados da assinatura, com fallback para os metadados do cliente
        let empresaId = sub.metadata?.empresa_id ?? null;
        const customerId = sub.customer ? String(sub.customer) : null;
        if (!empresaId && customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted) {
            empresaId = customer.metadata?.empresa_id ?? null;
          }
        }
        // Fallback final: mapear customerId → empresa via DB (evita depender de metadata)
        if (!empresaId && customerId) {
          const { data: empRow, error: empErr } = await supabaseAdmin
            .from("empresas")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          if (empErr) {
            console.error("Erro no Webhook: falha ao buscar empresa por stripe_customer_id", { customerId, empErr });
          }
          empresaId = empRow?.id ?? null;
        }
        if (!empresaId) {
            console.error("Erro no Webhook: empresa_id não encontrado para a assinatura", sub.id);
            if (evRow?.id) {
              await safeUpdateStripeEvent(evRow.id, {
                stripe_subscription_id: sub.id,
                stripe_customer_id: customerId,
                stripe_price_id: stripePriceId,
                billing_cycle: billingCycle,
                subscription_status: sub.status,
                current_period_end: sub.current_period_end ? toIso(new Date(sub.current_period_end * 1000)) : null,
                cancel_at_period_end: !!sub.cancel_at_period_end,
                last_error: "empresa_id não encontrado",
                locked_at: null,
                next_retry_at: nextRetryAt((evRow.process_attempts ?? 0) + 1, now),
              });
            }
            return new Response("empresa_id não encontrado", { status: 400 });
        }

        // FINOPS (best-effort): 1 evento = 1 unidade de custo/volume no canal Stripe.
        await finopsTrackUsage({ admin: supabaseAdmin as any, empresaId, source: "stripe", event: event.type, count: 1 });

        // Best-effort: preencher stripe_customer_id no cadastro da empresa (evita "missing_customer" no app).
        if (customerId) {
          try {
            const { data: emp, error: empErr } = await supabaseAdmin
              .from("empresas")
              .select("stripe_customer_id")
              .eq("id", empresaId)
              .maybeSingle();
            if (empErr) {
              console.warn("Webhook: falha ao ler empresa (best-effort)", { empresaId, empErr });
            } else if (emp && !emp.stripe_customer_id) {
              const { error: updErr } = await supabaseAdmin
                .from("empresas")
                .update({ stripe_customer_id: customerId })
                .eq("id", empresaId);
              if (updErr) {
                console.warn("Webhook: falha ao atualizar stripe_customer_id (best-effort)", { empresaId, customerId, updErr });
              }
            }
          } catch (e) {
            console.warn("Webhook: erro ao fazer backfill de stripe_customer_id (best-effort)", e);
          }
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
            if (evRow?.id) {
              await safeUpdateStripeEvent(evRow.id, {
                empresa_id: empresaId,
                stripe_subscription_id: sub.id,
                stripe_customer_id: customerId,
                stripe_price_id: stripePriceId,
                billing_cycle: billingCycle,
                subscription_status: sub.status,
                current_period_end: sub.current_period_end ? toIso(new Date(sub.current_period_end * 1000)) : null,
                cancel_at_period_end: !!sub.cancel_at_period_end,
                last_error: "Preço não mapeado em public.plans",
                locked_at: null,
                next_retry_at: nextRetryAt((evRow.process_attempts ?? 0) + 1, now),
              });
            }
            return new Response("Preço não mapeado em public.plans", { status: 400 });
        }
        const planSlug = planRow.slug as string;

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

        if (evRow?.id) {
          await safeUpdateStripeEvent(evRow.id, {
            empresa_id: empresaId,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            stripe_price_id: stripePriceId,
            plan_slug: planSlug,
            billing_cycle: billingCycle,
            subscription_status: status,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: event.type === "customer.subscription.deleted" ? true : !!sub.cancel_at_period_end,
            processed_at: toIso(now),
            locked_at: null,
            next_retry_at: null,
            last_error: null,
          });
        }
    } catch (e) {
        console.error("Erro ao processar evento de assinatura:", e);
        if (evRow?.id) {
          const now = new Date();
          const attempts = (evRow.process_attempts ?? 0) + 1;
          await safeUpdateStripeEvent(evRow.id, {
            locked_at: null,
            processed_at: null,
            next_retry_at: nextRetryAt(attempts, now),
            last_error: String((e as Error)?.message ?? e),
            process_attempts: attempts,
          });
        }
        return new Response(`Erro interno: ${(e as Error).message}`, { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
});

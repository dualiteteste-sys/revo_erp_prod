import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type BillingCycle = "monthly" | "yearly";
type Kind = "plan" | "addon";

function parseTrialDays(): number {
  const raw = (Deno.env.get("BILLING_TRIAL_DAYS") ?? "").trim();
  const fallback = 60;
  const n = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(3650, n));
}

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

  const allowHeaders = acrh || "authorization, x-client-info, apikey, content-type, x-revo-request-id";

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

function parseBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const raw = h.trim();
  if (!raw) return null;
  if (raw.toLowerCase().startsWith("bearer ")) return raw.slice(7).trim() || null;
  return null;
}

function normalizeBillingCycle(raw: unknown): BillingCycle | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "monthly" || v === "yearly") return v as BillingCycle;
  return null;
}

function normalizeKind(body: any): Kind {
  const k = String(body?.kind ?? "").trim().toLowerCase();
  if (k === "addon") return "addon";
  if (k === "plan") return "plan";
  // Compat: se veio addon_slug, assume addon.
  if (body?.addon_slug) return "addon";
  return "plan";
}

async function requireAuthenticatedMember(req: Request, empresaId: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false as const, status: 500, body: { error: "CONFIG_ERROR" } };
  }

  const token = parseBearerToken(req);
  if (!token) return { ok: false as const, status: 401, body: { error: "UNAUTHENTICATED" } };

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  const user = userData?.user ?? null;
  if (userErr || !user?.id) return { ok: false as const, status: 401, body: { error: "UNAUTHENTICATED" } };

  // Segurança P0: evita que alguém use `service_role` para operar em empresa de terceiros.
  const memberRes = await supabaseAdmin
    .from("empresa_usuarios")
    .select("empresa_id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id);

  const count = memberRes.count ?? 0;
  if (memberRes.error || count <= 0) {
    return { ok: false as const, status: 403, body: { error: "FORBIDDEN" } };
  }

  return { ok: true as const, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(req, 204);
  if (req.method !== "POST") return cors(req, 405, { error: "Method not allowed" });

  try {
    const body = await req.json().catch(() => ({} as any));

    const empresa_id = String(body?.empresa_id ?? "").trim();
    const billing_cycle = normalizeBillingCycle(body?.billing_cycle);
    const kind = normalizeKind(body);
    const plan_slug = String(body?.plan_slug ?? "").trim();
    const addon_slug = String(body?.addon_slug ?? "").trim();

    if (!empresa_id || !billing_cycle) {
      return cors(req, 400, { error: "INVALID_PARAMS", message: "Parâmetros ausentes/invalidos: empresa_id ou billing_cycle" });
    }

    const authz = await requireAuthenticatedMember(req, empresa_id);
    if (!authz.ok) return cors(req, authz.status, authz.body);

    if (kind === "plan" && !plan_slug) {
      return cors(req, 400, { error: "INVALID_PARAMS", message: "Parâmetros ausentes: plan_slug" });
    }
    if (kind === "addon" && !addon_slug) {
      return cors(req, 400, { error: "INVALID_PARAMS", message: "Parâmetros ausentes: addon_slug" });
    }

    const priceRow = kind === "addon"
      ? await supabaseAdmin
          .from("addons")
          .select("stripe_price_id, trial_days")
          .eq("slug", addon_slug)
          .eq("billing_cycle", billing_cycle)
          .eq("active", true)
          .maybeSingle()
      : await supabaseAdmin
          .from("plans")
          .select("stripe_price_id")
          .eq("slug", plan_slug)
          .eq("billing_cycle", billing_cycle)
          .eq("active", true)
          .maybeSingle();

    const stripePriceId = (priceRow as any)?.data?.stripe_price_id as string | null;
    const addonTrialDays = kind === "addon" ? ((priceRow as any)?.data?.trial_days as number | null) : null;
    const priceErr = (priceRow as any)?.error ?? null;

    if (priceErr || !stripePriceId) {
      return cors(req, 400, { error: "NOT_FOUND", message: kind === "addon" ? "Add-on não encontrado ou inativo" : "Plano não encontrado ou inativo" });
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
    } else {
      // Compat: clientes antigos podem existir sem metadata.empresa_id (webhook depende disso).
      try {
        await stripe.customers.update(customerId, {
          metadata: { empresa_id },
        });
      } catch (_e) {
        // best-effort
      }
    }

    // Trial:
    // - Add-on pode ter trial específico (quando definido no catálogo).
    // - Caso contrário, usa o trial padrão do ambiente (fase beta).
    const trialDays = Number.isFinite(addonTrialDays as any) && (addonTrialDays as number) != null
      ? Math.max(0, Math.min(3650, Number(addonTrialDays)))
      : parseTrialDays();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${SITE_URL}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/app/settings`,
      customer: customerId,
      payment_method_collection: trialDays > 0 ? "always" : "if_required",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        ...(trialDays > 0 ? { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
        metadata: { empresa_id },
      },
      metadata: { empresa_id },
    });

    return cors(req, 200, { url: session.url });
  } catch (e) {
    return cors(req, 500, { error: "INTERNAL_ERROR", message: (e as Error)?.message ?? String(e) });
  }
});

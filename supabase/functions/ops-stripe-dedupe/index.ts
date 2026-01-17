import Stripe from "npm:stripe@17.7.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type Action = "inspect" | "link" | "delete";
type DeleteSafety = "blocked_active_subscription" | "ok";

function json(corsHeaders: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function stripNonDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function isTruthy(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

async function logOpsEvent(supabase: any, input: { level: "info" | "warn" | "error"; event: string; message: string; context?: Record<string, unknown> }) {
  await supabase
    .rpc("log_app_event", {
      p_level: input.level,
      p_event: input.event,
      p_message: input.message,
      p_context: input.context ?? {},
      p_source: "ops-stripe-dedupe",
    })
    .then(() => null)
    .catch(() => null);
}

type CustomerSummary = {
  id: string;
  name: string | null;
  email: string | null;
  created: number;
  metadata: Record<string, string> | null;
  subscription: {
    id: string;
    status: string;
    current_period_end: number | null;
    price_id: string | null;
    interval: string | null;
  } | null;
};

type DuplicateGroup = {
  key: string;
  count: number;
  customer_ids: string[];
};

function groupDuplicatesBy(
  customers: CustomerSummary[],
  getKey: (c: CustomerSummary) => string | null,
): DuplicateGroup[] {
  const groups = new Map<string, string[]>();
  for (const c of customers) {
    const key = (getKey(c) ?? "").trim();
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(c.id);
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, count: ids.length, customer_ids: ids }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function pickBestCustomer(customers: CustomerSummary[]): CustomerSummary | null {
  if (customers.length === 0) return null;
  const priority: Record<string, number> = {
    active: 0,
    trialing: 1,
    past_due: 2,
    unpaid: 3,
    incomplete: 4,
    incomplete_expired: 5,
    canceled: 6,
  };

  return [...customers].sort((a, b) => {
    const sa = a.subscription?.status ?? "canceled";
    const sb = b.subscription?.status ?? "canceled";
    const pa = priority[sa] ?? 99;
    const pb = priority[sb] ?? 99;
    if (pa !== pb) return pa - pb;

    const ea = a.subscription?.current_period_end ?? 0;
    const eb = b.subscription?.current_period_end ?? 0;
    if (ea !== eb) return eb - ea;

    // fallback: mais novo
    return b.created - a.created;
  })[0]!;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(corsHeaders, 401, { error: "not_signed_in", message: "Token de autenticação ausente." });

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const supabaseAnonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
    if (!supabaseUrl || !supabaseAnonKey || !serviceKey || !stripeSecretKey) {
      return json(corsHeaders, 500, { error: "config_error", message: "Secrets ausentes (SUPABASE_URL/ANON/SERVICE_ROLE/STRIPE_SECRET_KEY)." });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return json(corsHeaders, 401, { error: "invalid_token", message: userErr?.message || "Token inválido." });

    const { data: canManage, error: permErr } = await supabaseAuth.rpc("has_permission_for_current_user", {
      p_module: "ops",
      p_action: "manage",
    });
    if (permErr || !canManage) {
      return json(corsHeaders, 403, { error: "forbidden", message: "Permissão insuficiente (ops/manage)." });
    }

    const payload = (await req.json().catch(() => ({}))) as {
      action?: Action;
      empresa_id?: string;
      email?: string;
      cnpj?: string;
      customer_id?: string;
      dry_run?: boolean;
    };
    const action = (payload.action ?? "inspect") as Action;
    const empresaId = (payload.empresa_id ?? "").trim();
    const inputEmail = (payload.email ?? "").trim().toLowerCase();
    const inputCnpj = stripNonDigits((payload.cnpj ?? "").trim());
    const explicitCustomerId = (payload.customer_id ?? "").trim();
    const dryRun = isTruthy(payload.dry_run);

    const admin = createClient(supabaseUrl, serviceKey);

    let empresa: Record<string, any> | null = null;
    if (empresaId) {
      // Importante: `empresas` já teve variações de schema (ex.: `nome_fantasia` vs `fantasia`),
      // então usamos `select('*')` para evitar erro de "coluna não existe" em produção.
      const { data, error } = await admin.from("empresas").select("*").eq("id", empresaId).maybeSingle();
      if (error || !data) return json(corsHeaders, 404, { error: "company_not_found", message: "Empresa não encontrada." });
      empresa = data as any;
    }

    const cnpj = inputCnpj || stripNonDigits(String(empresa?.cnpj ?? ""));
    const email = inputEmail || (user.email ?? "").trim().toLowerCase();

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    const candidates: Stripe.Customer[] = [];
    if (explicitCustomerId) {
      try {
        const c = await stripe.customers.retrieve(explicitCustomerId);
        if (c && !(c as any).deleted) candidates.push(c as Stripe.Customer);
      } catch {
        // ignore
      }
    }

    if (empresaId) {
      const current = String(empresa?.stripe_customer_id ?? "").trim();
      if (current) {
        try {
          const c = await stripe.customers.retrieve(current);
          if (c && !(c as any).deleted) candidates.push(c as Stripe.Customer);
        } catch {
          // ignore
        }
      }

      try {
        const found = await stripe.customers.search({ query: `metadata['empresa_id']:'${empresaId}'`, limit: 10 });
        candidates.push(...found.data);
      } catch {
        // ignore
      }
    }

    if (cnpj) {
      try {
        const found = await stripe.customers.search({ query: `metadata['cnpj']:'${cnpj}'`, limit: 10 });
        candidates.push(...found.data);
      } catch {
        // ignore
      }
    }

    if (email) {
      try {
        const found = await stripe.customers.search({ query: `email:'${email}'`, limit: 20 });
        candidates.push(...found.data);
      } catch {
        // ignore
      }
    }

    const unique = new Map<string, Stripe.Customer>();
    for (const c of candidates) unique.set(c.id, c);

    const summaries: CustomerSummary[] = [];
    for (const c of unique.values()) {
      let bestSub: Stripe.Subscription | null = null;
      try {
        const listed = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10, expand: ["data.items.data.price"] });
        const subs = listed.data as Stripe.Subscription[];
        const priority: Record<string, number> = { active: 0, trialing: 1, past_due: 2, unpaid: 3, incomplete: 4, incomplete_expired: 5, canceled: 6 };
        bestSub = [...subs].sort((a, b) => {
          const pa = priority[a.status] ?? 99;
          const pb = priority[b.status] ?? 99;
          if (pa !== pb) return pa - pb;
          return (b.current_period_end ?? 0) - (a.current_period_end ?? 0);
        })[0] ?? null;
      } catch {
        bestSub = null;
      }

      const price = (bestSub?.items?.data?.[0]?.price as Stripe.Price | undefined) ?? undefined;
      summaries.push({
        id: c.id,
        name: (c.name ?? null) as any,
        email: (c.email ?? null) as any,
        created: c.created,
        metadata: (c.metadata ?? null) as any,
        subscription: bestSub ? {
          id: bestSub.id,
          status: bestSub.status,
          current_period_end: bestSub.current_period_end ?? null,
          price_id: price?.id ?? null,
          interval: price?.recurring?.interval ?? null,
        } : null,
      });
    }

    const best = pickBestCustomer(summaries);

    if (action === "inspect") {
      const duplicates = {
        by_email: groupDuplicatesBy(summaries, (c) => (c.email ?? "").trim().toLowerCase() || null),
        by_cnpj: groupDuplicatesBy(summaries, (c) => stripNonDigits(String(c.metadata?.cnpj ?? "")) || null),
        by_empresa_id: groupDuplicatesBy(summaries, (c) => String(c.metadata?.empresa_id ?? "").trim() || null),
      };
      return json(corsHeaders, 200, {
        empresa: empresa ? { id: empresa.id, stripe_customer_id: empresa.stripe_customer_id, cnpj: empresa.cnpj } : null,
        query: { empresa_id: empresaId || null, email: email || null, cnpj: cnpj || null },
        customers: summaries,
        recommended_customer_id: best?.id ?? null,
        duplicates,
      });
    }

    if (action === "delete") {
      if (!empresaId) return json(corsHeaders, 400, { error: "invalid_payload", message: "empresa_id é obrigatório." });
      if (!explicitCustomerId) return json(corsHeaders, 400, { error: "invalid_payload", message: "customer_id é obrigatório." });

      // Não permitir deletar o customer recomendado (segurança básica)
      if (best?.id && explicitCustomerId === best.id) {
        return json(corsHeaders, 409, { error: "cannot_delete_recommended", message: "Este customer é o recomendado; selecione outro para arquivar." });
      }

      const listed = await stripe.subscriptions.list({ customer: explicitCustomerId, status: "all", limit: 20 });
      const subs = listed.data as Stripe.Subscription[];
      const blocked = subs.some((s) => ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status));
      const safety: DeleteSafety = blocked ? "blocked_active_subscription" : "ok";
      if (blocked) {
        return json(corsHeaders, 409, {
          error: "blocked",
          message: "Não é possível arquivar este customer: há assinatura ativa/trialing/past_due/unpaid/incomplete associada.",
          safety,
        });
      }

      if (dryRun) {
        return json(corsHeaders, 200, { dry_run: true, deleted: false, safety, customer_id: explicitCustomerId });
      }

      const del = await stripe.customers.del(explicitCustomerId);
      await logOpsEvent(admin, {
        level: "info",
        event: "ops_stripe_dedupe_delete_customer",
        message: "Customer arquivado no Stripe.",
        context: {
          empresa_id: empresaId,
          customer_id: explicitCustomerId,
          email,
          cnpj: cnpj || null,
          deleted: (del as any)?.deleted ?? null,
        },
      });
      return json(corsHeaders, 200, { deleted: true, safety, customer_id: explicitCustomerId });
    }

    if (!empresaId) return json(corsHeaders, 400, { error: "invalid_payload", message: "empresa_id é obrigatório para link." });
    if (!best?.id) return json(corsHeaders, 404, { error: "no_customer", message: "Nenhum customer encontrado para vincular." });

    const chosenId = explicitCustomerId || best.id;
    if (dryRun) {
      return json(corsHeaders, 200, { dry_run: true, empresa_id: empresaId, customer_id: chosenId });
    }

    // Link: atualiza empresa.stripe_customer_id e garante metadata no customer.
    await admin.from("empresas").update({ stripe_customer_id: chosenId }).eq("id", empresaId);
    try {
      const empresaName = String(
        empresa?.nome_fantasia ||
          empresa?.fantasia ||
          empresa?.nome_razao_social ||
          empresa?.razao_social ||
          empresa?.nome ||
          "",
      ).trim();
      await stripe.customers.update(chosenId, {
        ...(empresaName ? { name: empresaName } : {}),
        metadata: { empresa_id: empresaId, ...(cnpj ? { cnpj } : {}) },
      });
    } catch {
      // best-effort
    }

    // Re-sync: pega melhor subscription desse customer e upserta no DB
    const listed = await stripe.subscriptions.list({ customer: chosenId, status: "all", limit: 10, expand: ["data.items.data.price"] });
    const subs = listed.data as Stripe.Subscription[];

    const priority: Record<string, number> = { active: 0, trialing: 1, past_due: 2, unpaid: 3, incomplete: 4, incomplete_expired: 5, canceled: 6 };
    const picked = [...subs].sort((a, b) => {
      const pa = priority[a.status] ?? 99;
      const pb = priority[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return (b.current_period_end ?? 0) - (a.current_period_end ?? 0);
    })[0] ?? null;

    if (!picked) {
      return json(corsHeaders, 200, { linked: true, synced: false, message: "Customer vinculado, mas nenhuma assinatura encontrada no Stripe." });
    }

    const price = (picked.items?.data?.[0]?.price as Stripe.Price | undefined) ?? undefined;
    const stripePriceId = price?.id ?? null;
    const interval = price?.recurring?.interval ?? null;
    const billingCycle = interval === "year" ? "yearly" : "monthly";
    const currentEnd = picked.current_period_end ? new Date(picked.current_period_end * 1000).toISOString() : null;

    const { data: planRow } = await admin
      .from("plans")
      .select("slug")
      .eq("stripe_price_id", stripePriceId)
      .eq("active", true)
      .maybeSingle();

    await admin.rpc("upsert_subscription", {
      p_empresa_id: empresaId,
      p_status: picked.status === "canceled" ? "canceled" : picked.status,
      p_current_period_end: currentEnd,
      p_price_id: stripePriceId,
      p_sub_id: picked.id,
      p_plan_slug: planRow?.slug ?? null,
      p_billing_cycle: billingCycle,
      p_cancel_at_period_end: !!picked.cancel_at_period_end,
    });

    return json(corsHeaders, 200, { linked: true, synced: true, empresa_id: empresaId, customer_id: chosenId, subscription_id: picked.id });
  } catch (e: any) {
    console.error("ops-stripe-dedupe error:", e);
    return json(corsHeaders, 500, { error: "internal_error", message: String(e?.message || e || "") });
  }
});

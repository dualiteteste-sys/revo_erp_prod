import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const acrh = req.headers.get("access-control-request-headers") || "";
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);

  const exacts = list.filter((v) => !v.startsWith("suffix:"));
  const suffixes = list.filter((v) => v.startsWith("suffix:")).map((v) => v.replace("suffix:", ""));

  const permissive = (Deno.env.get("CORS_MODE") || "").toLowerCase() === "permissive";
  const isExact = exacts.includes(origin);
  const isSuffix = suffixes.some((sfx) => origin.endsWith(sfx));

  const allowOrigin = permissive ? (origin || "*") : (isExact || isSuffix) ? origin : (Deno.env.get("SITE_URL") || "*");
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
  return new Response(body ? JSON.stringify(body) : null, { status, headers: buildCorsHeaders(req) });
}

type InvoiceLite = {
  id: string;
  status: string | null;
  created: number;
  amount_due: number | null;
  amount_paid: number | null;
  currency: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  number: string | null;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return cors(req, 204);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return cors(req, 401, { error: "unauthorized" });

    const { empresa_id, limit } = await req.json().catch(() => ({})) as { empresa_id?: string; limit?: number };
    if (!empresa_id) return cors(req, 400, { error: "invalid_payload", message: "empresa_id é obrigatório" });

    const { data: link } = await supabase
      .from("empresa_usuarios")
      .select("empresa_id")
      .eq("user_id", user.id)
      .eq("empresa_id", empresa_id)
      .single();
    if (!link) return cors(req, 403, { error: "forbidden" });

    const { data: empresa } = await supabase
      .from("empresas")
      .select("stripe_customer_id")
      .eq("id", empresa_id)
      .single();
    const customerId = empresa?.stripe_customer_id ? String(empresa.stripe_customer_id) : "";
    if (!customerId) return cors(req, 404, { error: "missing_customer", message: "Cliente Stripe não encontrado para esta empresa." });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const l = Math.min(Math.max(Number(limit ?? 10), 1), 25);
    const invoices = await stripe.invoices.list({ customer: customerId, limit: l });

    const items: InvoiceLite[] = invoices.data.map((inv) => ({
      id: inv.id,
      status: inv.status ?? null,
      created: inv.created,
      amount_due: typeof inv.amount_due === "number" ? inv.amount_due : null,
      amount_paid: typeof inv.amount_paid === "number" ? inv.amount_paid : null,
      currency: inv.currency ?? null,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      invoice_pdf: inv.invoice_pdf ?? null,
      number: inv.number ?? null,
    }));

    return cors(req, 200, { items });
  } catch (e) {
    return cors(req, 500, { error: "internal_error", detail: String(e) });
  }
});


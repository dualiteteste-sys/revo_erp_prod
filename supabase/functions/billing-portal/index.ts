import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { buildCorsHeaders } from "../_shared/cors.ts";

function cors(req: Request, status = 200, body?: unknown) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { "Content-Type": "application/json", ...buildCorsHeaders(req) },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return cors(req, 204);
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return cors(req, 401, { error: "Unauthorized" });
    }

    const { empresa_id } = await req.json();
    if (!empresa_id) {
      return cors(req, 400, { error: "empresa_id is required" });
    }
    
    const { data: link } = await supabase.from("empresa_usuarios").select("empresa_id").eq("user_id", user.id).eq("empresa_id", empresa_id).single();
    if (!link) {
      return cors(req, 403, { error: "Forbidden access to this company" });
    }
    
    const { data: empresa } = await supabase.from("empresas")
      .select("stripe_customer_id, nome_fantasia, nome_razao_social, cnpj")
      .eq("id", empresa_id).single();

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const empresaCnpj = (empresa as any)?.cnpj ? String((empresa as any).cnpj).replace(/\D/g, "") : "";
    const displayRazao = (empresa as any)?.nome_razao_social ?? null;
    const displayFantasia = (empresa as any)?.nome_fantasia ?? null;
    const displayName = (displayFantasia || displayRazao || `Empresa ${empresa_id}`).slice(0, 250);

    let customerId = empresa?.stripe_customer_id ? String(empresa.stripe_customer_id) : "";
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: displayName,
        email: user.email ?? undefined,
        metadata: { empresa_id, ...(empresaCnpj ? { cnpj: empresaCnpj } : {}) },
      });
      customerId = customer.id;
      await supabase.from("empresas").update({ stripe_customer_id: customerId }).eq("id", empresa_id);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${Deno.env.get("SITE_URL")}/app/configuracoes/geral/assinatura`
    });

    return cors(req, 200, { url: session.url });

  } catch (e) {
    return cors(req, 500, { error: "internal_error", detail: String(e) });
  }
});

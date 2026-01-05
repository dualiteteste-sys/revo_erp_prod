import Stripe from "stripe";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

function json(corsHeaders: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function isEmpresaAdmin(admin: any, empresaId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("empresa_usuarios")
    .select("roles:roles(slug)")
    .eq("empresa_id", empresaId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  const roleSlug = (data as any)?.roles?.slug ?? null;
  if (!roleSlug) return false;

  const { data: rank } = await admin.rpc("empresa_role_rank", { p_role: roleSlug });
  return (rank ?? 0) >= 3;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(corsHeaders, 401, { error: "not_signed_in" });

    const { empresa_id, stripe_customer_id } = (await req.json().catch(() => ({}))) as {
      empresa_id?: string;
      stripe_customer_id?: string;
    };
    if (!empresa_id || !stripe_customer_id) {
      return json(corsHeaders, 400, { error: "invalid_payload", message: "empresa_id e stripe_customer_id são obrigatórios." });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return json(corsHeaders, 401, { error: "invalid_token" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { count: memberCount } = await admin
      .from("empresa_usuarios")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresa_id)
      .eq("user_id", user.id);
    if (!memberCount || memberCount < 1) return json(corsHeaders, 403, { error: "forbidden" });

    if (!String(stripe_customer_id).startsWith("cus_")) {
      return json(corsHeaders, 400, { error: "invalid_customer_id", message: "stripe_customer_id inválido (esperado cus_*)." });
    }

    const { data: empresa, error: empErr } = await admin
      .from("empresas")
      .select("stripe_customer_id")
      .eq("id", empresa_id)
      .maybeSingle();
    if (empErr || !empresa) return json(corsHeaders, 404, { error: "company_not_found" });

    const current = (empresa as any)?.stripe_customer_id ? String((empresa as any).stripe_customer_id) : "";

    // Segurança/UX:
    // - Se a empresa ainda não tem customer, qualquer membro pode vincular (reduz fricção do onboarding).
    // - Se já existe customer vinculado, só admin/owner pode alterar (evita troca indevida).
    if (current && current !== String(stripe_customer_id)) {
      const canAdmin = await isEmpresaAdmin(admin, empresa_id, user.id);
      if (!canAdmin) {
        return json(corsHeaders, 403, {
          error: "forbidden",
          message: "Apenas admin/owner pode alterar o cliente Stripe já vinculado para esta empresa.",
        });
      }
    }

    if (current === String(stripe_customer_id)) {
      return json(corsHeaders, 200, { linked: true });
    }

    const { error: upErr } = await admin
      .from("empresas")
      .update({ stripe_customer_id })
      .eq("id", empresa_id);
    if (upErr) return json(corsHeaders, 500, { error: "db_error", detail: upErr });

    try {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
      await stripe.customers.update(stripe_customer_id, { metadata: { empresa_id } });
    } catch (_e) {
      // best-effort
    }

    return json(corsHeaders, 200, { linked: true });
  } catch (e) {
    console.error("billing-link-customer error:", e);
    return json(corsHeaders, 500, { error: "internal_error", detail: String(e) });
  }
});

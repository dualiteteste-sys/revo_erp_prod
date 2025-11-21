import { createClient } from "@supabase/supabase-js";

function buildCorsHeaders(req: Request) {
    const origin = req.headers.get("origin") || "";
    const acrh = req.headers.get("access-control-request-headers") || "";
    
    // Simplificado para permitir qualquer origem durante o desenvolvimento.
    // Em produção, restrinja a `Deno.env.get("SITE_URL")`.
    const allowOrigin = origin || "*";
    const allowHeaders = acrh || "authorization, x-client-info, apikey, content-type";
  
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": allowHeaders,
    };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { keep_email, remove_active, dry_run } = await req.json();

    if (!keep_email) {
      return new Response(JSON.stringify({ error: "keep_email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.rpc("tenant_cleanup", {
      p_keep_email: keep_email,
      p_remove_active: !!remove_active,
      p_dry_run: dry_run,
    });

    if (error) {
      console.error("RPC tenant_cleanup error:", error);
      throw error;
    }

    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error('tenant-cleanup function error:', e);
    const errorBody = { error: "internal_server_error", message: e.message };
    return new Response(JSON.stringify(errorBody), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

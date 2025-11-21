// SD; Deno. Function de diagnóstico com CORS permissivo p/ DEV
// Ajuste ORIGINS se precisar, mas mantenha *.webcontainer-api.io durante o dev.

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://*.webcontainer-api.io", // dev em WebContainer
];

function isAllowed(origin: string | null) {
  if (!origin) return false;
  for (const o of ALLOWED_ORIGINS) {
    if (o.includes("*")) {
      const root = o.replace("*.", "");
      if (origin.endsWith(root)) return true;
    } else if (origin === o) {
      return true;
    }
  }
  return false;
}

function corsHeaders(origin: string | null) {
  // Em DEV, se não casar, ainda devolve o primeiro para evitar bloqueio
  const allowOrigin = isAllowed(origin) ? (origin as string) : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
    // Opcional: habilite se precisar enviar credenciais
    // "Access-Control-Allow-Credentials": "true",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers, status: 200 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      headers: { ...headers, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    return new Response(JSON.stringify({
      ok: true,
      echo: body,
      envProjectUrl: Deno.env.get("SUPABASE_URL") ?? null,
      // NÃO logamos secrets; apenas checamos a existência
      hasServiceRole: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.length),
    }), {
      headers: { ...headers, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      headers: { ...headers, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

export function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const acrh = req.headers.get("access-control-request-headers") || "";
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);

  // Fallback seguro: domínios oficiais do Revo (evita CORS quebrar por env mal configurada).
  // Obs: para ambientes adicionais (staging/preview), preferir configurar ALLOWED_ORIGINS.
  const defaultExacts = [
    "https://ultria.com.br",
    "https://www.ultria.com.br",
    "https://ultriadev.com.br",
    "https://erprevo.com",
    "https://erprevodev.com",
    "https://erpreveoprod.netlify.app",
  ];

  const localExacts = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ];

  const exacts = [
    ...defaultExacts,
    ...list.filter((v) => !v.startsWith("suffix:")),
    ...localExacts,
  ];
  const suffixes = list.filter((v) => v.startsWith("suffix:")).map((v) => v.replace("suffix:", ""));

  const permissive = (Deno.env.get("CORS_MODE") || "").toLowerCase() === "permissive";
  const isExact = exacts.includes(origin);
  const isSuffix = suffixes.some((sfx) => origin.endsWith(sfx));

  const allowOrigin = permissive
    ? (origin || "*")
    : (isExact || isSuffix) ? origin : (origin ? "null" : "*");

  const allowHeaders = acrh || "authorization, x-client-info, apikey, content-type, x-revo-request-id";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Max-Age": "600",
    "Vary": "Origin, Access-Control-Request-Headers",
  };
}

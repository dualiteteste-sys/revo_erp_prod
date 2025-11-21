export function buildCorsHeaders(req: Request) {
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

  const allowHeaders = acrh || "authorization, x-client-info, apikey, content-type";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
  };
}

import { buildCorsHeaders } from "../_shared/cors.ts";

type OkResponse = {
  ok: true;
  data: unknown;
};

type ErrResponse = {
  ok: false;
  error: string;
  message: string;
};

function json(headers: Record<string, string>, payload: OkResponse | ErrResponse, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function digitsOnly(v: string) {
  return (v || "").replace(/\D/g, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (req.method !== "POST") return json(cors, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Use POST." }, 200);

  const body = await req.json().catch(() => ({} as any));
  const cnpjRaw = String(body?.cnpj ?? "");
  const cnpj = digitsOnly(cnpjRaw);
  if (cnpj.length !== 14) {
    return json(cors, { ok: false, error: "INVALID_CNPJ", message: "CNPJ inválido. Deve conter 14 dígitos." }, 200);
  }

  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  try {
    const res = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "application/json" } }, 12000);
    if (res.status === 404) {
      const payload = await res.json().catch(() => null);
      const msg = String(payload?.message ?? "CNPJ não encontrado.");
      return json(cors, { ok: false, error: "NOT_FOUND", message: msg }, 200);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return json(cors, {
        ok: false,
        error: "UPSTREAM_ERROR",
        message: `Falha ao consultar CNPJ (BrasilAPI). Status ${res.status}. ${text ? "Detalhes: " + text : ""}`.trim(),
      }, 200);
    }

    const data = await res.json().catch(() => null);
    return json(cors, { ok: true, data }, 200);
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Timeout ao consultar CNPJ." : `Falha ao consultar CNPJ.`;
    return json(cors, { ok: false, error: "NETWORK_ERROR", message: msg }, 200);
  }
});


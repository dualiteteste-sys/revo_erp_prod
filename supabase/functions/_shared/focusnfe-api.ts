/**
 * Shared Focus NFe API utilities.
 * Used by: focusnfe-empresa, focusnfe-cert-upload, focusnfe-mde-sync, focusnfe-mde-manifestar, focusnfe-cancel
 */

export function getFocusApiToken(ambiente: string): string {
  if (ambiente === "producao") {
    return (Deno.env.get("FOCUSNFE_API_TOKEN_PROD") ?? "").trim();
  }
  return (Deno.env.get("FOCUSNFE_API_TOKEN_HML") ?? "").trim();
}

export function getFocusBaseUrl(ambiente: string): string {
  if (ambiente === "producao") {
    return "https://api.focusnfe.com.br";
  }
  return "https://homologacao.focusnfe.com.br";
}

export function basicAuth(token: string): string {
  return "Basic " + btoa(token + ":");
}

export function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/**
 * Calls Focus NFe API with retry on transient errors.
 */
export async function focusFetch(
  url: string,
  options: RequestInit & { token: string },
): Promise<{ response: Response; data: any }> {
  const { token, ...fetchOpts } = options;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": basicAuth(token),
    ...(fetchOpts.headers || {}),
  };

  const response = await fetch(url, { ...fetchOpts, headers });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

export type NfeioEnvironment = "homologacao" | "producao";

export function nfeioBaseUrl(ambiente: NfeioEnvironment): string {
  // A documentação pública atual da NFE.io usa o mesmo host para produção e homologação.
  // O ambiente é definido do lado da conta/empresa, não por subdomínio.
  // (sandbox.api.nfe.io não resolve via DNS)
  return "https://api.nfe.io";
}

export async function nfeioFetchJson(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: any; rawText: string }> {
  const resp = await fetch(input, init);
  const rawText = await resp.text().catch(() => "");
  let data: any = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { raw: rawText };
  }
  return { ok: resp.ok, status: resp.status, data, rawText };
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

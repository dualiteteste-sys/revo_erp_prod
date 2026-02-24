function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, "");
}

function isLegacyHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === "erprevo.com" ||
    normalized.endsWith(".erprevo.com") ||
    normalized === "erprevo.com.br" ||
    normalized.endsWith(".erprevo.com.br") ||
    normalized === "revoerp.com" ||
    normalized.endsWith(".revoerp.com")
  );
}

/**
 * Retorna a URL pública do app (domínio final) para montar redirects de Auth.
 *
 * Preferimos `VITE_SITE_URL` (quando presente) para evitar drift de domínio
 * (ex.: signup iniciado em preview/antigo domínio, mas confirmação deve cair no domínio oficial).
 *
 * Não inclui path; sempre sem barra no final.
 */
export function getConfiguredSiteUrl(): string {
  return getConfiguredSiteUrlFrom({
    envUrl: String((import.meta as any)?.env?.VITE_SITE_URL ?? "").trim(),
    origin: typeof window !== "undefined" ? window.location?.origin : "",
  });
}

export function getConfiguredSiteUrlFrom(input: { envUrl?: string; origin?: string }): string {
  const envUrl = String(input?.envUrl ?? "").trim();
  if (envUrl) return trimTrailingSlashes(envUrl);

  const origin = String(input?.origin ?? "").trim();
  if (origin) return trimTrailingSlashes(origin);

  return "";
}

export function computeCanonicalRedirectUrlFrom(input: {
  canonicalSiteUrl: string;
  currentHref: string;
}): string | null {
  const canonicalRaw = String(input?.canonicalSiteUrl ?? "").trim();
  const currentRaw = String(input?.currentHref ?? "").trim();
  if (!canonicalRaw || !currentRaw) return null;

  let canonicalUrl: URL;
  let currentUrl: URL;
  try {
    canonicalUrl = new URL(canonicalRaw);
    currentUrl = new URL(currentRaw);
  } catch {
    return null;
  }

  if (canonicalUrl.origin === currentUrl.origin) return null;
  if (!isLegacyHost(currentUrl.host)) return null;

  return `${canonicalUrl.origin}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
}

/**
 * Se o app estiver rodando em um domínio legado, redireciona imediatamente para o domínio canônico,
 * preservando path + query + hash (inclusive parâmetros de confirmação do Supabase).
 *
 * Retorna `true` quando disparou redirect.
 */
export function maybeRedirectToCanonicalSiteUrl(): boolean {
  if (typeof window === "undefined") return false;

  const canonical = getConfiguredSiteUrl();
  const target = computeCanonicalRedirectUrlFrom({
    canonicalSiteUrl: canonical,
    currentHref: window.location.href,
  });
  if (!target) return false;

  window.location.replace(target);
  return true;
}

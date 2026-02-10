export type WooStoreUrlNormalizeResult =
  | { ok: true; normalized: string }
  | { ok: false; code: 'required' | 'invalid'; message: string };

/**
 * Normaliza a URL base da loja WooCommerce para uso consistente:
 * - trim
 * - adiciona https:// quando o usuario nao informar protocolo
 * - remove hash e query
 * - remove barras finais redundantes (sem cortar subdiretorio)
 */
export function normalizeWooStoreUrl(input: string): WooStoreUrlNormalizeResult {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return { ok: false, code: 'required', message: 'Informe a URL da loja.' };
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return { ok: false, code: 'invalid', message: 'URL da loja invalida.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, code: 'invalid', message: 'URL da loja invalida.' };
  }

  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');

  const origin = url.origin;
  const path = url.pathname === '/' ? '' : url.pathname;
  return { ok: true, normalized: `${origin}${path}` };
}

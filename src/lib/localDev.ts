export function isLocalhostHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export function isLocalBillingBypassEnabled(): boolean {
  try {
    const isLocal = isLocalhostHost(window.location.hostname);
    if (!isLocal) return false;

    // Estado da arte: em localhost, o bypass fica ON por padrão
    // (Stripe checkout não funciona bem em ambiente local sem túnel).
    // Para forçar OFF, defina VITE_LOCAL_BILLING_BYPASS=false.
    const raw = String((import.meta as any)?.env?.VITE_LOCAL_BILLING_BYPASS ?? '').trim().toLowerCase();
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    return true;
  } catch {
    return false;
  }
}

export type LocalPlanSlug = 'ESSENCIAL' | 'PRO' | 'MAX' | 'INDUSTRIA' | 'SCALE';

export function getLocalPlanSlug(): LocalPlanSlug {
  const raw = String((import.meta as any)?.env?.VITE_LOCAL_PLAN_SLUG || '')
    .trim()
    .toUpperCase();
  const allowed: LocalPlanSlug[] = ['ESSENCIAL', 'PRO', 'MAX', 'INDUSTRIA', 'SCALE'];
  return (allowed.includes(raw as any) ? (raw as LocalPlanSlug) : 'SCALE');
}

export function isLocalhostHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export function isLocalBillingBypassEnabled(): boolean {
  const enabled = String((import.meta as any)?.env?.VITE_LOCAL_BILLING_BYPASS || '')
    .trim()
    .toLowerCase() === 'true';

  if (!enabled) return false;

  try {
    return isLocalhostHost(window.location.hostname);
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

export function isSeedEnabled(): boolean {
  if (import.meta.env.DEV) return true;

  const allowByEnv = String(import.meta.env.VITE_ENABLE_SEED || '').toLowerCase() === 'true';
  if (!allowByEnv) return false;

  if (typeof window === 'undefined') return false;

  const qs = new URLSearchParams(window.location.search);
  const allowByQuery = qs.get('seed') === '1';
  const allowByLocalStorage = window.localStorage.getItem('revo_seed') === '1';

  return allowByQuery || allowByLocalStorage;
}

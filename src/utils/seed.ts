export function isSeedEnabled(): boolean {
  return (
    import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_SEED || '').toLowerCase() === 'true'
  );
}


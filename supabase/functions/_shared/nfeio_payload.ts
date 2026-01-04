export function extractNfeioStatus(payload: any): string | null {
  const status = payload?.status ?? payload?.data?.status ?? payload?.nota_fiscal?.status ?? null;
  return status ? String(status).toLowerCase() : null;
}


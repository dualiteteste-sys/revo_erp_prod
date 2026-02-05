type OpsAppErrorFingerprintInput = {
  route?: string | null;
  code?: string | null;
  httpStatus?: number | null;
  url?: string | null;
  method?: string | null;
  message: string;
};

export function buildOpsAppErrorFingerprint(input: OpsAppErrorFingerprintInput): string {
  const route = input.route ?? "";
  const code = input.code ?? "";
  const httpStatus = input.httpStatus ?? "";
  const method = input.method ?? "";
  const urlBase = (input.url ?? "").split("?")[0];
  const message = input.message ?? "";

  return `${route}|${code}|${httpStatus}|${method}|${urlBase}|${message}`.slice(0, 500);
}


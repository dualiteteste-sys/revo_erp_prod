export type RateLimitResult = {
  allowed: boolean;
  retry_after_seconds: number | null;
};

export async function rateLimitCheck(params: {
  admin: any;
  empresaId: string;
  domain: string;
  action: string;
  limit: number;
  windowSeconds: number;
  cost?: number;
}): Promise<RateLimitResult> {
  try {
    const { data, error } = await params.admin.rpc("integration_rate_limit_check", {
      p_empresa_id: params.empresaId,
      p_domain: params.domain,
      p_action: params.action,
      p_limit: params.limit,
      p_window_seconds: params.windowSeconds,
      p_cost: params.cost ?? 1,
    });
    if (error) return { allowed: true, retry_after_seconds: null };
    return {
      allowed: !!data?.allowed,
      retry_after_seconds: data?.retry_after_seconds != null ? Number(data.retry_after_seconds) : null,
    };
  } catch {
    return { allowed: true, retry_after_seconds: null };
  }
}


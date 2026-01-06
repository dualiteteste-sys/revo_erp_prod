type AdminClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data?: unknown; error?: any }>;
};

export async function finopsTrackUsage(params: {
  admin: AdminClient;
  empresaId: string | null | undefined;
  source: string;
  event: string;
  count?: number;
}) {
  const empresaId = (params.empresaId ?? "").toString().trim();
  if (!empresaId) return;

  const source = (params.source ?? "").toString().trim();
  const event = (params.event ?? "").toString().trim();
  if (!source || !event) return;

  const count = Number(params.count ?? 1);
  if (!Number.isFinite(count) || count <= 0) return;

  try {
    await params.admin.rpc("finops_track_usage", {
      p_empresa_id: empresaId,
      p_source: source.slice(0, 48),
      p_event: event.slice(0, 64),
      p_count: Math.floor(count),
    });
  } catch {
    // best-effort
  }
}


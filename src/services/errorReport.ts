import { supabase } from "@/lib/supabaseClient";
import { getRecentNetworkErrors } from "@/lib/telemetry/networkErrors";

export type ErrorReportPayload = {
  sentry_event_id: string;
  user_message: string;
  user_email?: string | null;
};

export async function sendErrorReport(payload: ErrorReportPayload) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  const { data: empresaId } = await (supabase as any).rpc("active_empresa_get_for_current_user");

  const body = {
    ...payload,
    context: {
      url: typeof window !== "undefined" ? window.location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      user_id: user?.id ?? null,
      empresa_id: empresaId,
    },
    recent_network_errors: getRecentNetworkErrors(),
  };

  const { data, error } = await supabase.functions.invoke("error-report", {
    body,
  });

  if (error) throw error;
  return data as any;
}

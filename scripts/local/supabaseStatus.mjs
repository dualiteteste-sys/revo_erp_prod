import { execSync } from "node:child_process";

export function getSupabaseStatusJson() {
  const raw = execSync("supabase status -o json", { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
  const parsed = JSON.parse(raw);
  // Supabase CLI versions differ slightly; normalize keys we use.
  const apiUrl = String(parsed?.api_url ?? parsed?.API_URL ?? "").trim();
  const anonKey = String(parsed?.anon_key ?? parsed?.ANON_KEY ?? "").trim();
  const serviceKey = String(parsed?.service_role_key ?? parsed?.SERVICE_ROLE_KEY ?? "").trim();
  if (!apiUrl || !anonKey || !serviceKey) {
    throw new Error("SUPABASE_STATUS_MISSING_FIELDS");
  }
  return { apiUrl, anonKey, serviceKey };
}


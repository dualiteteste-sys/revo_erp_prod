import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { getSupabaseStatusJson } from "./supabaseStatus.mjs";

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readExistingKey(filePath, key) {
  if (!existsSync(filePath)) return "";
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    if (k !== key) continue;
    return trimmed.slice(idx + 1).trim();
  }
  return "";
}

function randomBase64(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64");
}

const args = new Set(process.argv.slice(2));
const FUNCTIONS_ONLY = args.has("--functions-only");
const FRONTEND_ONLY = args.has("--frontend-only");
if (FUNCTIONS_ONLY && FRONTEND_ONLY) {
  throw new Error("INVALID_FLAGS");
}

// 1) Edge runtime env (Supabase local) — ignored by git.
// Needs to exist BEFORE `supabase start` so Functions runtime can load it.
const supabaseDir = join(process.cwd(), "supabase");
ensureDir(supabaseDir);
// Supabase CLI/Edge runtime reads `supabase/.env` by default.
// We also write `supabase/.env.local` for convenience, but `.env` is the source of truth.
const supabaseEnvPath = join(supabaseDir, ".env");
const supabaseEnvLocalPath = join(supabaseDir, ".env.local");

function readExistingAny(key) {
  return readExistingKey(supabaseEnvPath, key) || readExistingKey(supabaseEnvLocalPath, key);
}

const existingMaster = readExistingAny("INTEGRATIONS_MASTER_KEY");
const existingWorker = readExistingAny("WOOCOMMERCE_WORKER_KEY");
const existingScheduler = readExistingAny("WOOCOMMERCE_SCHEDULER_KEY");

const masterKey = existingMaster || randomBase64(48);
const workerKey = existingWorker || randomBase64(32);
const schedulerKey = existingScheduler || workerKey; // allow single-key setups

const supabaseEnv = [
  `INTEGRATIONS_MASTER_KEY=${masterKey}`,
  `WOOCOMMERCE_WORKER_KEY=${workerKey}`,
  `WOOCOMMERCE_SCHEDULER_KEY=${schedulerKey}`,
  `WOOCOMMERCE_MOCK_MODE=true`,
  `WOOCOMMERCE_MOCK_BASE_URL=https://woo-mock.ultria.invalid`,
  "",
].join("\n");
if (!FRONTEND_ONLY) {
  writeFileSync(supabaseEnvPath, supabaseEnv, "utf8");
  writeFileSync(supabaseEnvLocalPath, supabaseEnv, "utf8");
}

// 2) Frontend env (.env.local) — ignored by git.
// Needs Supabase running for `supabase status -o json`.
if (!FUNCTIONS_ONLY) {
  const { apiUrl, anonKey } = getSupabaseStatusJson();
  const rootEnvPath = join(process.cwd(), ".env.local");
  const functionsUrl = `${apiUrl.replace(/\/+$/, "")}/functions/v1`;

  const rootEnv = [
    `VITE_SUPABASE_URL=${apiUrl}`,
    `VITE_SUPABASE_ANON_KEY=${anonKey}`,
    `VITE_SUPABASE_FUNCTIONS_URL=${functionsUrl}`,
    `VITE_LOCAL_BILLING_BYPASS=true`,
    `VITE_LOCAL_PLAN_SLUG=SCALE`,
    "",
  ].join("\n");
  writeFileSync(rootEnvPath, rootEnv, "utf8");
}

console.log("[local-env] ok");
console.log("[local-env] Woo mock base_url:", "https://woo-mock.ultria.invalid");

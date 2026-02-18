import { createClient } from "@supabase/supabase-js";
import { getSupabaseStatusJson } from "./supabaseStatus.mjs";

const email = process.env.ULTRIA_LOCAL_DEV_EMAIL?.trim() || "dev@local.ultria";
const password = process.env.ULTRIA_LOCAL_DEV_PASSWORD?.trim() || "DevLocal123!";

const { apiUrl, anonKey, serviceKey } = getSupabaseStatusJson();

const svc = createClient(apiUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  const { data: existing } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = (existing?.users ?? []).find((u) => (u?.email ?? "").toLowerCase() === email.toLowerCase());
  if (found?.id) {
    console.log("[bootstrap-user] user already exists:", email);
    return;
  }

  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log("[bootstrap-user] created user:", data?.user?.id, email);

  const userClient = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await userClient.auth.signInWithPassword({ email, password });
  if (!signErr) {
    console.log("[bootstrap-user] sign-in OK (local). You can log in via UI now.");
  } else {
    console.log("[bootstrap-user] sign-in failed (ok):", String(signErr?.message ?? ""));
  }
}

run().catch((err) => {
  console.error("[bootstrap-user] failed:", err?.message ?? err);
  process.exitCode = 1;
});


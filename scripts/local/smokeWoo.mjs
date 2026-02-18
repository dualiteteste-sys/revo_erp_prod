import { createClient } from "@supabase/supabase-js";
import { getSupabaseStatusJson } from "./supabaseStatus.mjs";

const email = process.env.ULTRIA_LOCAL_DEV_EMAIL?.trim() || "dev@local.ultria";
const password = process.env.ULTRIA_LOCAL_DEV_PASSWORD?.trim() || "DevLocal123!";

const baseUrl = process.env.ULTRIA_WOO_BASE_URL?.trim() || "https://woo-mock.ultria.invalid";
const consumerKey = process.env.ULTRIA_WOO_CK?.trim() || "ck_local_mock";
const consumerSecret = process.env.ULTRIA_WOO_CS?.trim() || "cs_local_mock";

const { apiUrl, anonKey } = getSupabaseStatusJson();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function readFunctionsErrorDetails(err) {
  const status = err?.context?.status ?? err?.status ?? null;
  const body = err?.context?.body ?? null;
  if (body && typeof body?.getReader === "function") {
    const text = await new Response(body).text().catch(() => "");
    return { status, bodyText: text.slice(0, 5000) };
  }
  return { status, bodyText: body ? String(body).slice(0, 5000) : "" };
}

async function run() {
  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signIn, error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  assert(signIn?.session?.access_token, "NO_SESSION");

  // 1) Resolve empresa ativa (se não existir, bootstrap + resolve novamente)
  const { data: activeBefore } = await client.rpc("active_empresa_get_for_current_user", {});
  let empresaId = String(activeBefore ?? "").trim();

  if (!empresaId) {
    const { error: bootErr } = await client.rpc("secure_bootstrap_empresa_for_current_user", {
      p_razao_social: "Ultria Local",
      p_fantasia: null,
    });
    if (bootErr) throw bootErr;

    const { data: activeAfter, error: activeErr } = await client.rpc("active_empresa_get_for_current_user", {});
    if (activeErr) throw activeErr;
    empresaId = String(activeAfter ?? "").trim();
  }

  assert(empresaId, "NO_EMPRESA_ID");

  const normalizeForCompare = (value) => String(value ?? "").trim().replace(/\/+$/, "");

  // 2) Reuse store if already exists (idempotent smoke)
  const { data: listData, error: listErr } = await client.functions.invoke("woocommerce-admin", {
    body: { action: "stores.list" },
    headers: { "x-empresa-id": empresaId },
  });
  if (listErr) {
    const details = await readFunctionsErrorDetails(listErr);
    throw new Error(`stores.list failed (status=${details.status}): ${details.bodyText || listErr.message}`);
  }
  const existingStores = Array.isArray(listData?.stores) ? listData.stores : Array.isArray(listData) ? listData : [];
  const existing = existingStores.find((s) => normalizeForCompare(s?.base_url) === normalizeForCompare(baseUrl));
  let storeId = existing ? String(existing?.id ?? "").trim() : "";

  if (!storeId) {
    const { data: created, error: createErr } = await client.functions.invoke("woocommerce-admin", {
      body: {
        action: "stores.create",
        base_url: baseUrl,
        auth_mode: "basic_https",
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      },
      headers: { "x-empresa-id": empresaId },
    });
    if (createErr) {
      const details = await readFunctionsErrorDetails(createErr);
      throw new Error(`stores.create failed (status=${details.status}): ${details.bodyText || createErr.message}`);
    }
    assert(created?.ok, "STORE_CREATE_FAILED");
    storeId = String(created?.store?.id ?? "").trim();
  }
  assert(storeId, "NO_STORE_ID");

  const { data: health, error: healthErr } = await client.functions.invoke("woocommerce-admin", {
    body: { action: "stores.healthcheck", store_id: storeId },
    headers: { "x-empresa-id": empresaId },
  });
  if (healthErr) {
    const details = await readFunctionsErrorDetails(healthErr);
    throw new Error(`stores.healthcheck failed (status=${details.status}): ${details.bodyText || healthErr.message}`);
  }
  assert(health?.ok && health?.status === "ok", "HEALTHCHECK_NOT_OK");

  console.log("[smoke-woo] OK", { empresaId, storeId, baseUrl });
}

run().catch((err) => {
  console.error("[smoke-woo] FAILED:", String(err?.message ?? err ?? ""));
  process.exitCode = 1;
});

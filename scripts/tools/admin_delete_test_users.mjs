// scripts/tools/admin_delete_test_users.mjs
// Uso:
//   node scripts/tools/admin_delete_test_users.mjs --domain revosp.com.br --prefix teste --dry-run
//   node scripts/tools/admin_delete_test_users.mjs --domain revosp.com.br --prefix teste
//
// Requer env:
//   SUPABASE_URL=https://&lt;ref&gt;.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  (DEV! NUNCA use a de PROD aqui)
//
// O script:
// 1) Lista todos os usuários (paginação).
// 2) Filtra por domínio/prefixo.
// 3) Remove vínculos em public.user_active_empresa e public.empresa_usuarios.
// 4) Deleta no Auth (admin.deleteUser).
//
// Segurança extra: aborta se SUPABASE_URL não parecer apontar para DEV.

import { createClient } from "@supabase/supabase-js";

// --- CLI args simples ---
const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const i = args.findIndex(a => a === `--${name}`);
  if (i &gt;= 0 && i + 1 &lt; args.length) return args[i + 1];
  if (args.some(a => a === `--${name}`)) return true; // flags booleanas (ex: --dry-run)
  return def;
};

const DOMAIN = getArg("domain");
const PREFIX = getArg("prefix");
const DRY_RUN = !!getArg("dry-run", false);

if (!DOMAIN || !PREFIX) {
  console.error("Params obrigatórios: --domain &lt;domínio&gt; --prefix &lt;prefixo&gt;  [--dry-run]");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

// Guard-rail: tente evitar PROD por engano
if (!/dev|local|lrfwia|revo-dev|verify|sandbox/i.test(SUPABASE_URL)) {
  console.error("ABORTADO por segurança: SUPABASE_URL não parece DEV:", SUPABASE_URL);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Paginação admin (v2)
async function listAllUsers() {
  const perPage = 1000;
  let page = 1;
  const acc = [];
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    acc.push(...batch);
    if (batch.length &lt; perPage) break;
    page++;
  }
  return acc;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log("[CLEANUP] Listando usuários…");
  const users = await listAllUsers();

  const candidates = users.filter(u => {
    const email = (u.email || "").toLowerCase();
    return email.endsWith(`@${DOMAIN.toLowerCase()}`) && email.startsWith(PREFIX.toLowerCase());
  });

  if (!candidates.length) {
    console.log("[CLEANUP] Nenhum candidato encontrado.");
    return;
  }

  console.log(`[CLEANUP] Candidatos (${candidates.length}):`);
  candidates.forEach(u => console.log(" -", u.id, u.email));

  if (DRY_RUN) {
    console.log("[CLEANUP] DRY-RUN: nenhuma alteração foi aplicada.");
    return;
  }

  // Executa em série (mais seguro p/ evitar rate limit)
  for (const u of candidates) {
    console.log("\n[CLEANUP] Processando:", u.id, u.email);

    // 1) Remove preferências e memberships (service role ignora RLS)
    {
      const { error } = await supabase.from("user_active_empresa").delete().eq("user_id", u.id);
      if (error) console.warn("  [WARN] user_active_empresa delete:", error.message || error);
      else console.log("  [OK] user_active_empresa limpado");
    }

    {
      const { error } = await supabase.from("empresa_usuarios").delete().eq("user_id", u.id);
      if (error) console.warn("  [WARN] empresa_usuarios delete:", error.message || error);
      else console.log("  [OK] empresa_usuarios limpo");
    }

    // 2) Deleta no Auth
    {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) {
        console.error("  [ERR] deleteUser:", error.message || error);
      } else {
        console.log("  [OK] Auth user removido");
      }
    }

    // pausa curta para evitar pico
    await sleep(120);
  }

  console.log("\n[CLEANUP] Concluído.");
})().catch(e => {
  console.error("[CLEANUP][FATAL]", e);
  process.exit(1);
});

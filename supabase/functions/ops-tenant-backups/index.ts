import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

function requireEnv(name: string): string | null {
  const v = (Deno.env.get(name) ?? "").trim();
  return v ? v : null;
}

function requireAnyEnv(names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const v = requireEnv(name);
    if (v) return { name, value: v };
  }
  return null;
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const ALLOWED_TARGETS = new Set(["prod", "dev", "verify"]);

async function logOpsEvent(supabase: any, input: { level: "info" | "warn" | "error"; event: string; message: string; context?: Record<string, unknown> }) {
  await supabase
    .rpc("log_app_event", {
      p_level: input.level,
      p_event: input.event,
      p_message: input.message,
      p_context: input.context ?? {},
      p_source: "ops-tenant-backups",
    })
    .then(() => null)
    .catch(() => null);
}

async function dispatchWorkflow(input: {
  token: string;
  repo: string;
  workflowFile: string;
  ref: string;
  inputs?: Record<string, string>;
}) {
  const res = await fetch(`https://api.github.com/repos/${input.repo}/actions/workflows/${input.workflowFile}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "revo-ops-tenant-backups",
    },
    body: JSON.stringify({
      ref: input.ref,
      inputs: input.inputs ?? {},
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GitHub dispatch error (${res.status}): ${txt}`);
  }
}

async function getLatestWorkflowRunUrl(input: { token: string; repo: string; workflowFile: string; ref?: string }) {
  const url = new URL(`https://api.github.com/repos/${input.repo}/actions/workflows/${input.workflowFile}/runs`);
  url.searchParams.set("per_page", "1");
  url.searchParams.set("event", "workflow_dispatch");
  if (input.ref) url.searchParams.set("branch", input.ref);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "revo-ops-tenant-backups",
    },
  });
  const jsonBody = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(`GitHub runs error (${res.status}): ${JSON.stringify(jsonBody)}`);
  }
  const run = (jsonBody?.workflow_runs?.[0] ?? null) as any;
  return run?.html_url ? String(run.html_url) : null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
    const githubToken = requireAnyEnv(["GITHUB_TOKEN", "GITHUB_PAT"]);
    const githubRepo =
      (requireEnv("GITHUB_REPO") ??
        // Compat com GitHub Actions env naming (quando espelhado como secret)
        requireEnv("GITHUB_REPOSITORY") ??
        // Default do repo oficial (reduz chance de config faltando)
        "dualiteteste-sys/revo_erp_prod").trim();
    const githubRef = (requireEnv("GITHUB_DEFAULT_REF") ?? "main").trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(500, { ok: false, error: "config_error", message: "SUPABASE_URL/SUPABASE_ANON_KEY ausentes." }, corsHeaders);
    }
    if (!githubToken?.value) {
      return json(
        500,
        {
          ok: false,
          error: "config_error",
          message:
            "GITHUB_TOKEN ausente (necessário para dispatch dos workflows). Crie um Fine-grained PAT com permissão Actions: Read and write para o repo e salve como secret de Edge Functions.",
          required_secrets: ["GITHUB_TOKEN (ou GITHUB_PAT)", "GITHUB_REPO (opcional)", "GITHUB_DEFAULT_REF (opcional)"],
          defaults: { GITHUB_REPO: githubRepo, GITHUB_DEFAULT_REF: githubRef },
        },
        corsHeaders,
      );
    }

    if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, corsHeaders);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json(401, { ok: false, error: "not_signed_in", message: "Token de autenticação ausente." }, corsHeaders);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user ?? null;
    if (userErr || !user) {
      return json(401, { ok: false, error: "invalid_token", message: userErr?.message ?? "Token inválido." }, corsHeaders);
    }

    const { data: empresaId, error: empresaErr } = await supabase.rpc("current_empresa_id");
    if (empresaErr || !empresaId) {
      return json(400, { ok: false, error: "empresa_not_selected", message: "Empresa ativa não encontrada." }, corsHeaders);
    }

    const { data: canManage, error: permErr } = await supabase.rpc("has_permission_for_current_user", {
      p_module: "ops",
      p_action: "manage",
    } as any);
    if (permErr) return json(500, { ok: false, error: "perm_check_failed", message: permErr.message }, corsHeaders);
    if (!canManage) return json(403, { ok: false, error: "forbidden", message: "Sem permissão (ops:manage)." }, corsHeaders);

    const payload = (await req.json().catch(() => null)) as any;
    const action = String(payload?.action ?? "").trim().toLowerCase();

    if (action === "backup") {
      const target = String(payload?.target ?? "prod").trim();
      const label = String(payload?.label ?? "").trim();
      if (!ALLOWED_TARGETS.has(target)) {
        return json(400, { ok: false, error: "invalid_payload", message: "target inválido. Use prod/dev/verify." }, corsHeaders);
      }

      await dispatchWorkflow({
        token: githubToken.value,
        repo: githubRepo,
        workflowFile: "tenant-backup.yml",
        ref: githubRef,
        inputs: {
          target,
          empresa_id: String(empresaId),
          label,
        },
      });

      let runUrl: string | null = null;
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 900));
        runUrl = await getLatestWorkflowRunUrl({ token: githubToken.value, repo: githubRepo, workflowFile: "tenant-backup.yml", ref: githubRef });
        if (runUrl) break;
      }

      await logOpsEvent(supabase, {
        level: "info",
        event: "ops_tenant_backup_dispatch",
        message: `Backup do tenant disparado (target=${target}).`,
        context: {
          action,
          empresa_id: String(empresaId),
          target,
          label: label || null,
          workflow: "tenant-backup.yml",
          github_repo: githubRepo,
          github_ref: githubRef,
          run_url: runUrl,
          actor_id: user.id,
          actor_email: user.email,
        },
      });

      return json(200, { ok: true, kind: "tenant_backup", run_url: runUrl }, corsHeaders);
    }

    if (action === "restore_latest") {
      const sourceTarget = String(payload?.source_target ?? "prod").trim();
      const target = String(payload?.target ?? "verify").trim();
      const confirm = String(payload?.confirm ?? "").trim();
      if (!ALLOWED_TARGETS.has(sourceTarget)) {
        return json(400, { ok: false, error: "invalid_payload", message: "source_target inválido. Use prod/dev/verify." }, corsHeaders);
      }
      if (!ALLOWED_TARGETS.has(target)) {
        return json(400, { ok: false, error: "invalid_payload", message: "target inválido. Use prod/dev/verify." }, corsHeaders);
      }

      const list = await supabase.rpc("ops_tenant_backups_list", {
        p_target: sourceTarget,
        p_limit: 1,
        p_offset: 0,
      } as any);
      if (list.error) return json(500, { ok: false, error: "catalog_failed", message: list.error.message }, corsHeaders);

      const row = (Array.isArray(list.data) ? list.data[0] : null) as any;
      const r2Key = String(row?.r2_key ?? "").trim();
      if (!r2Key) {
        return json(
          400,
          {
            ok: false,
            error: "no_backup_found",
            message: `Nenhum backup encontrado no catálogo para target=${sourceTarget}. Gere um backup antes do restore drill.`,
          },
          corsHeaders,
        );
      }

      const empresaIdStr = String(empresaId);
      if (!isUuid(empresaIdStr)) {
        return json(500, { ok: false, error: "invalid_empresa_id", message: "Empresa ativa inválida." }, corsHeaders);
      }
      if (!r2Key.includes(`/tenants/${empresaIdStr}/`)) {
        return json(
          400,
          {
            ok: false,
            error: "invalid_r2_key",
            message: "O backup selecionado não pertence à empresa ativa.",
          },
          corsHeaders,
        );
      }

      await dispatchWorkflow({
        token: githubToken.value,
        repo: githubRepo,
        workflowFile: "tenant-restore-from-r2.yml",
        ref: githubRef,
        inputs: {
          target,
          empresa_id: empresaIdStr,
          r2_key: r2Key,
          confirm,
        },
      });

      let runUrl: string | null = null;
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 900));
        runUrl = await getLatestWorkflowRunUrl({ token: githubToken.value, repo: githubRepo, workflowFile: "tenant-restore-from-r2.yml", ref: githubRef });
        if (runUrl) break;
      }

      await logOpsEvent(supabase, {
        level: "info",
        event: "ops_tenant_restore_dispatch",
        message: `Restore do tenant disparado (source=${sourceTarget} -> target=${target}).`,
        context: {
          action,
          empresa_id: empresaIdStr,
          source_target: sourceTarget,
          target,
          r2_key: r2Key,
          workflow: "tenant-restore-from-r2.yml",
          github_repo: githubRepo,
          github_ref: githubRef,
          run_url: runUrl,
          actor_id: user.id,
          actor_email: user.email,
        },
      });

      return json(
        200,
        { ok: true, kind: "tenant_restore_latest", source_target: sourceTarget, target, r2_key: r2Key, run_url: runUrl },
        corsHeaders,
      );
    }

    if (action === "restore") {
      const target = String(payload?.target ?? "dev").trim();
      const r2Key = String(payload?.r2_key ?? "").trim();
      const confirm = String(payload?.confirm ?? "").trim();
      if (!ALLOWED_TARGETS.has(target)) {
        return json(400, { ok: false, error: "invalid_payload", message: "target inválido. Use prod/dev/verify." }, corsHeaders);
      }
      if (!r2Key) return json(400, { ok: false, error: "invalid_payload", message: "r2_key é obrigatório." }, corsHeaders);
      const empresaIdStr = String(empresaId);
      if (!isUuid(empresaIdStr)) {
        return json(500, { ok: false, error: "invalid_empresa_id", message: "Empresa ativa inválida." }, corsHeaders);
      }
      if (!r2Key.includes(`/tenants/${empresaIdStr}/`)) {
        return json(400, { ok: false, error: "invalid_r2_key", message: "O backup informado não pertence à empresa ativa." }, corsHeaders);
      }

      await dispatchWorkflow({
        token: githubToken.value,
        repo: githubRepo,
        workflowFile: "tenant-restore-from-r2.yml",
        ref: githubRef,
        inputs: {
          target,
          empresa_id: empresaIdStr,
          r2_key: r2Key,
          confirm,
        },
      });

      let runUrl: string | null = null;
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 900));
        runUrl = await getLatestWorkflowRunUrl({ token: githubToken.value, repo: githubRepo, workflowFile: "tenant-restore-from-r2.yml", ref: githubRef });
        if (runUrl) break;
      }

      await logOpsEvent(supabase, {
        level: "info",
        event: "ops_tenant_restore_dispatch",
        message: `Restore do tenant disparado (target=${target}).`,
        context: {
          action,
          empresa_id: empresaIdStr,
          target,
          r2_key: r2Key,
          workflow: "tenant-restore-from-r2.yml",
          github_repo: githubRepo,
          github_ref: githubRef,
          run_url: runUrl,
          actor_id: user.id,
          actor_email: user.email,
        },
      });

      return json(200, { ok: true, kind: "tenant_restore", run_url: runUrl }, corsHeaders);
    }

    return json(400, { ok: false, error: "invalid_action", message: "Informe action=backup, action=restore, ou action=restore_latest." }, corsHeaders);
  } catch (e: any) {
    return json(500, { ok: false, error: "internal_server_error", message: e?.message ?? "Erro interno." }, buildCorsHeaders(req));
  }
});
